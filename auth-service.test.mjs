import test from "node:test";
import assert from "node:assert/strict";
import {
  createSessionToken,
  verifySessionToken,
  handleAccountApi,
  parseCookies,
  renewDueSubscriptions,
} from "./auth-service.mjs";

function memoryStore(seed = []) {
  const users = new Map(seed.map((user) => [user.id, user]));
  const settings = new Map();
  return {
    users,
    settings,
    async getUser(id) { return users.get(id) || null; },
    async putUser(user) { users.set(user.id, user); },
    async listUsers() { return [...users.values()]; },
    async getSetting(name) { return settings.get(name) || null; },
    async putSetting(name, value) { settings.set(name, value); },
  };
}

function context({ path, method = "GET", env = {}, store, body = {}, cookie = "" }) {
  const cookies = parseCookies(cookie);
  return {
    method,
    url: new URL(`https://example.test${path}`),
    secure: true,
    getCookie: (name) => cookies[name],
    readJson: async () => body,
    env,
    store,
  };
}

test("서명 세션은 변조와 만료를 거부한다", async () => {
  const secret = "test-secret";
  const valid = await createSessionToken({ uid: "google:1", exp: Date.now() + 1000 }, secret);
  assert.equal((await verifySessionToken(valid, secret)).uid, "google:1");
  assert.equal(await verifySessionToken(`${valid}x`, secret), null);
  const expired = await createSessionToken({ uid: "google:1", exp: Date.now() - 1 }, secret);
  assert.equal(await verifySessionToken(expired, secret), null);
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
    env: { SESSION_SECRET: "secret", ALLOW_DEV_LOGIN: "true" },
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
  const env = { SESSION_SECRET: "secret", ALLOW_DEV_LOGIN: "true", ADMIN_EMAILS: "admin@example.com" };
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
  const env = { SESSION_SECRET: "secret", ALLOW_DEV_LOGIN: "true", ADMIN_PASSWORD: "strong-admin-password" };
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
  const env = { SESSION_SECRET: "secret", ALLOW_DEV_LOGIN: "true", ADMIN_PASSWORD: "Temporary1!Pass" };
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
