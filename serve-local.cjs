const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT || 8765);
const host = "127.0.0.1";
const root = path.resolve(__dirname);
const aiCompanionChatModule = import("./ai-companion-chat.mjs");
const aiPlanRevisionModule = import("./ai-plan-revision.mjs");
const aiCreditsServiceModule = import("./ai-credits-service.mjs");
const authServiceModule = import("./auth-service.mjs");
const workerModule = import("./worker.mjs");
const localEnv = {
  ...process.env,
  APP_ENV: process.env.APP_ENV || "local",
  ALLOW_DEV_LOGIN: process.env.ALLOW_DEV_LOGIN || "false",
  ALLOW_DEMO_BILLING: process.env.ALLOW_DEMO_BILLING || "true",
  SESSION_SECRET: process.env.SESSION_SECRET || "omw-local-development-session-secret",
};

// 로컬 개발용 회원 저장소: tmp/dev-users.json (git에 올라가지 않음)
const devUsersFile = path.join(root, "tmp", "dev-users.json");
const devSettingsFile = path.join(root, "tmp", "dev-settings.json");

function readDevUsers() {
  try {
    return JSON.parse(fs.readFileSync(devUsersFile, "utf8"));
  } catch {
    return {};
  }
}

function writeDevUsers(users) {
  fs.mkdirSync(path.dirname(devUsersFile), { recursive: true });
  fs.writeFileSync(devUsersFile, JSON.stringify(users, null, 2), "utf8");
}

function readDevSettings() {
  try {
    return JSON.parse(fs.readFileSync(devSettingsFile, "utf8"));
  } catch {
    return {};
  }
}

function writeDevSettings(settings) {
  fs.mkdirSync(path.dirname(devSettingsFile), { recursive: true });
  fs.writeFileSync(devSettingsFile, JSON.stringify(settings, null, 2), "utf8");
}

const localUserStore = {
  async getUser(id) {
    const users = readDevUsers();
    const user = users[id] || null;
    if (user?.status === "deletion_pending" && Number(user.deletionScheduledAt || 0) <= Date.now()) {
      delete users[id];
      writeDevUsers(users);
      return null;
    }
    return user;
  },
  async putUser(user) {
    const users = readDevUsers();
    users[user.id] = user;
    writeDevUsers(users);
  },
  async listUsers() {
    const users = readDevUsers();
    let changed = false;
    for (const [id, user] of Object.entries(users)) {
      if (user?.status === "deletion_pending" && Number(user.deletionScheduledAt || 0) <= Date.now()) {
        delete users[id];
        changed = true;
      }
    }
    if (changed) writeDevUsers(users);
    return Object.values(users);
  },
  async deleteUser(id) {
    const users = readDevUsers();
    delete users[id];
    writeDevUsers(users);
  },
  async getIdentity(provider, providerUserId) {
    return readDevSettings()[`identity:${provider}:${encodeURIComponent(providerUserId)}`] || null;
  },
  async putIdentity(identity) {
    const settings = readDevSettings();
    settings[`identity:${identity.provider}:${encodeURIComponent(identity.providerUserId)}`] = identity;
    writeDevSettings(settings);
  },
  async deleteIdentitiesByUserId(userId) {
    const settings = readDevSettings();
    for (const [key, value] of Object.entries(settings)) {
      if (key.startsWith("identity:") && value?.userId === userId) delete settings[key];
    }
    writeDevSettings(settings);
  },
  async getSession(id) {
    return readDevSettings()[`session:${id}`] || null;
  },
  async putSession(session) {
    const settings = readDevSettings();
    settings[`session:${session.id}`] = session;
    writeDevSettings(settings);
  },
  async deleteSession(id) {
    const settings = readDevSettings();
    delete settings[`session:${id}`];
    writeDevSettings(settings);
  },
  async deleteSessionsByUserId(userId) {
    const settings = readDevSettings();
    for (const [key, value] of Object.entries(settings)) {
      if (key.startsWith("session:") && value?.userId === userId) delete settings[key];
    }
    writeDevSettings(settings);
  },
  async getOAuthTransaction(state) {
    return readDevSettings()[`oauth:${state}`] || null;
  },
  async putOAuthTransaction(transaction) {
    const settings = readDevSettings();
    settings[`oauth:${transaction.state}`] = transaction;
    writeDevSettings(settings);
  },
  async deleteOAuthTransaction(state) {
    const settings = readDevSettings();
    delete settings[`oauth:${state}`];
    writeDevSettings(settings);
  },
  async getSetting(name) {
    const settings = readDevSettings();
    const expiryKey = `setting-expiry:${name}`;
    if (Number(settings[expiryKey] || 0) > 0 && Number(settings[expiryKey]) <= Date.now()) {
      delete settings[name];
      delete settings[expiryKey];
      writeDevSettings(settings);
      return null;
    }
    return settings[name] || null;
  },
  async putSetting(name, value, options = {}) {
    const settings = readDevSettings();
    const expiryKey = `setting-expiry:${name}`;
    if (value === null || value === undefined) delete settings[name];
    else settings[name] = value;
    const expiresAt = Number(options.expiresAt);
    if (Number.isFinite(expiresAt)) settings[expiryKey] = expiresAt;
    else delete settings[expiryKey];
    writeDevSettings(settings);
  },
  async deleteSetting(name) {
    const settings = readDevSettings();
    delete settings[name];
    delete settings[`setting-expiry:${name}`];
    writeDevSettings(settings);
  },
};

