import test from "node:test";
import assert from "node:assert/strict";
import { handleAccountApi, parseCookies, verifyAppleIdentityToken } from "./auth-service.mjs";

const encoder = new TextEncoder();
const TEST_SECRET = "test-session-secret-that-is-longer-than-32-characters";

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

async function createAppleKeys() {
  const providerKeys = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const clientKeys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicJwk = await crypto.subtle.exportKey("jwk", providerKeys.publicKey);
  publicJwk.kid = "apple-test-key";
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", clientKeys.privateKey)).toString("base64");
  const privateKey = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----`;
  return { providerKeys, publicJwk, privateKey };
}

async function appleToken(privateKey, overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const headerPart = base64url(JSON.stringify({ alg: "RS256", kid: "apple-test-key", typ: "JWT" }));
  const payloadPart = base64url(JSON.stringify({
    iss: "https://appleid.apple.com",
    aud: "com.example.web",
    exp: now + 300,
    iat: now,
    sub: "apple-subject",
    nonce: "expected-nonce",
    email: "relay@privaterelay.appleid.com",
    ...overrides,
  }));
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, encoder.encode(`${headerPart}.${payloadPart}`));
  return `${headerPart}.${payloadPart}.${base64url(Buffer.from(signature))}`;
}

function tamperJwtSignature(token) {
  const parts = token.split(".");
  assert.equal(parts.length, 3);
  const signature = Buffer.from(parts[2], "base64url");
  assert.ok(signature.length > 0);
  const tamperedSignature = Buffer.from(signature);
  tamperedSignature[0] ^= 0x01;
  return `${parts[0]}.${parts[1]}.${base64url(tamperedSignature)}`;
}

function memoryStore() {
  const users = new Map();
  const identities = new Map();
  const sessions = new Map();
  const oauth = new Map();
  const appStates = new Map();
  return {
    users,
    identities,
    sessions,
    oauth,
    appStates,
    async getUser(id) { return users.get(id) || null; },
    async putUser(user) { users.set(user.id, user); },
    async listUsers() { return [...users.values()]; },
    async deleteUser(id) { users.delete(id); },
    async getAppState(userId) { return appStates.get(userId) || null; },
    async putAppState(userId, record) { appStates.set(userId, record); },
    async deleteAppState(userId) { appStates.delete(userId); },
    async getIdentity(provider, id) { return identities.get(`${provider}:${id}`) || null; },
    async putIdentity(identity) { identities.set(`${identity.provider}:${identity.providerUserId}`, identity); },
    async deleteIdentitiesByUserId(userId) {
      for (const [key, identity] of identities) if (identity.userId === userId) identities.delete(key);
    },
    async getSession(id) { return sessions.get(id) || null; },
    async putSession(session) { sessions.set(session.id, session); },
    async deleteSession(id) { sessions.delete(id); },
    async deleteSessionsByUserId(userId) {
      for (const [key, session] of sessions) if (session.userId === userId) sessions.delete(key);
    },
    async getOAuthTransaction(state) { return oauth.get(state) || null; },
    async putOAuthTransaction(transaction) { oauth.set(transaction.state, transaction); },
    async deleteOAuthTransaction(state) { oauth.delete(state); },
    async getSetting() { return null; },
    async putSetting() {},
  };
}

function context({ path, method = "GET", env, store, legalStore, cookie = "", body = {}, form = {}, fetcher, origin = "https://preview.example" }) {
  const cookies = parseCookies(cookie);
  return {
    method,
    url: new URL(path, `${origin}/`),
    secure: true,
    getCookie: (name) => cookies[name],
    readJson: async () => body,
    readForm: async () => form,
    env,
    store,
    legalStore,
    fetcher,
  };
}

function decodeJwtPart(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

test("Apple Provider 설정과 Preview authorize·취소·이메일 없는 재로그인은 공식 web flow를 따른다", async () => {
  const { providerKeys, publicJwk, privateKey } = await createAppleKeys();
  const previewOrigin = "https://on-my-way-pr-9.jungslawyer.workers.dev";
  const expectedCallback = `${previewOrigin}/api/auth/callback/apple`;
  const complete = {
    APP_ENV: "test",
    SESSION_SECRET: TEST_SECRET,
    APPLE_LOGIN_VISIBLE: "true",
    APPLE_CLIENT_ID: "com.example.web",
    APPLE_TEAM_ID: "TEAMID1234",
    APPLE_KEY_ID: "KEYID12345",
    APPLE_PRIVATE_KEY: privateKey,
  };

  for (const missing of [null, "APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"]) {
    const env = { ...complete };
    if (missing) delete env[missing];
    const result = await handleAccountApi(context({ path: "/api/auth/providers", env, store: memoryStore(), origin: previewOrigin }));
    const apple = result.json.providers.find(({ id }) => id === "apple");
    assert.equal(apple.configured, missing === null);
    assert.equal(apple.visible, true);
    assert.deepEqual(Object.keys(apple).sort(), ["configured", "id", "label", "visible"]);
  }

  const store = memoryStore();
  const startAppleLogin = async () => {
    const start = await handleAccountApi(context({ path: "/api/auth/apple/start?redirect=%2Fapp.html", env: complete, store, origin: previewOrigin }));
    assert.equal(start.status, 302);
    const authorization = new URL(start.redirect);
    const state = authorization.searchParams.get("state");
    const nonce = authorization.searchParams.get("nonce");
    assert.equal(authorization.origin, "https://appleid.apple.com");
    assert.equal(authorization.pathname, "/auth/authorize");
    assert.equal(authorization.searchParams.get("client_id"), "com.example.web");
    assert.equal(authorization.searchParams.get("redirect_uri"), expectedCallback);
    assert.equal(authorization.searchParams.get("response_type"), "code");
    assert.equal(authorization.searchParams.get("response_mode"), "form_post");
    assert.equal(authorization.searchParams.get("scope"), "name email");
    assert.ok(state);
    assert.ok(nonce);
    assert.equal(store.oauth.get(state).nonce, nonce);
    assert.match(start.cookies[0], new RegExp(`omw_oauth_state=${state}`));
    return { state, nonce };
  };

  const mismatched = await startAppleLogin();
  const mismatch = await handleAccountApi(context({
    path: "/api/auth/callback/apple",
    method: "POST",
    env: complete,
    store,
    cookie: `omw_oauth_state=${mismatched.state}`,
    form: { error: "user_cancelled_authorize", state: "attacker-state" },
    origin: previewOrigin,
  }));
  assert.match(mismatch.redirect, /auth=invalid_state/);
  assert.equal(store.oauth.has(mismatched.state), true);

  const cancelled = await startAppleLogin();
  const cancellation = await handleAccountApi(context({
    path: "/api/auth/callback/apple",
    method: "POST",
    env: complete,
    store,
    cookie: `omw_oauth_state=${cancelled.state}`,
    form: { error: "user_cancelled_authorize", state: cancelled.state },
    origin: previewOrigin,
  }));
  assert.equal(cancellation.redirect, "/app.html?auth=cancelled&provider=apple");
  assert.equal(store.sessions.size, 0);

  const missingRefresh = await startAppleLogin();
  const missingRefreshToken = await handleAccountApi(context({
    path: "/api/auth/callback/apple",
    method: "POST",
    env: complete,
    store,
    cookie: `omw_oauth_state=${missingRefresh.state}`,
    form: { code: "authorization-code", state: missingRefresh.state },
    fetcher: async () => Response.json({ access_token: "test-apple-access", id_token: "test-apple-id-token" }),
    origin: previewOrigin,
  }));
  assert.match(missingRefreshToken.redirect, /auth=callback_error/);
  assert.equal(store.sessions.size, 0);
  assert.equal(store.users.size, 0);

  const signIn = async () => {
    const { state, nonce } = await startAppleLogin();
    const idToken = await appleToken(providerKeys.privateKey, { nonce, email: undefined });
    const fetcher = async (url, options = {}) => {
      if (String(url) === "https://appleid.apple.com/auth/token") {
        assert.equal(options.method, "POST");
        assert.equal(options.headers["Content-Type"], "application/x-www-form-urlencoded");
        const tokenRequest = new URLSearchParams(options.body);
        assert.equal(tokenRequest.get("grant_type"), "authorization_code");
        assert.equal(tokenRequest.get("client_id"), "com.example.web");
        assert.equal(tokenRequest.get("redirect_uri"), expectedCallback);
        assert.equal(tokenRequest.get("code"), "authorization-code");
        const clientSecret = tokenRequest.get("client_secret");
        const [headerPart, payloadPart, signaturePart] = clientSecret.split(".");
        assert.deepEqual(decodeJwtPart(headerPart), { alg: "ES256", kid: "KEYID12345", typ: "JWT" });
        const claims = decodeJwtPart(payloadPart);
        assert.equal(claims.iss, "TEAMID1234");
        assert.equal(claims.aud, "https://appleid.apple.com");
        assert.equal(claims.sub, "com.example.web");
        assert.ok(claims.exp > claims.iat && claims.exp - claims.iat <= 300);
        assert.ok(signaturePart);
        return Response.json({ access_token: "test-apple-access", refresh_token: "test-apple-refresh", id_token: idToken });
      }
      assert.equal(String(url), "https://appleid.apple.com/auth/keys");
      return Response.json({ keys: [publicJwk] });
    };
    return handleAccountApi(context({
      path: "/api/auth/callback/apple",
      method: "POST",
      env: complete,
      store,
      cookie: `omw_oauth_state=${state}`,
      form: { code: "authorization-code", state },
      fetcher,
      origin: previewOrigin,
    }));
  };

  const first = await signIn();
  assert.equal(first.redirect, "/app.html?auth=success");
  const createdUser = [...store.users.values()][0];
  assert.equal(createdUser.provider, "apple");
  assert.equal(createdUser.email, "");
  assert.equal(createdUser.appleRefreshToken, "test-apple-refresh");
  assert.equal(store.identities.get("apple:apple-subject").userId, createdUser.id);
  const current = await handleAccountApi(context({
    path: "/api/auth/me",
    env: complete,
    store,
    cookie: first.cookies[0],
    origin: previewOrigin,
  }));
  assert.equal(current.json.user.id, createdUser.id);
  assert.equal(Object.hasOwn(current.json.user, "appleRefreshToken"), false);

  const second = await signIn();
  assert.equal(second.redirect, "/app.html?auth=success");
  assert.equal(store.users.size, 1);
  assert.equal([...store.users.values()][0].id, createdUser.id);
  assert.equal(store.sessions.size, 2);
});

test("Apple identity token은 서명, issuer, audience, 만료, nonce와 subject를 검증한다", async () => {
  const { providerKeys, publicJwk } = await createAppleKeys();
  const fetcher = async () => Response.json({ keys: [publicJwk] });
  const valid = await appleToken(providerKeys.privateKey);
  assert.equal((await verifyAppleIdentityToken(valid, { clientId: "com.example.web", nonce: "expected-nonce", fetcher })).sub, "apple-subject");

  for (const [name, overrides, options = {}] of [
    ["issuer", { iss: "https://attacker.example" }],
    ["audience", { aud: "wrong-client" }],
    ["expiration", { exp: Math.floor(Date.now() / 1000) - 10 }],
    ["nonce", { nonce: "wrong" }],
    ["subject", { sub: "" }],
  ]) {
    const token = await appleToken(providerKeys.privateKey, overrides);
    await assert.rejects(verifyAppleIdentityToken(token, { clientId: "com.example.web", nonce: options.nonce || "expected-nonce", fetcher }), undefined, name);
  }
  const tampered = tamperJwtSignature(valid);
  await assert.rejects(verifyAppleIdentityToken(tampered, { clientId: "com.example.web", nonce: "expected-nonce", fetcher }));
});

test("Apple callback은 최초 이름·private email을 저장하고 이후 누락 시 유지한다", async () => {
  const { providerKeys, publicJwk, privateKey } = await createAppleKeys();
  const store = memoryStore();
  const env = {
    APP_ENV: "test",
    SESSION_SECRET: TEST_SECRET,
    APPLE_LOGIN_VISIBLE: "true",
    APPLE_CLIENT_ID: "com.example.web",
    APPLE_TEAM_ID: "TEAMID1234",
    APPLE_KEY_ID: "KEYID12345",
    APPLE_PRIVATE_KEY: privateKey,
  };

  const signIn = async ({ includeProfile }) => {
    const start = await handleAccountApi(context({ path: "/api/auth/apple/start", env, store }));
    const authorization = new URL(start.redirect);
    const state = authorization.searchParams.get("state");
    const nonce = authorization.searchParams.get("nonce");
    const idToken = await appleToken(providerKeys.privateKey, { nonce, email: includeProfile ? "relay@privaterelay.appleid.com" : undefined });
    const fetcher = async (url) => {
      if (String(url) === "https://appleid.apple.com/auth/token") return Response.json({ access_token: "apple-access", refresh_token: "apple-refresh", id_token: idToken });
      return Response.json({ keys: [publicJwk] });
    };
    return handleAccountApi(context({
      path: "/api/auth/callback/apple",
      method: "POST",
      env,
      store,
      cookie: `omw_oauth_state=${state}`,
      form: {
        code: "authorization-code",
        state,
        ...(includeProfile ? { user: JSON.stringify({ name: { firstName: "길동", lastName: "홍" }, email: "relay@privaterelay.appleid.com" }) } : {}),
      },
      fetcher,
    }));
  };

  const first = await signIn({ includeProfile: true });
  assert.match(first.redirect, /auth=success/);
  const user = [...store.users.values()][0];
  assert.equal(user.name, "길동 홍");
  assert.equal(user.email, "relay@privaterelay.appleid.com");

  const second = await signIn({ includeProfile: false });
  assert.match(second.redirect, /auth=success/);
  assert.equal([...store.users.values()][0].name, "길동 홍");
  assert.equal([...store.users.values()][0].email, "relay@privaterelay.appleid.com");
  assert.equal([...store.users.values()][0].appleRefreshToken, "apple-refresh");
});

test("Apple 계정 탈퇴는 refresh token을 revoke한 뒤 세션과 identity를 삭제한다", async () => {
  const { providerKeys, publicJwk, privateKey } = await createAppleKeys();
  const env = {
    APP_ENV: "test",
    SESSION_SECRET: TEST_SECRET,
    APPLE_LOGIN_VISIBLE: "true",
    APPLE_CLIENT_ID: "com.example.web",
    APPLE_TEAM_ID: "TEAMID1234",
    APPLE_KEY_ID: "KEYID12345",
    APPLE_PRIVATE_KEY: privateKey,
  };

  const signedInAccount = async () => {
    const store = memoryStore();
    const start = await handleAccountApi(context({ path: "/api/auth/apple/start", env, store }));
    const authorization = new URL(start.redirect);
    const state = authorization.searchParams.get("state");
    const idToken = await appleToken(providerKeys.privateKey, { nonce: authorization.searchParams.get("nonce") });
    const login = await handleAccountApi(context({
      path: "/api/auth/callback/apple",
      method: "POST",
      env,
      store,
      cookie: `omw_oauth_state=${state}`,
      form: { code: "authorization-code", state },
      fetcher: async (url) => String(url) === "https://appleid.apple.com/auth/token"
        ? Response.json({ access_token: "apple-access", refresh_token: "apple-refresh", id_token: idToken })
        : Response.json({ keys: [publicJwk] }),
    }));
    return { store, login };
  };

  const failed = await signedInAccount();
  const failedDeletion = await handleAccountApi(context({
    path: "/api/account/delete",
    method: "POST",
    env,
    store: failed.store,
    cookie: failed.login.cookies[0],
    body: { confirmation: "계정 삭제" },
    fetcher: async () => Response.json({ error: "invalid_client" }, { status: 400 }),
  }));
  assert.equal(failedDeletion.status, 502);
  assert.equal([...failed.store.users.values()][0].status, "active");
  assert.equal(failed.store.identities.size, 1);
  assert.equal(failed.store.sessions.size, 1);

  const successful = await signedInAccount();
  let revoked = false;
  const deletion = await handleAccountApi(context({
    path: "/api/account/delete",
    method: "POST",
    env,
    store: successful.store,
    cookie: successful.login.cookies[0],
    body: { confirmation: "계정 삭제" },
    fetcher: async (url, options = {}) => {
      assert.equal(String(url), "https://appleid.apple.com/auth/revoke");
      assert.equal(options.method, "POST");
      const revokeRequest = new URLSearchParams(options.body);
      assert.equal(revokeRequest.get("client_id"), "com.example.web");
      assert.equal(revokeRequest.get("token"), "apple-refresh");
      assert.equal(revokeRequest.get("token_type_hint"), "refresh_token");
      assert.equal(revokeRequest.get("client_secret").split(".").length, 3);
      revoked = true;
      return new Response(null, { status: 200 });
    },
  }));
  assert.equal(deletion.status, 202);
  assert.equal(revoked, true);
  assert.equal([...successful.store.users.values()][0].status, "deletion_pending");
  assert.equal(successful.store.identities.size, 0);
  assert.equal(successful.store.sessions.size, 0);
});
