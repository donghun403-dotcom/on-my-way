import test from "node:test";
import assert from "node:assert/strict";
import {
  createSessionToken,
  verifySessionToken,
  handleAccountApi,
  parseCookies,
  renewDueSubscriptions,
  upsertUserFromProfile,
} from "./auth-service.mjs";
import worker, { createGoalPlanForUser } from "./worker.mjs";

function memoryStore(seed = []) {
  const users = new Map(seed.map((user) => [user.id, user]));
  const settings = new Map();
  const identities = new Map();
  const sessions = new Map();
  const oauth = new Map();
  return {
    users,
    settings,
    identities,
    sessions,
    oauth,
    async getUser(id) { return users.get(id) || null; },
    async putUser(user) { users.set(user.id, user); },
    async listUsers() { return [...users.values()]; },
    async getIdentity(provider, providerUserId) { return identities.get(`${provider}:${providerUserId}`) || null; },
    async putIdentity(identity) { identities.set(`${identity.provider}:${identity.providerUserId}`, identity); },
    async getSession(id) { return sessions.get(id) || null; },
    async putSession(session) { sessions.set(session.id, session); },
    async deleteSession(id) { sessions.delete(id); },
    async getOAuthTransaction(state) { return oauth.get(state) || null; },
    async putOAuthTransaction(transaction) { oauth.set(transaction.state, transaction); },
    async deleteOAuthTransaction(state) { oauth.delete(state); },
    async getSetting(name) { return settings.get(name) || null; },
    async putSetting(name, value) { settings.set(name, value); },
  };
}

const TEST_SECRET = "test-session-secret-that-is-longer-than-32-characters";
const testEnv = (overrides = {}) => ({ APP_ENV: "test", SESSION_SECRET: TEST_SECRET, ...overrides });

function context({ path, method = "GET", env = {}, store, body = {}, form = {}, cookie = "", fetcher }) {
  const cookies = parseCookies(cookie);
  return {
    method,
    url: new URL(`https://example.test${path}`),
    secure: true,
    getCookie: (name) => cookies[name],
    readJson: async () => body,
    readForm: async () => form,
    fetcher,
    env,
    store,
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

test("신규 소셜 회원은 24시간 체험으로 생성된다", async () => {
  const store = memoryStore();
  const result = await handleAccountApi(context({
    path: "/api/auth/dev-login",
    method: "POST",
    env: testEnv({ ALLOW_DEV_LOGIN: "true" }),
    store,
    body: { provider: "kakao", name: "테스트", email: "member@example.com" },
  }));
  assert.equal(result.status, 200);
  assert.equal(result.json.user.plan, "trial");
  assert.equal(result.json.user.trialExpiresAt - result.json.user.trialStartedAt, 24 * 60 * 60 * 1000);
  assert.match(result.cookies[0], /HttpOnly/);
  assert.match(result.cookies[0], /Secure/);
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

test("무료 체험 회원의 첫 계획 생성은 서버 회원 기록에 저장된다", async () => {
  const store = memoryStore();
  const user = { id: "google:first-plan", role: "member", plan: "trial" };
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

test("계획을 만든 무료 체험 회원은 다른 브라우저에서도 추가 생성할 수 없다", async () => {
  const store = memoryStore();
  const user = { id: "google:limited", role: "member", plan: "trial", goalPlanGeneratedAt: 123456 };
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

test("해지된 구독은 결제 기간 종료 후 체험 상태로 내려간다", async () => {
  const user = {
    id: "google:paid",
    plan: "pro",
    subscriptionStatus: "canceled",
    currentPeriodEnd: Date.now() - 1,
  };
  const store = memoryStore([user]);
  const result = await renewDueSubscriptions({ env: {}, store });
  assert.equal(result.processed, 1);
  assert.equal(store.users.get(user.id).plan, "trial");
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