const localLegalStore = {
  async put(record, retainedUntil) {
    const settings = readDevSettings();
    settings[`legal:${record.id}`] = { ...record, retainedUntil };
    writeDevSettings(settings);
  },
};

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const AI_GENERATION_ROUTES = Object.freeze({
  "/api/ai/goal-plan": { action: "create_plan", kind: "goal", maxBytes: 50_000 },
  "/api/ai/companion-chat": { action: "companion_chat", kind: "companion", maxBytes: 5_000 },
  "/api/ai/plan-revision": { action: "revise_plan", kind: "revision", maxBytes: 20_000 },
  "/api/ai/recovery-plan": { action: "recovery_plan", kind: "revision", maxBytes: 20_000 },
  "/api/ai/reschedule-plan": { action: "reschedule_plan", kind: "revision", maxBytes: 20_000 },
});

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function aiErrorBody(error, usage = null) {
  const body = {
    ok: false,
    error: error?.message || "AI 요청을 처리하지 못했어요.",
    code: error?.code || "AI_REQUEST_FAILED",
  };
  if (error?.details) body.details = error.details;
  if (usage) body.usage = usage;
  return body;
}

function providerMetadata(result, model) {
  return {
    providerUsage: result?.usage || {},
    providerRequestId: result?.requestId || "",
    model,
  };
}

function publicAiResult(result) {
  if (!result || typeof result !== "object") return { data: result };
  const payload = { ...result };
  delete payload.usage;
  delete payload.requestId;
  delete payload.diagnostics;
  return payload;
}

async function currentLocalUser(request) {
  const { currentSessionUser, parseCookies } = await authServiceModule;
  const cookies = parseCookies(request.headers.cookie);
  return currentSessionUser({
    getCookie: (name) => cookies[name],
    env: localEnv,
    store: localUserStore,
  });
}

