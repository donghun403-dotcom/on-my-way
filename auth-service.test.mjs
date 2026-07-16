import test from "node:test";
import assert from "node:assert/strict";
import {
  createKvStore,
  createSessionToken,
  verifySessionToken,
  handleAccountApi,
  parseCookies,
  renewDueSubscriptions,
  purgeDueAccountDeletions,
  upsertUserFromProfile,
} from "./auth-service.mjs";
import { commitAiCredits, getAiCreditUsage, reserveAiCredits, startAiTrial } from "./ai-credits-service.mjs";
import worker, { createGoalPlanForUser } from "./worker.mjs";

function memoryStore(seed = []) {
  const users = new Map(seed.map((user) => [user.id, user]));
  const settings = new Map();
  const identities = new Map();
  const sessions = new Map();
  const oauth = new Map();
  const appStates = new Map();
  return {
    users,
    settings,
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
    async getIdentity(provider, providerUserId) { return identities.get(`${provider}:${providerUserId}`) || null; },
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
    async getSetting(name) { return settings.get(name) || null; },
    async putSetting(name, value) { settings.set(name, value); },
  };
}

const TEST_SECRET = "test-session-secret-that-is-longer-than-32-characters";
const testEnv = (overrides = {}) => ({ APP_ENV: "test", SESSION_SECRET: TEST_SECRET, ...overrides });

function context({ path, method = "GET", env = {}, store, legalStore, body = {}, form = {}, cookie = "", fetcher, origin = "https://example.test" }) {
  const cookies = parseCookies(cookie);
  return {
    method,
    url: new URL(path, `${origin}/`),
    secure: true,
    getCookie: (name) => cookies[name],
    readJson: async () => body,
    readForm: async () => form,
    fetcher,
    env,
    store,
    legalStore,
  };
}

test("서명 세션은 변조와 만료를 거부한다", async () => {
  const valid = await createSessionToken({ sid: "session-1", sub: "usr_1", exp: Date.now() + 1000 }, TEST_SECRET);
  assert.equal((await verifySessionToken(valid, TEST_SECRET)).sub, "usr_1");
  assert.equal(await verifySessionToken(`${valid}x`, TEST_SECRET), null);
  const expired = await createSessionToken({ sid: "session-1", sub: "usr_1", exp: Date.now() - 1 }, TEST_SECRET);
  assert.equal(await verifySessionToken(expired, TEST_SECRET), null);
  assert.equal(await verifySessionToken("malformed", TEST_SECRET), null);
  assert.equal(await verifySessionToken(await createSessionToken({ sid: "session-1", exp: Date.now() + 1000 }, TEST_SECRET), TEST_SECRET), null);
  assert.equal(await verifySessionToken(await createSessionToken({ sid: "session-1", sub: "usr_1", iss: "wrong", exp: Date.now() + 1000 }, TEST_SECRET), TEST_SECRET), null);
  assert.equal(await verifySessionToken(await createSessionToken({ sid: "session-1", sub: "usr_1", aud: "wrong", exp: Date.now() + 1000 }, TEST_SECRET), TEST_SECRET), null);
});

test("배포 기본값에서는 데모 로그인을 허용하지 않는다", async () => {
  const result = await handleAccountApi(context({
    path: "/api/auth/dev-login",
    method: "POST",
    env: { SESSION_SECRET: "secret" },
    store: memoryStore(),
    body: { provider: "google", name: "회원" },
  }));
  assert.equal(result.status, 403);
});

test("신규 소셜 회원은 체험을 자동 시작하지 않고 Free로 생성된다", async () => {
  const store = memoryStore();
  const result = await handleAccountApi(context({
    path: "/api/auth/dev-login",
    method: "POST",
    env: testEnv({ ALLOW_DEV_LOGIN: "true" }),
    store,
    body: { provider: "kakao", name: "테스트", email: "member@example.com" },
  }));
  assert.equal(result.status, 200);
  assert.equal(result.json.user.plan, "free");
  assert.equal(result.json.user.trialStartedAt, null);
  assert.equal(result.json.user.trialExpiresAt, null);
  assert.equal(result.json.user.trialUsedAt, null);
  assert.match(result.cookies[0], /HttpOnly/);
  assert.match(result.cookies[0], /Secure/);
});

test("KV 저장소는 삭제 tombstone과 체험 표식에 절대 만료 시각을 적용한다", async () => {
  const writes = [];
  const deletes = [];
  const kv = {
    async put(key, value, options) { writes.push({ key, value, options }); },
    async delete(key) { deletes.push(key); },
  };
  const store = createKvStore(kv);
  const expiresAt = Date.parse("2027-01-15T03:00:00.000Z");

  await store.putUser({ id: "pending-user", status: "deletion_pending" }, { expiresAt });
  await store.putSetting("ai-trial-used:pending-user", { usedAt: 1, expiresAt }, { expiresAt });
  await store.deleteSetting("ai-trial-used:pending-user");

  assert.deepEqual(writes.map(({ key, options }) => ({ key, options })), [
    { key: "user:pending-user", options: { expiration: Math.floor(expiresAt / 1000) } },
    { key: "setting:ai-trial-used:pending-user", options: { expiration: Math.floor(expiresAt / 1000) } },
  ]);
  assert.deepEqual(deletes, ["setting:ai-trial-used:pending-user"]);
});

test("Free 회원의 Pro 체험은 명시적으로 한 번만 시작되고 24시간 뒤 Free로 돌아간다", async () => {
  const now = Date.parse("2026-01-15T03:00:00.000Z");
  const user = { id: "google:explicit-trial", status: "active", role: "member", plan: "free", createdAt: now - 1 };
  const store = memoryStore([user]);

  const started = await startAiTrial({ store, userId: user.id, now });
  assert.equal(started.started, true);
  assert.equal(started.usage.plan, "trial");
  assert.equal(user.plan, "trial");
  assert.equal(user.trialExpiresAt - user.trialStartedAt, 24 * 60 * 60 * 1000);

  const repeated = await startAiTrial({ store, userId: user.id, now: now + 1 });
  assert.equal(repeated.started, false);
  assert.equal(repeated.idempotent, true);
  assert.equal(user.trialExpiresAt, now + 24 * 60 * 60 * 1000);

  const expired = await getAiCreditUsage({ store, userId: user.id, now: now + 24 * 60 * 60 * 1000 });
  assert.equal(expired.plan, "free");
  assert.equal(expired.trial.eligible, false);
  assert.equal(user.plan, "free");
  await assert.rejects(
    startAiTrial({ store, userId: user.id, now: now + 24 * 60 * 60 * 1000 + 1 }),
    (error) => error.status === 409 && error.code === "TRIAL_ALREADY_USED",
  );
});

