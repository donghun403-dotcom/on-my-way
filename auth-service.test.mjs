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
  return {
    users,
    async getUser(id) { return users.get(id) || null; },
    async putUser(user) { users.set(user.id, user); },
    async listUsers() { return [...users.values()]; },
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