async function handleLocalAiGenerationRequest({ request, response, route }) {
  if (request.method !== "POST") {
    sendJson(response, 405, { ok: false, error: "POST 요청만 사용할 수 있어요.", code: "METHOD_NOT_ALLOWED" });
    return;
  }

  const user = await currentLocalUser(request).catch(() => null);
  if (!user) {
    sendJson(response, 401, { ok: false, error: "로그인 후 AI 기능을 이용할 수 있어요.", code: "AUTH_REQUIRED" });
    return;
  }

  const requestId = String(request.headers["x-request-id"] || "").trim();
  if (!requestId) {
    sendJson(response, 400, { ok: false, error: "X-Request-ID 헤더가 필요해요.", code: "INVALID_REQUEST_ID" });
    return;
  }

  const contentLength = Number(request.headers["content-length"] || 0);
  if (contentLength > route.maxBytes) {
    sendJson(response, 413, { ok: false, error: "요청 내용이 너무 커요.", code: "AI_REQUEST_TOO_LARGE" });
    return;
  }

  let input;
  try {
    input = await readJsonBody(request, route.maxBytes);
  } catch (error) {
    sendJson(response, error.status || 400, {
      ok: false,
      error: error.message || "요청 형식이 올바르지 않아요.",
      code: error.status === 413 ? "AI_REQUEST_TOO_LARGE" : "INVALID_JSON",
    });
    return;
  }

  const {
    commitAiCredits,
    getAiCreditUsage,
    releaseAiCredits,
    reserveAiCredits,
  } = await aiCreditsServiceModule;
  let reservation = null;
  let providerCalled = false;
  const model = localEnv.OPENAI_MODEL || "gpt-5.4-mini";

  try {
    reservation = await reserveAiCredits({
      store: localUserStore,
      userId: user.id,
      action: route.action,
      requestId,
    });

    let result;
    if (route.kind === "goal") {
      const { createGoalPlanForUser } = await workerModule;
      const creditAwareUser = await localUserStore.getUser(user.id);
      result = await createGoalPlanForUser({
        input,
        env: localEnv,
        userStore: localUserStore,
        user: creditAwareUser,
      });
    } else if (route.kind === "companion") {
      const { createCompanionReply } = await aiCompanionChatModule;
      result = await createCompanionReply(input, {
        apiKey: localEnv.OPENAI_API_KEY,
        model,
        allowPersonalization: ["pro", "trial"].includes(reservation.usage.plan),
      });
    } else {
      const { createAiPlanRevision } = await aiPlanRevisionModule;
      result = await createAiPlanRevision(input, {
        apiKey: localEnv.OPENAI_API_KEY,
        model,
      });
    }
    providerCalled = true;

    const committed = await commitAiCredits({
      store: localUserStore,
      userId: user.id,
      requestId,
      ...providerMetadata(result, model),
    });
    sendJson(response, 200, {
      ok: true,
      ...publicAiResult(result),
      requestId,
      chargedCredits: committed.chargedCredits,
      usage: committed.usage,
    });
  } catch (error) {
    console.error(`AI ${route.action} request failed`, error);
    if (reservation?.shouldExecute) {
      try {
        await releaseAiCredits({
          store: localUserStore,
          userId: user.id,
          requestId,
          providerCalled: error?.providerCalled ?? providerCalled,
          providerUsage: error?.providerUsage || {},
          providerRequestId: error?.providerRequestId || "",
          errorCode: error?.code || "AI_REQUEST_FAILED",
          model,
        });
      } catch (releaseError) {
        console.error("AI credit reservation release failed", releaseError);
      }
    }
    const usage = await getAiCreditUsage({ store: localUserStore, userId: user.id }).catch(() => null);
    sendJson(response, error?.status || 500, aiErrorBody(error, usage));
  }
}

function readJsonBody(request, maxBytes = 50000) {
  return new Promise((resolve, reject) => {
    let body = "";
    let bytes = 0;
    let settled = false;
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      if (settled) return;
      bytes += Buffer.byteLength(chunk, "utf8");
      if (bytes > maxBytes) {
        settled = true;
        const error = new Error("요청 내용이 너무 커요.");
        error.status = 413;
        reject(error);
        return;
      }
      body += chunk;
    });
    request.on("end", () => {
      if (settled) return;
      try {
        settled = true;
        resolve(JSON.parse(body || "{}"));
      } catch {
        settled = true;
        const error = new Error("요청 형식이 올바르지 않아요.");
        error.status = 400;
        reject(error);
      }
    });
    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function readFormBody(request, maxBytes = 10000) {
  return new Promise((resolve, reject) => {
    let body = "";
    let bytes = 0;
    let settled = false;
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      if (settled) return;
      bytes += Buffer.byteLength(chunk, "utf8");
      if (bytes > maxBytes) {
        settled = true;
        const error = new Error("요청 내용이 너무 커요.");
        error.status = 413;
        reject(error);
        return;
      }
      body += chunk;
    });
    request.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(Object.fromEntries(new URLSearchParams(body)));
    });
    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