test("허용 목록 이메일만 관리자가 된다", async () => {
  const store = memoryStore();
  const env = testEnv({ ALLOW_DEV_LOGIN: "true", ADMIN_EMAILS: "admin@example.com" });
  const login = await handleAccountApi(context({
    path: "/api/auth/dev-login",
    method: "POST",
    env,
    store,
    body: { provider: "google", name: "관리자", email: "admin@example.com" },
  }));
  assert.equal(login.json.user.role, "admin");
  const sessionCookie = login.cookies[0].split(";")[0];
  const users = await handleAccountApi(context({ path: "/api/admin/users", env, store, cookie: sessionCookie }));
  assert.equal(users.status, 200);
  assert.equal(users.json.users.length, 1);
});

test("서버 비밀번호 인증은 관리자 세션을 발급한다", async () => {
  const store = memoryStore();
  const env = testEnv({ ADMIN_PASSWORD: "strong-admin-password" });
  const login = await handleAccountApi(context({
    path: "/api/admin/login",
    method: "POST",
    env,
    store,
    body: { password: "strong-admin-password" },
  }));
  assert.equal(login.status, 200);
  assert.equal(login.json.user.role, "admin");
  const sessionCookie = login.cookies[0].split(";")[0];
  const me = await handleAccountApi(context({ path: "/api/auth/me", env, store, cookie: sessionCookie }));
  assert.equal(me.json.user.role, "admin");
});

test("관리자는 임시 비밀번호를 안전하게 교체할 수 있다", async () => {
  const store = memoryStore();
  const env = testEnv({ ADMIN_PASSWORD: "Temporary1!Pass" });
  const login = await handleAccountApi(context({
    path: "/api/admin/login", method: "POST", env, store, body: { password: "Temporary1!Pass" },
  }));
  const sessionCookie = login.cookies[0].split(";")[0];
  const changed = await handleAccountApi(context({
    path: "/api/admin/password",
    method: "POST",
    env,
    store,
    cookie: sessionCookie,
    body: { currentPassword: "Temporary1!Pass", newPassword: "MyNewAdminPass1!" },
  }));
  assert.equal(changed.status, 200);
  assert.equal(store.settings.get("admin_password").algorithm, "HMAC-SHA256-PEPPERED");
  assert.equal("password" in store.settings.get("admin_password"), false);
  assert.notEqual(store.settings.get("admin_password").hash, "MyNewAdminPass1!");

  const oldLogin = await handleAccountApi(context({
    path: "/api/admin/login", method: "POST", env, store, body: { password: "Temporary1!Pass" },
  }));
  assert.equal(oldLogin.status, 401);
  const newLogin = await handleAccountApi(context({
    path: "/api/admin/login", method: "POST", env, store, body: { password: "MyNewAdminPass1!" },
  }));
  assert.equal(newLogin.status, 200);
});

test("Provider identity는 이메일이 아니라 서버 내부 사용자 ID에 연결된다", async () => {
  const store = memoryStore();
  const env = testEnv();
  const googleUser = await upsertUserFromProfile(store, env, "google", {
    providerUserId: "google-subject",
    name: "Google 회원",
    email: "same@example.com",
  });
  const kakaoUser = await upsertUserFromProfile(store, env, "kakao", {
    providerUserId: "kakao-subject",
    name: "Kakao 회원",
    email: "same@example.com",
  });
  assert.match(googleUser.id, /^usr_/);
  assert.match(kakaoUser.id, /^usr_/);
  assert.notEqual(googleUser.id, kakaoUser.id);
  assert.equal(store.identities.get("google:google-subject").userId, googleUser.id);
  assert.equal(store.identities.get("kakao:kakao-subject").userId, kakaoUser.id);
});

test("OAuth 프로필 갱신과 AI 차감이 겹쳐도 최신 사용자 필드를 서로 덮어쓰지 않는다", async () => {
  const store = memoryStore();
  const env = testEnv();
  const user = await upsertUserFromProfile(store, env, "google", {
    providerUserId: "profile-credit-race",
    name: "이전 이름",
    email: "race@example.com",
  });
  const originalGetUser = store.getUser.bind(store);
  let releaseProfileRead;
  let markProfileRead;
  let pauseNextProfileRead = true;
  const profileRead = new Promise((resolve) => { markProfileRead = resolve; });
  const profileGate = new Promise((resolve) => { releaseProfileRead = resolve; });
  store.getUser = async (id) => {
    const snapshot = JSON.parse(JSON.stringify(await originalGetUser(id)));
    if (pauseNextProfileRead && id === user.id) {
      pauseNextProfileRead = false;
      markProfileRead();
      await profileGate;
    }
    return snapshot;
  };

  const profilePromise = upsertUserFromProfile(store, env, "google", {
    providerUserId: "profile-credit-race",
    name: "새 이름",
    email: "race@example.com",
  });
  await profileRead;
  const creditPromise = (async () => {
    await reserveAiCredits({ store, userId: user.id, action: "companion_chat", requestId: "profile-race-credit" });
    await commitAiCredits({ store, userId: user.id, requestId: "profile-race-credit" });
  })();
  releaseProfileRead();
  await Promise.all([profilePromise, creditPromise]);

  const latest = await originalGetUser(user.id);
  assert.equal(latest.name, "새 이름");
  assert.equal(latest.aiCredits.requests["profile-race-credit"].status, "committed");
  assert.equal(latest.aiCredits.usage.day.used, 1);
});

test("클라이언트가 전달한 userId는 데모 identity 생성에 사용되지 않는다", async () => {
  const store = memoryStore();
  const result = await handleAccountApi(context({
    path: "/api/auth/dev-login",
    method: "POST",
    env: testEnv({ ALLOW_DEV_LOGIN: "true" }),
    store,
    body: { provider: "google", name: "회원", userId: "admin:password" },
  }));
  assert.match(result.json.user.id, /^usr_/);
  assert.notEqual(result.json.user.id, "admin:password");
});

test("Provider 목록은 네 로그인을 노출하고 외부 설정 상태만 공개한다", async () => {
  const result = await handleAccountApi(context({ path: "/api/auth/providers", env: testEnv(), store: memoryStore() }));
  assert.deepEqual(result.json.providers.map(({ id }) => id), ["kakao", "naver", "google", "apple"]);
  assert.equal(result.json.providers.every(({ configured }) => configured === false), true);
});

test("Google provider is configured only when both expected client variables exist", async () => {
  const configurations = [
    [{}, false],
    [{ GOOGLE_CLIENT_ID: "test-google-client-id" }, false],
    [{ GOOGLE_CLIENT_SECRET: "test-google-client-secret" }, false],
    [{ GOOGLE_CLIENT_ID: "test-google-client-id", GOOGLE_CLIENT_SECRET: "test-google-client-secret" }, true],
  ];
  for (const [overrides, expected] of configurations) {
    const result = await handleAccountApi(context({ path: "/api/auth/providers", env: testEnv(overrides), store: memoryStore() }));
    const google = result.json.providers.find(({ id }) => id === "google");
    assert.equal(google.configured, expected);
    assert.deepEqual(Object.keys(google).sort(), ["configured", "id", "label"]);
  }
});

