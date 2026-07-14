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

function memoryStore() {
  const users = new Map();
  const identities = new Map();
  const sessions = new Map();
  const oauth = new Map();
  return {
    users,
    identities,
    sessions,
    oauth,
    async getUser(id) { return users.get(id) || null; },
    async putUser(user) { users.set(user.id, user); },
    async listUsers() { return [...users.values()]; },
    async getIdentity(provider, id) { return identities.get(`${provider}:${id}`) || null; },
    async putIdentity(identity) { identities.set(`${identity.provider}:${identity.providerUserId}`, identity); },
    async getSession(id) { return sessions.get(id) || null; },
    async putSession(session) { sessions.set(session.id, session); },
    async deleteSession(id) { sessions.delete(id); },
    async getOAuthTransaction(state) { return oauth.get(state) || null; },
    async putOAuthTransaction(transaction) { oauth.set(transaction.state, transaction); },
    async deleteOAuthTransaction(state) { oauth.delete(state); },
    async getSetting() { return null; },
    async putSetting() {},
  };
}

function context({ path, method = "GET", env, store, cookie = "", form = {}, fetcher }) {
  const cookies = parseCookies(cookie);
  return {
    method,
    url: new URL(`https://preview.example${path}`),
    secure: true,
    getCookie: (name) => cookies[name],
    readJson: async () => ({}),
    readForm: async () => form,
    env,
    store,
    fetcher,
  };
}

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
  await assert.rejects(verifyAppleIdentityToken(`${valid.slice(0, -1)}x`, { clientId: "com.example.web", nonce: "expected-nonce", fetcher }));
});

test("Apple callback은 최초 이름·private email을 저장하고 이후 누락 시 유지한다", async () => {
  const { providerKeys, publicJwk, privateKey } = await createAppleKeys();
  const store = memoryStore();
  const env = {
    APP_ENV: "test",
    SESSION_SECRET: TEST_SECRET,
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
      if (String(url) === "https://appleid.apple.com/auth/token") return Response.json({ access_token: "apple-access", id_token: idToken });
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
});