const server = http.createServer(async (request, response) => {
  let pathname = "/";
  let requestUrl = new URL("/", `http://${host}:${port}`);

  try {
    requestUrl = new URL(request.url || "/", `http://${host}:${port}`);
    pathname = requestUrl.pathname;
  } catch {
    pathname = "/";
  }

  if (pathname === "/api/health" && request.method === "GET") {
    const billingConfigured = Boolean(localEnv.TOSS_CLIENT_KEY && localEnv.TOSS_SECRET_KEY);
    sendJson(response, 200, {
      ok: true,
      environment: String(localEnv.APP_ENV || "local"),
      services: {
        accountStorage: true,
        ai: Boolean(localEnv.OPENAI_API_KEY),
        payments: billingConfigured && String(localEnv.PAYMENTS_ENABLED || "").toLowerCase() === "true",
      },
    });
    return;
  }

  if (pathname.startsWith("/api/auth/") || pathname.startsWith("/api/account/") || pathname.startsWith("/api/billing/") || pathname.startsWith("/api/admin/")) {
    try {
      const { handleAccountApi, parseCookies } = await authServiceModule;
      const cookies = parseCookies(request.headers.cookie);
      const result = await handleAccountApi({
        method: request.method,
        url: requestUrl,
        secure: false,
        getCookie: (name) => cookies[name],
        readJson: () => readJsonBody(request, 10000).catch(() => ({})),
        readForm: () => readFormBody(request, 10000).catch(() => ({})),
        env: localEnv,
        store: localUserStore,
        legalStore: localLegalStore,
      });

      if (!result) {
        sendJson(response, 404, { error: "요청을 처리할 수 없어요." });
        return;
      }

      const headers = { "Cache-Control": "no-store" };
      if (result.cookies?.length) headers["Set-Cookie"] = result.cookies;
      if (result.redirect) {
        headers.Location = result.redirect;
        response.writeHead(result.status || 302, headers);
        response.end();
        return;
      }
      if (result.html) {
        headers["Content-Type"] = "text/html; charset=utf-8";
        response.writeHead(result.status || 200, headers);
        response.end(result.html);
        return;
      }
      headers["Content-Type"] = "application/json; charset=utf-8";
      response.writeHead(result.status || 200, headers);
      response.end(JSON.stringify(result.json ?? {}));
    } catch (error) {
      console.error("Account API failed", error);
      sendJson(response, 500, { error: "요청 처리 중 문제가 생겼어요." });
    }
    return;
  }

  if (pathname === "/admin.html" || pathname === "/admin") {
    const { currentSessionUser, parseCookies } = await authServiceModule;
    const cookies = parseCookies(request.headers.cookie);
    const user = await currentSessionUser({
      getCookie: (name) => cookies[name],
      env: localEnv,
      store: localUserStore,
    }).catch(() => null);
    if (user?.role !== "admin") {
      response.writeHead(302, { Location: user ? "/app.html?admin=denied" : "/app.html?auth=login&redirect=admin" });
      response.end();
      return;
    }
    if (pathname === "/admin") {
      response.writeHead(302, { Location: "/admin.html" });
      response.end();
      return;
    }
  }

  if (pathname === "/api/ai/usage") {
    if (request.method !== "GET") {
      sendJson(response, 405, { ok: false, error: "GET 요청만 사용할 수 있어요.", code: "METHOD_NOT_ALLOWED" });
      return;
    }
    const user = await currentLocalUser(request).catch(() => null);
    if (!user) {
      sendJson(response, 401, { ok: false, error: "로그인 후 사용량을 확인할 수 있어요.", code: "AUTH_REQUIRED" });
      return;
    }
    try {
      const { getAiCreditUsage } = await aiCreditsServiceModule;
      sendJson(response, 200, await getAiCreditUsage({ store: localUserStore, userId: user.id }));
    } catch (error) {
      sendJson(response, error?.status || 500, aiErrorBody(error));
    }
    return;
  }

  if (pathname === "/api/ai/trial/start") {
    if (request.method !== "POST") {
      sendJson(response, 405, { ok: false, error: "POST 요청만 사용할 수 있어요.", code: "METHOD_NOT_ALLOWED" });
      return;
    }
    const user = await currentLocalUser(request).catch(() => null);
    if (!user) {
      sendJson(response, 401, { ok: false, error: "로그인 후 무료 체험을 시작할 수 있어요.", code: "AUTH_REQUIRED" });
      return;
    }
    try {
      const { startAiTrial } = await aiCreditsServiceModule;
      const result = await startAiTrial({ store: localUserStore, userId: user.id });
      const refreshedUser = await localUserStore.getUser(user.id);
      sendJson(response, 200, {
        ...result,
        user: refreshedUser ? {
          id: refreshedUser.id,
          name: refreshedUser.name,
          email: refreshedUser.email || "",
          provider: refreshedUser.provider,
          role: refreshedUser.role || "user",
          status: refreshedUser.status || "active",
          plan: refreshedUser.plan || "free",
          trialStartedAt: refreshedUser.trialStartedAt || null,
          trialExpiresAt: refreshedUser.trialExpiresAt || null,
          trialUsedAt: refreshedUser.trialUsedAt || null,
          trialEndedAt: refreshedUser.trialEndedAt || null,
          goalPlanGeneratedAt: refreshedUser.goalPlanGeneratedAt || null,
        } : null,
      });
    } catch (error) {
      const { getAiCreditUsage } = await aiCreditsServiceModule;
      const usage = await getAiCreditUsage({ store: localUserStore, userId: user.id }).catch(() => null);
      sendJson(response, error?.status || 500, aiErrorBody(error, usage));
    }
    return;
  }

  const aiGenerationRoute = AI_GENERATION_ROUTES[pathname];
  if (aiGenerationRoute) {
    await handleLocalAiGenerationRequest({ request, response, route: aiGenerationRoute });
    return;
  }

  if (pathname === "/api/funnel") {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "POST 요청만 사용할 수 있어요." });
      return;
    }

    try {
      const body = await readJsonBody(request, 1000).catch(() => ({}));
      const { recordFunnelEvent } = await workerModule;
      // 로컬 개발용 퍼널 카운터: tmp/dev-funnel.json (git에 올라가지 않음)
      const funnelFile = path.join(root, "tmp", "dev-funnel.json");
      const readAllFunnel = () => {
        try {
          return JSON.parse(fs.readFileSync(funnelFile, "utf8"));
        } catch {
          return {};
        }
      };
      const kv = {
        get: async (key) => {
          const all = readAllFunnel();
          return all[key] ? JSON.stringify(all[key]) : null;
        },
        put: async (key, value) => {
          const all = readAllFunnel();
          all[key] = JSON.parse(value);
          fs.mkdirSync(path.dirname(funnelFile), { recursive: true });
          fs.writeFileSync(funnelFile, JSON.stringify(all, null, 2), "utf8");
        },
      };
      await recordFunnelEvent({ step: body.step, kv });
    } catch (error) {
      console.error("Funnel event failed", error);
    }
    response.writeHead(204, { "Cache-Control": "no-store" });
    response.end();
    return;
  }

  const staticEntries = {
    "/": "/index.html",
    "/app": "/app.html",
    "/privacy": "/privacy.html",
    "/terms": "/terms.html",
    "/support": "/support.html",
    "/delete-account": "/delete-account.html",
  };
  pathname = staticEntries[pathname] || pathname;

  const requestedPath = path.resolve(root, decodeURIComponent(pathname).replace(/^\/+/, ""));
  const relativePath = path.relative(root, requestedPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  fs.readFile(requestedPath, (error, data) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(requestedPath)] || "application/octet-stream",
    });
    response.end(data);
  });
});

server.listen(port, host, () => {
  console.log(`On My Way is running at http://${host}:${port}/`);
});