test("Naver provider는 Client ID와 Client Secret이 모두 있을 때만 설정 상태를 공개한다", async () => {
  const configurations = [
    [{}, false],
    [{ NAVER_CLIENT_ID: "test-naver-client-id" }, false],
    [{ NAVER_CLIENT_SECRET: "test-naver-client-secret" }, false],
    [{ NAVER_CLIENT_ID: "test-naver-client-id", NAVER_CLIENT_SECRET: "test-naver-client-secret" }, true],
  ];
  for (const [overrides, expected] of configurations) {
    const result = await handleAccountApi(context({ path: "/api/auth/providers", env: testEnv(overrides), store: memoryStore() }));
    const naver = result.json.providers.find(({ id }) => id === "naver");
    assert.equal(naver.configured, expected);
    assert.deepEqual(Object.keys(naver).sort(), ["configured", "id", "label"]);
  }
});

test("Kakao provider는 REST API 키를 기준으로 설정 상태를 공개한다", async () => {
  const configurations = [
    [{}, false],
    [{ KAKAO_CLIENT_SECRET: "test-kakao-client-secret" }, false],
    [{ KAKAO_CLIENT_ID: "test-kakao-rest-api-key" }, true],
    [{ KAKAO_CLIENT_ID: "test-kakao-rest-api-key", KAKAO_CLIENT_SECRET: "test-kakao-client-secret" }, true],
  ];
  for (const [overrides, expected] of configurations) {
    const result = await handleAccountApi(context({ path: "/api/auth/providers", env: testEnv(overrides), store: memoryStore() }));
    const kakao = result.json.providers.find(({ id }) => id === "kakao");
    assert.equal(kakao.configured, expected);
    assert.deepEqual(Object.keys(kakao).sort(), ["configured", "id", "label"]);
  }
});

test("OAuth 시작은 allowlist, redirect allowlist, PKCE와 일회용 transaction을 적용한다", async () => {
  const store = memoryStore();
  const env = testEnv({ GOOGLE_CLIENT_ID: "google-client", GOOGLE_CLIENT_SECRET: "google-secret" });
  const unsupported = await handleAccountApi(context({ path: "/api/auth/start?provider=github", env, store }));
  assert.equal(unsupported.status, 400);

  const result = await handleAccountApi(context({
    path: "/api/auth/google/start?redirect=https%3A%2F%2Fattacker.example%2Fsteal",
    env,
    store,
  }));
  assert.equal(result.status, 302);
  const authorization = new URL(result.redirect);
  assert.equal(authorization.origin, "https://accounts.google.com");
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  assert.ok(authorization.searchParams.get("code_challenge"));
  const transaction = [...store.oauth.values()][0];
  assert.equal(transaction.redirect, "/app.html");
  assert.ok(transaction.codeVerifier);
  assert.match(result.cookies[0], /HttpOnly/);

  const deleteReturnStore = memoryStore();
  await handleAccountApi(context({ path: "/api/auth/google/start?redirect=%2Fdelete-account", env, store: deleteReturnStore }));
  assert.equal([...deleteReturnStore.oauth.values()][0].redirect, "/delete-account");
});

test("Google OAuth uses the Preview callback, PKCE, secure host-only cookies, and blocks deletion-pending relogin", async () => {
  const previewOrigin = "https://on-my-way-pr-3.jungslawyer.workers.dev";
  const expectedCallback = `${previewOrigin}/api/auth/callback/google`;
  const env = testEnv({
    GOOGLE_CLIENT_ID: "test-google-client-id",
    GOOGLE_CLIENT_SECRET: "test-google-client-secret",
    IDENTITY_SECRET: "test-identity-secret-that-is-longer-than-32-characters",
  });
  const store = memoryStore();
  let expectedCodeVerifier = "";

  const startGoogleLogin = async () => {
    const start = await handleAccountApi(context({
      path: "/api/auth/google/start?redirect=%2Fapp.html",
      env,
      store,
      origin: previewOrigin,
    }));
    assert.equal(start.status, 302);
    const authorization = new URL(start.redirect);
    assert.equal(authorization.origin, "https://accounts.google.com");
    assert.equal(authorization.searchParams.get("redirect_uri"), expectedCallback);
    assert.equal(authorization.searchParams.get("scope"), "openid email profile");
    assert.equal(authorization.searchParams.get("response_type"), "code");
    assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
    assert.ok(authorization.searchParams.get("code_challenge"));
    assert.equal(authorization.searchParams.has("nonce"), false);
    assert.match(start.cookies[0], /Path=\//);
    assert.match(start.cookies[0], /SameSite=Lax/);
    assert.match(start.cookies[0], /HttpOnly/);
    assert.match(start.cookies[0], /Secure/);
    assert.doesNotMatch(start.cookies[0], /Domain=/i);
    return { authorization, transaction: store.oauth.get(authorization.searchParams.get("state")) };
  };

  const fetcher = async (url, options = {}) => {
    if (String(url) === "https://oauth2.googleapis.com/token") {
      const body = new URLSearchParams(options.body);
      assert.equal(options.method, "POST");
      assert.equal(body.get("grant_type"), "authorization_code");
      assert.equal(body.get("redirect_uri"), expectedCallback);
      assert.equal(body.get("code_verifier"), expectedCodeVerifier);
      return Response.json({ access_token: "test-access-token" });
    }
    assert.equal(String(url), "https://openidconnect.googleapis.com/v1/userinfo");
    assert.equal(options.headers.Authorization, "Bearer test-access-token");
    return Response.json({ sub: "google-preview-subject", name: "Google Preview User", email: "preview@example.com" });
  };

  const first = await startGoogleLogin();
  assert.ok(first.transaction);
  assert.equal(first.transaction.codeVerifier.length, 64);
  expectedCodeVerifier = first.transaction.codeVerifier;
  const firstState = first.authorization.searchParams.get("state");
  const success = await handleAccountApi(context({
    path: `/api/auth/callback/google?code=test-code&state=${encodeURIComponent(firstState)}`,
    env,
    store,
    cookie: `omw_oauth_state=${firstState}`,
    fetcher,
    origin: previewOrigin,
  }));
  assert.equal(success.redirect, "/app.html?auth=success");
  assert.equal(store.oauth.has(firstState), false);
  assert.equal(store.sessions.size, 1);
  assert.match(success.cookies[0], /Path=\//);
  assert.match(success.cookies[0], /SameSite=Lax/);
  assert.match(success.cookies[0], /HttpOnly/);
  assert.match(success.cookies[0], /Secure/);
  assert.doesNotMatch(success.cookies[0], /Domain=/i);

  const createdUser = [...store.users.values()][0];
  await store.putUser({ id: createdUser.id, status: "deletion_pending", deletionScheduledAt: Date.now() + 86_400_000 });
  const second = await startGoogleLogin();
  expectedCodeVerifier = second.transaction.codeVerifier;
  const secondState = second.authorization.searchParams.get("state");
  const blocked = await handleAccountApi(context({
    path: `/api/auth/callback/google?code=test-code&state=${encodeURIComponent(secondState)}`,
    env,
    store,
    cookie: `omw_oauth_state=${secondState}`,
    fetcher,
    origin: previewOrigin,
  }));
  assert.match(blocked.redirect, /auth=deletion_pending/);
  assert.equal(store.sessions.size, 1);
  assert.equal(store.oauth.has(secondState), false);
});

test("Kakao OAuth는 Preview callback, state, client secret, 고유 ID와 이메일 없는 재로그인을 처리한다", async () => {
  const previewOrigin = "https://on-my-way-pr-9.jungslawyer.workers.dev";
  const expectedCallback = `${previewOrigin}/api/auth/callback/kakao`;
  const env = testEnv({
    KAKAO_CLIENT_ID: "test-kakao-rest-api-key",
    KAKAO_CLIENT_SECRET: "test-kakao-client-secret",
    IDENTITY_SECRET: "test-identity-secret-that-is-longer-than-32-characters",
  });
  const store = memoryStore();

  const startKakaoLogin = async () => {
    const start = await handleAccountApi(context({
      path: "/api/auth/kakao/start?redirect=%2Fapp.html",
      env,
      store,
      origin: previewOrigin,
    }));
    assert.equal(start.status, 302);
    const authorization = new URL(start.redirect);
    const state = authorization.searchParams.get("state");
    assert.equal(authorization.origin, "https://kauth.kakao.com");
    assert.equal(authorization.pathname, "/oauth/authorize");
    assert.equal(authorization.searchParams.get("client_id"), "test-kakao-rest-api-key");
    assert.equal(authorization.searchParams.get("redirect_uri"), expectedCallback);
    assert.equal(authorization.searchParams.get("response_type"), "code");
    assert.ok(state);
    assert.equal(store.oauth.get(state).provider, "kakao");
    assert.match(start.cookies[0], new RegExp(`omw_oauth_state=${state}`));
    return state;
  };

  const mismatchedState = await startKakaoLogin();
  const mismatch = await handleAccountApi(context({
    path: "/api/auth/callback/kakao?error=access_denied&state=attacker-state",
    env,
    store,
    cookie: `omw_oauth_state=${mismatchedState}`,
    origin: previewOrigin,
  }));
  assert.match(mismatch.redirect, /auth=invalid_state/);
  assert.equal(store.oauth.has(mismatchedState), true);

  const cancelledState = await startKakaoLogin();
  const cancelled = await handleAccountApi(context({
    path: `/api/auth/callback/kakao?error=access_denied&state=${encodeURIComponent(cancelledState)}`,
    env,
    store,
    cookie: `omw_oauth_state=${cancelledState}`,
    origin: previewOrigin,
  }));
  assert.equal(cancelled.redirect, "/app.html?auth=cancelled&provider=kakao");
  assert.equal(store.oauth.has(cancelledState), false);
  assert.equal(store.sessions.size, 0);

  const fetcher = async (url, options = {}) => {
    if (String(url) === "https://kauth.kakao.com/oauth/token") {
      const body = new URLSearchParams(options.body);
      assert.equal(options.method, "POST");
      assert.equal(body.get("grant_type"), "authorization_code");
      assert.equal(body.get("client_id"), "test-kakao-rest-api-key");
      assert.equal(body.get("client_secret"), "test-kakao-client-secret");
      assert.equal(body.get("redirect_uri"), expectedCallback);
      return Response.json({ access_token: "test-kakao-access-token" });
    }
    assert.equal(String(url), "https://kapi.kakao.com/v2/user/me");
    assert.equal(options.headers.Authorization, "Bearer test-kakao-access-token");
    return Response.json({ id: 123456789, kakao_account: { profile: { nickname: "Kakao Preview User" } } });
  };

  const login = async () => {
    const state = await startKakaoLogin();
    return handleAccountApi(context({
      path: `/api/auth/callback/kakao?code=test-code&state=${encodeURIComponent(state)}`,
      env,
      store,
      cookie: `omw_oauth_state=${state}`,
      fetcher,
      origin: previewOrigin,
    }));
  };

  const first = await login();
  assert.equal(first.redirect, "/app.html?auth=success");
  assert.equal(store.users.size, 1);
  const createdUser = [...store.users.values()][0];
  assert.equal(createdUser.provider, "kakao");
  assert.equal(createdUser.email, "");
  assert.equal(store.identities.get("kakao:123456789").userId, createdUser.id);
  assert.equal(store.sessions.size, 1);

  const second = await login();
  assert.equal(second.redirect, "/app.html?auth=success");
  assert.equal(store.users.size, 1);
  assert.equal([...store.users.values()][0].id, createdUser.id);
  assert.equal(store.sessions.size, 2);
});

test("Naver OAuth는 Preview callback, state, 취소, token query와 이메일 없는 재로그인을 처리한다", async () => {
  const previewOrigin = "https://on-my-way-pr-9.jungslawyer.workers.dev";
  const expectedCallback = `${previewOrigin}/api/auth/callback/naver`;
  const env = testEnv({
    NAVER_CLIENT_ID: "test-naver-client-id",
    NAVER_CLIENT_SECRET: "test-naver-client-secret",
    IDENTITY_SECRET: "test-identity-secret-that-is-longer-than-32-characters",
  });
  const store = memoryStore();

  const startNaverLogin = async () => {
    const start = await handleAccountApi(context({
      path: "/api/auth/naver/start?redirect=%2Fapp.html",
      env,
      store,
      origin: previewOrigin,
    }));
    assert.equal(start.status, 302);
    const authorization = new URL(start.redirect);
    const state = authorization.searchParams.get("state");
    assert.equal(authorization.origin, "https://nid.naver.com");
    assert.equal(authorization.pathname, "/oauth2.0/authorize");
    assert.equal(authorization.searchParams.get("client_id"), "test-naver-client-id");
    assert.equal(authorization.searchParams.get("redirect_uri"), expectedCallback);
    assert.equal(authorization.searchParams.get("response_type"), "code");
    assert.ok(state);
    assert.equal(store.oauth.get(state).provider, "naver");
    assert.match(start.cookies[0], new RegExp(`omw_oauth_state=${state}`));
    return state;
  };

  const mismatchedState = await startNaverLogin();
  const mismatch = await handleAccountApi(context({
    path: "/api/auth/callback/naver?error=access_denied&state=attacker-state",
    env,
    store,
    cookie: `omw_oauth_state=${mismatchedState}`,
    origin: previewOrigin,
  }));
  assert.match(mismatch.redirect, /auth=invalid_state/);
  assert.equal(store.oauth.has(mismatchedState), true);

  const cancelledState = await startNaverLogin();
  const cancelled = await handleAccountApi(context({
    path: `/api/auth/callback/naver?error=access_denied&state=${encodeURIComponent(cancelledState)}`,
    env,
    store,
    cookie: `omw_oauth_state=${cancelledState}`,
    origin: previewOrigin,
  }));
  assert.equal(cancelled.redirect, "/app.html?auth=cancelled&provider=naver");
  assert.equal(store.oauth.has(cancelledState), false);
  assert.equal(store.sessions.size, 0);

  const fetcher = async (url, options = {}) => {
    if (String(url).startsWith("https://nid.naver.com/oauth2.0/token?")) {
      const tokenRequest = new URL(url);
      assert.equal(options.method, "GET");
      assert.equal(tokenRequest.searchParams.get("grant_type"), "authorization_code");
      assert.equal(tokenRequest.searchParams.get("client_id"), "test-naver-client-id");
      assert.equal(tokenRequest.searchParams.get("client_secret"), "test-naver-client-secret");
      assert.equal(tokenRequest.searchParams.get("redirect_uri"), expectedCallback);
      assert.equal(tokenRequest.searchParams.get("code"), "test-code");
      assert.ok(tokenRequest.searchParams.get("state"));
      return Response.json({ access_token: "test-naver-token" });
    }
    assert.equal(String(url), "https://openapi.naver.com/v1/nid/me");
    assert.equal(options.headers.Authorization, "Bearer test-naver-token");
    return Response.json({ resultcode: "00", response: { id: "naver-preview-subject", nickname: "Naver Preview User" } });
  };

  const login = async () => {
    const state = await startNaverLogin();
    return handleAccountApi(context({
      path: `/api/auth/callback/naver?code=test-code&state=${encodeURIComponent(state)}`,
      env,
      store,
      cookie: `omw_oauth_state=${state}`,
      fetcher,
      origin: previewOrigin,
    }));
  };

  const first = await login();
  assert.equal(first.redirect, "/app.html?auth=success");
  assert.equal(store.users.size, 1);
  const createdUser = [...store.users.values()][0];
  assert.equal(createdUser.provider, "naver");
  assert.equal(createdUser.email, "");
  assert.equal(store.identities.get("naver:naver-preview-subject").userId, createdUser.id);
  assert.equal(store.sessions.size, 1);

  const second = await login();
  assert.equal(second.redirect, "/app.html?auth=success");
  assert.equal(store.users.size, 1);
  assert.equal([...store.users.values()][0].id, createdUser.id);
  assert.equal(store.sessions.size, 2);
});

test("Apple OAuth 시작은 nonce와 form_post를 사용한다", async () => {
  const store = memoryStore();
  const env = testEnv({ APPLE_CLIENT_ID: "com.example.web", APPLE_TEAM_ID: "TEAMID1234", APPLE_KEY_ID: "KEYID12345", APPLE_PRIVATE_KEY: "configured-secret" });
  const result = await handleAccountApi(context({ path: "/api/auth/apple/start", env, store }));
  const authorization = new URL(result.redirect);
  assert.equal(authorization.origin, "https://appleid.apple.com");
  assert.equal(authorization.searchParams.get("response_mode"), "form_post");
  assert.ok(authorization.searchParams.get("nonce"));
  assert.equal([...store.oauth.values()][0].nonce, authorization.searchParams.get("nonce"));
});

test("OAuth callback은 누락·불일치·만료 state와 replay를 차단한다", async () => {
  const store = memoryStore();
  const env = testEnv({ NAVER_CLIENT_ID: "naver-client", NAVER_CLIENT_SECRET: "naver-secret" });
  const missing = await handleAccountApi(context({ path: "/api/auth/callback/naver?code=x", env, store }));
  assert.match(missing.redirect, /auth=invalid_state/);

  await store.putOAuthTransaction({ state: "expired", provider: "naver", redirect: "/app.html", expiresAt: Date.now() - 1 });
  const expired = await handleAccountApi(context({ path: "/api/auth/callback/naver?code=x&state=expired", env, store, cookie: "omw_oauth_state=expired" }));
  assert.match(expired.redirect, /auth=invalid_state/);

  const start = await handleAccountApi(context({ path: "/api/auth/naver/start", env, store }));
  const state = new URL(start.redirect).searchParams.get("state");
  const cookie = `omw_oauth_state=${state}`;
  const fetcher = async (url) => {
    if (String(url).startsWith("https://nid.naver.com/oauth2.0/token")) return Response.json({ access_token: "provider-token" });
    return Response.json({ response: { id: "naver-subject", nickname: "네이버 회원" } });
  };
  const success = await handleAccountApi(context({ path: `/api/auth/callback/naver?code=valid&state=${state}`, env, store, cookie, fetcher }));
  assert.match(success.redirect, /auth=success/);
  assert.equal(store.oauth.has(state), false);
  const replay = await handleAccountApi(context({ path: `/api/auth/callback/naver?code=valid&state=${state}`, env, store, cookie, fetcher }));
  assert.match(replay.redirect, /auth=invalid_state/);
});

test("Naver token·profile 실패와 provider ID 누락은 세션을 만들지 않는다", async () => {
  const env = testEnv({ NAVER_CLIENT_ID: "naver-client", NAVER_CLIENT_SECRET: "naver-secret" });
  for (const failure of ["token", "profile", "identity"]) {
    const store = memoryStore();
    const start = await handleAccountApi(context({ path: "/api/auth/naver/start", env, store }));
    const state = new URL(start.redirect).searchParams.get("state");
    let call = 0;
    const fetcher = async () => {
      call += 1;
      if (failure === "token") return Response.json({ error: "invalid_grant" }, { status: 400 });
      if (call === 1) return Response.json({ access_token: "provider-token" });
      if (failure === "profile") return Response.json({ error: "provider_unavailable" }, { status: 503 });
      return Response.json({ response: { nickname: "식별자 없는 회원" } });
    };
    const result = await handleAccountApi(context({
      path: `/api/auth/callback/naver?code=code&state=${state}`,
      env,
      store,
      cookie: `omw_oauth_state=${state}`,
      fetcher,
    }));
    assert.match(result.redirect, /auth=callback_error/, failure);
    assert.equal(store.sessions.size, 0, failure);
  }
});

test("만료되거나 비활성 사용자의 app session은 복원되지 않는다", async () => {
  const store = memoryStore([{ id: "usr_expired", status: "active", provider: "google" }, { id: "usr_disabled", status: "disabled", provider: "google" }]);
  const env = testEnv();
  const expiredToken = await createSessionToken({ sid: "expired", sub: "usr_expired", exp: Date.now() - 1 }, TEST_SECRET);
  await store.putSession({ id: "expired", userId: "usr_expired", expiresAt: Date.now() - 1 });
  const expired = await handleAccountApi(context({ path: "/api/auth/session", env, store, cookie: `omw_session=${expiredToken}` }));
  assert.equal(expired.json.user, null);

  const disabledToken = await createSessionToken({ sid: "disabled", sub: "usr_disabled", exp: Date.now() + 60_000 }, TEST_SECRET);
  await store.putSession({ id: "disabled", userId: "usr_disabled", expiresAt: Date.now() + 60_000 });
  const disabled = await handleAccountApi(context({ path: "/api/auth/session", env, store, cookie: `omw_session=${disabledToken}` }));
  assert.equal(disabled.json.user, null);
});

test("로그아웃은 서버 세션을 폐기하고 같은 쿠키 재사용을 거부한다", async () => {
  const store = memoryStore();
  const env = testEnv({ ALLOW_DEV_LOGIN: "true" });
  const login = await handleAccountApi(context({
    path: "/api/auth/dev-login",
    method: "POST",
    env,
    store,
    body: { provider: "google", name: "회원" },
  }));
  const sessionCookie = login.cookies[0].split(";")[0];
  assert.equal((await handleAccountApi(context({ path: "/api/auth/session", env, store, cookie: sessionCookie }))).json.user.id, login.json.user.id);
  await handleAccountApi(context({ path: "/api/auth/logout", method: "POST", env, store, cookie: sessionCookie }));
  assert.equal(store.sessions.size, 0);
  assert.equal((await handleAccountApi(context({ path: "/api/auth/session", env, store, cookie: sessionCookie }))).json.user, null);
});

test("Free 회원의 첫 계획 생성은 서버 회원 기록에 저장된다", async () => {
  const store = memoryStore();
  const user = { id: "google:first-plan", role: "member", plan: "free" };
  await store.putUser(user);
  const result = await createGoalPlanForUser({
    input: { goal: "영어 공부" },
    env: {},
    userStore: store,
    user,
    generatePlan: async () => ({ plan: { goal: "영어 공부" } }),
    now: 123456,
  });
  assert.equal(result.plan.goal, "영어 공부");
  assert.equal((await store.getUser(user.id)).goalPlanGeneratedAt, 123456);
});

test("계획을 만든 Free 회원은 다른 브라우저에서도 추가 생성할 수 없다", async () => {
  const store = memoryStore();
  const user = { id: "google:limited", role: "member", plan: "free", goalPlanGeneratedAt: 123456 };
  let generated = false;
  await assert.rejects(
    createGoalPlanForUser({
      input: { goal: "다시 만들기" },
      env: {},
      userStore: store,
      user,
      generatePlan: async () => {
        generated = true;
        return { plan: {} };
      },
    }),
    (error) => error.status === 409 && error.code === "GOAL_PLAN_LIMIT_REACHED",
  );
  assert.equal(generated, false);
});

test("Pro와 Pro 체험 회원은 Free 전용 계획 1개 제한을 적용받지 않는다", async () => {
  for (const plan of ["trial", "pro"]) {
    const user = { id: `google:unlimited-${plan}`, role: "member", plan, goalPlanGeneratedAt: 123456 };
    const store = memoryStore([user]);
    let generated = false;
    const result = await createGoalPlanForUser({
      input: { goal: "추가 계획" },
      env: {},
      userStore: store,
      user,
      generatePlan: async () => {
        generated = true;
        return { plan: { goal: "추가 계획" } };
      },
    });
    assert.equal(generated, true);
    assert.equal(result.plan.goal, "추가 계획");
  }
});

test("해지된 구독은 결제 기간 종료 후 Free로 내려간다", async () => {
  const user = {
    id: "google:paid",
    plan: "pro",
    subscriptionStatus: "canceled",
    currentPeriodEnd: Date.now() - 1,
  };
  const store = memoryStore([user]);
  const result = await renewDueSubscriptions({ env: {}, store });
  assert.equal(result.processed, 1);
  assert.equal(store.users.get(user.id).plan, "free");
});

test("운영 승인 스위치가 꺼져 있으면 결제 키가 있어도 결제창을 열지 않는다", async () => {
  const env = testEnv({ ALLOW_DEV_LOGIN: "true", TOSS_CLIENT_KEY: "test_ck", TOSS_SECRET_KEY: "test_sk" });
  const store = memoryStore();
  const login = await handleAccountApi(context({ path: "/api/auth/dev-login", method: "POST", env, store, body: { provider: "google", name: "회원" } }));
  const result = await handleAccountApi(context({ path: "/api/billing/config", env, store, cookie: login.cookies[0] }));
  assert.equal(result.json.configured, false);
  assert.equal(result.json.clientKey, null);
});

test("첫 결제 응답이 유실돼도 주문 조회로 복구하고 다시 청구하지 않는다", async () => {
  const env = testEnv({
    ALLOW_DEV_LOGIN: "true",
    TOSS_CLIENT_KEY: "test_ck",
    TOSS_SECRET_KEY: "test_sk",
    PAYMENTS_ENABLED: "true",
  });
  const store = memoryStore();
  const login = await handleAccountApi(context({ path: "/api/auth/dev-login", method: "POST", env, store, body: { provider: "google", name: "결제회원" } }));
  const cookie = login.cookies[0];
  const config = await handleAccountApi(context({ path: "/api/billing/config", env, store, cookie }));
  let charges = 0;
  const fetcher = async (url, options) => {
    if (url.includes("/authorizations/issue")) return Response.json({ billingKey: "billing-key" });
    if (url.includes("/v1/billing/")) {
      charges += 1;
      return Response.json({ code: "TEMPORARY_ERROR", message: "timeout" }, { status: 500 });
    }
    const orderId = decodeURIComponent(url.split("/").at(-1));
    return Response.json({ status: "DONE", paymentKey: "payment-key", orderId });
  };
  const activated = await handleAccountApi(context({
    path: "/api/billing/activate",
    method: "POST",
    env,
    store,
    cookie,
    fetcher,
    body: { authKey: "auth-key", customerKey: config.json.customerKey },
  }));
  assert.equal(activated.status, 200);
  assert.equal(activated.json.recovered, true);
  assert.equal(activated.json.user.plan, "pro");
  assert.equal(charges, 1);
  assert.equal((await store.getUser(login.json.user.id)).pendingOrderId, null);
});

test("갱신 실패는 같은 주문으로 하루 간격 재시도하고 세 번째 실패 후 중단한다", async () => {
  const now = Date.now();
  const user = {
    id: "google:retry",
    plan: "pro",
    subscriptionStatus: "active",
    currentPeriodEnd: now - 1,
    billingKey: "billing-key",
    customerKey: "customer-key",
  };
  const store = memoryStore([user]);
  const env = testEnv({ TOSS_CLIENT_KEY: "test_ck", TOSS_SECRET_KEY: "test_sk", PAYMENTS_ENABLED: "true" });
  const orderIds = [];
  const fetcher = async (url, options) => {
    if (url.includes("/v1/billing/")) orderIds.push(JSON.parse(options.body).orderId);
    return Response.json({ code: "TEMPORARY_ERROR", message: "failed" }, { status: url.includes("/payments/orders/") ? 404 : 500 });
  };

  const first = await renewDueSubscriptions({ env, store, now, fetcher });
  assert.equal(first.retrying, 1);
  assert.equal(user.subscriptionStatus, "past_due");
  assert.equal(user.plan, "pro");
  await renewDueSubscriptions({ env, store, now: now + 24 * 60 * 60 * 1000, fetcher });
  const third = await renewDueSubscriptions({ env, store, now: now + 2 * 24 * 60 * 60 * 1000, fetcher });
  assert.equal(third.failed, 1);
  assert.equal(user.subscriptionStatus, "payment_failed");
  assert.equal(user.plan, "free");
  assert.equal(new Set(orderIds).size, 1);
});

test("결제사 해지를 확인하지 못하면 빌링키와 구독 상태를 보존한다", async () => {
  const env = testEnv({ ALLOW_DEV_LOGIN: "true", TOSS_CLIENT_KEY: "test_ck", TOSS_SECRET_KEY: "test_sk" });
  const store = memoryStore();
  const login = await handleAccountApi(context({ path: "/api/auth/dev-login", method: "POST", env, store, body: { provider: "google", name: "해지회원" } }));
  const user = await store.getUser(login.json.user.id);
  Object.assign(user, { plan: "pro", billingKey: "billing-key", subscriptionStatus: "active" });
  await store.putUser(user);
  const result = await handleAccountApi(context({
    path: "/api/billing/cancel",
    method: "POST",
    env,
    store,
    cookie: login.cookies[0],
    fetcher: async () => Response.json({ code: "FAIL", message: "failed" }, { status: 500 }),
  }));
  assert.equal(result.status, 502);
  assert.equal((await store.getUser(user.id)).billingKey, "billing-key");
  assert.equal((await store.getUser(user.id)).subscriptionStatus, "active");
});

test("계정 탈퇴는 인증과 정확한 확인 문구를 요구한다", async () => {
  const env = testEnv({ ALLOW_DEV_LOGIN: "true" });
  const store = memoryStore();
  const unauthenticated = await handleAccountApi(context({ path: "/api/account/delete", method: "POST", env, store, body: { confirmation: "계정 삭제" } }));
  assert.equal(unauthenticated.status, 401);
  const login = await handleAccountApi(context({ path: "/api/auth/dev-login", method: "POST", env, store, body: { provider: "google", name: "회원" } }));
  const invalid = await handleAccountApi(context({ path: "/api/account/delete", method: "POST", env, store, cookie: login.cookies[0], body: { confirmation: "삭제" } }));
  assert.equal(invalid.status, 400);
  assert.equal((await store.getUser(login.json.user.id)).status, "active");
});

test("회원 앱 상태는 허용된 키만 동기화하고 revision 충돌과 탈퇴 삭제를 처리한다", async () => {
  const store = memoryStore();
  const env = testEnv({ ALLOW_DEV_LOGIN: "true" });
  const login = await handleAccountApi(context({
    path: "/api/auth/dev-login",
    method: "POST",
    env,
    store,
    body: { provider: "google", name: "동기화 회원", email: "sync@example.com" },
  }));
  const cookie = login.cookies[0].split(";")[0];

  const saved = await handleAccountApi(context({
    path: "/api/account/state",
    method: "PUT",
    env,
    store,
    cookie,
    body: {
      userId: login.json.user.id,
      baseRevision: 0,
      deviceId: "device-a",
      state: { omwExecutionPlan: '{"goal":"launch"}', omwTrialLead: '{"phone":"010"}', unknown: "discard" },
    },
  }));
  assert.equal(saved.status, 200);
  assert.equal(saved.json.revision, 1);

  const loaded = await handleAccountApi(context({ path: "/api/account/state", env, store, cookie }));
  assert.deepEqual(loaded.json.state, { omwExecutionPlan: '{"goal":"launch"}' });
  assert.equal(loaded.json.revision, 1);

  const conflict = await handleAccountApi(context({
    path: "/api/account/state",
    method: "PUT",
    env,
    store,
    cookie,
    body: { userId: login.json.user.id, baseRevision: 0, state: { omwExecutionPlan: "stale" } },
  }));
  assert.equal(conflict.status, 409);
  assert.equal(conflict.json.revision, 1);

  const changedAccount = await handleAccountApi(context({
    path: "/api/account/state",
    method: "PUT",
    env,
    store,
    cookie,
    body: { userId: "another-user", baseRevision: 1, state: { omwExecutionPlan: "wrong account" } },
  }));
  assert.equal(changedAccount.status, 409);
  assert.equal(changedAccount.json.code, "ACCOUNT_CHANGED");
  assert.equal((await store.getAppState(login.json.user.id)).state.omwExecutionPlan, '{"goal":"launch"}');

  const deleted = await handleAccountApi(context({
    path: "/api/account/delete",
    method: "POST",
    env,
    store,
    cookie,
    body: { confirmation: "계정 삭제" },
  }));
  assert.equal(deleted.status, 202);
  assert.equal(store.appStates.size, 0);
});

test("무료 회원 탈퇴는 모든 인증 연결과 세션을 제거하고 최소 대기 표식만 남긴다", async () => {
  const env = testEnv({ ALLOW_DEV_LOGIN: "true" });
  const store = memoryStore();
  const putUser = store.putUser.bind(store);
  let lastPutOptions;
  store.putUser = async (user, options) => {
    lastPutOptions = options;
    return putUser(user);
  };
  const login = await handleAccountApi(context({ path: "/api/auth/dev-login", method: "POST", env, store, body: { provider: "google", name: "탈퇴회원", email: "delete@example.com" } }));
  const usedAt = Date.now() - 1_000;
  const activeUser = await store.getUser(login.json.user.id);
  activeUser.trialUsedAt = usedAt;
  await store.putUser(activeUser);
  const result = await handleAccountApi(context({ path: "/api/account/delete", method: "POST", env, store, cookie: login.cookies[0], body: { confirmation: "계정 삭제" } }));
  assert.equal(result.status, 202);
  assert.equal(store.sessions.size, 0);
  assert.equal(store.identities.size, 0);
  assert.deepEqual(Object.keys(await store.getUser(login.json.user.id)).sort(), ["deletionRequestedAt", "deletionScheduledAt", "id", "status"]);
  assert.equal(store.settings.get(`ai-trial-used:${login.json.user.id}`).usedAt, usedAt);
  assert.equal(lastPutOptions.expiresAt, result.json.deletionScheduledAt);
  assert.match(result.cookies[0], /Max-Age=0/);
});

test("결제 회원 탈퇴는 결제를 먼저 해지하고 법정 기록에서 billingKey를 제외한다", async () => {
  const env = testEnv({ ALLOW_DEV_LOGIN: "true", TOSS_CLIENT_KEY: "test_ck", TOSS_SECRET_KEY: "test_sk" });
  const store = memoryStore();
  const retained = [];
  const legalStore = { async put(record, retainedUntil) { retained.push({ record, retainedUntil }); } };
  const login = await handleAccountApi(context({ path: "/api/auth/dev-login", method: "POST", env, store, body: { provider: "google", name: "결제회원", email: "paid@example.com" } }));
  const user = await store.getUser(login.json.user.id);
  Object.assign(user, { billingKey: "billing-secret", customerKey: "customer-1", subscriptionStatus: "active", lastOrderId: "order-1", lastPaymentKey: "payment-1", lastPaymentAt: 100 });
  await store.putUser(user);
  const requests = [];
  const result = await handleAccountApi(context({
    path: "/api/account/delete", method: "POST", env, store, legalStore, cookie: login.cookies[0], body: { confirmation: "계정 삭제" },
    fetcher: async (url, options) => { requests.push({ url, options }); return Response.json({}); },
  }));
  assert.equal(result.status, 202);
  assert.equal(requests[0].options.method, "DELETE");
  assert.equal(retained.length, 1);
  assert.equal(retained[0].record.lastOrderId, "order-1");
  assert.equal("billingKey" in retained[0].record, false);
});

test("결제 해지 실패 시 회원 정보와 로그인은 유지된다", async () => {
  const env = testEnv({ ALLOW_DEV_LOGIN: "true", TOSS_CLIENT_KEY: "test_ck", TOSS_SECRET_KEY: "test_sk" });
  const store = memoryStore();
  const login = await handleAccountApi(context({ path: "/api/auth/dev-login", method: "POST", env, store, body: { provider: "google", name: "결제회원" } }));
  const user = await store.getUser(login.json.user.id);
  Object.assign(user, { billingKey: "billing-secret", customerKey: "customer-1", subscriptionStatus: "active" });
  await store.putUser(user);
  const result = await handleAccountApi(context({
    path: "/api/account/delete", method: "POST", env, store, legalStore: { async put() {} }, cookie: login.cookies[0], body: { confirmation: "계정 삭제" },
    fetcher: async () => Response.json({ code: "FAIL", message: "failed" }, { status: 500 }),
  }));
  assert.equal(result.status, 502);
  assert.equal((await store.getUser(user.id)).status, "active");
  assert.equal(store.sessions.size, 1);
});

test("billingKey가 있는데 결제사 설정이 없으면 탈퇴하지 않는다", async () => {
  const env = testEnv({ ALLOW_DEV_LOGIN: "true" });
  const store = memoryStore();
  const login = await handleAccountApi(context({ path: "/api/auth/dev-login", method: "POST", env, store, body: { provider: "google", name: "설정누락" } }));
  const user = await store.getUser(login.json.user.id);
  user.billingKey = "billing-secret";
  await store.putUser(user);
  const result = await handleAccountApi(context({
    path: "/api/account/delete", method: "POST", env, store, legalStore: { async put() {} }, cookie: login.cookies[0], body: { confirmation: "계정 삭제" },
  }));
  assert.equal(result.status, 503);
  assert.equal((await store.getUser(user.id)).status, "active");
});

test("7일이 지난 삭제 대기 계정은 영구 삭제되고 재로그인으로 복구되지 않는다", async () => {
  const store = memoryStore();
  const pending = await upsertUserFromProfile(store, testEnv(), "google", { providerUserId: "pending", name: "복구금지" });
  await store.putUser({ id: pending.id, status: "deletion_pending", deletionScheduledAt: 100 });
  await assert.rejects(
    upsertUserFromProfile(store, testEnv(), "google", { providerUserId: "pending", name: "복구금지" }),
    (error) => error.code === "ACCOUNT_DELETION_PENDING",
  );
  const result = await purgeDueAccountDeletions({ store, now: 101 });
  assert.equal(result.purged, 1);
  assert.equal(await store.getUser(pending.id), null);
});

test("AI endpoints reject unauthenticated requests before invoking providers", async () => {
  const kv = { async get() { return null; }, async put() {}, async list() { return { keys: [] }; } };
  const assets = { async fetch() { return new Response("asset"); } };
  for (const path of ["/api/ai/goal-plan", "/api/ai/companion-chat", "/api/ai/plan-revision"]) {
    const response = await worker.fetch(new Request(`https://preview.example${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }), { USERS_KV: kv, ASSETS: assets });
    assert.equal(response.status, 401, path);
  }
});

test("API requests from arbitrary origins are rejected", async () => {
  const response = await worker.fetch(new Request("https://preview.example/api/auth/me", {
    headers: { Origin: "https://attacker.example" },
  }), { ASSETS: { async fetch() { return new Response("asset"); } } });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("Preview와 Production의 동일 Origin API 요청은 정상 처리한다", async () => {
  for (const origin of ["https://on-my-way-pr-auth-test.jungslawyer.workers.dev", "https://onmyway.olivenrich.com"]) {
    const response = await worker.fetch(new Request(`${origin}/api/auth/providers`, {
      headers: { Origin: origin },
    }), { ASSETS: { async fetch() { return new Response("asset"); } } });
    assert.equal(response.status, 200, origin);
  }
});

test("Apple form_post는 Apple origin만 callback으로 허용한다", async () => {
  const kv = { async get() { return null; }, async put() {}, async delete() {}, async list() { return { keys: [], list_complete: true }; } };
  const assets = { async fetch() { return new Response("asset"); } };
  const makeRequest = (origin) => new Request("https://preview.example/api/auth/callback/apple", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" },
    body: "code=x&state=y",
  });
  const apple = await worker.fetch(makeRequest("https://appleid.apple.com"), { USERS_KV: kv, ASSETS: assets });
  assert.equal(apple.status, 302);
  assert.match(apple.headers.get("location"), /auth=invalid_state/);
  const attacker = await worker.fetch(makeRequest("https://attacker.example"), { USERS_KV: kv, ASSETS: assets });
  assert.equal(attacker.status, 403);
});

test("Worker responses include release security headers", async () => {
  const response = await worker.fetch(new Request("https://preview.example/app.html"), {
    ASSETS: { async fetch() { return new Response("<!doctype html>", { headers: { "Content-Type": "text/html" } }); } },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("cache-control"), /no-store/);
});
