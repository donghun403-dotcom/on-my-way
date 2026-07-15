const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT || 8765);
const host = "127.0.0.1";
const root = path.resolve(__dirname);
const aiGoalPlanModule = import("./ai-goal-plan.mjs");
const aiPlanRevisionModule = import("./ai-plan-revision.mjs");
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
    return readDevUsers()[id] || null;
  },
  async putUser(user) {
    const users = readDevUsers();
    users[user.id] = user;
    writeDevUsers(users);
  },
  async listUsers() {
    return Object.values(readDevUsers());
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
    return readDevSettings()[name] || null;
  },
  async putSetting(name, value) {
    const settings = readDevSettings();
    settings[name] = value;
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
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function readJsonBody(request, maxBytes = 50000) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > maxBytes) {
        const error = new Error("요청 내용이 너무 커요.");
        error.status = 413;
        reject(error);
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        const error = new Error("요청 형식이 올바르지 않아요.");
        error.status = 400;
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function readFormBody(request, maxBytes = 10000) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > maxBytes) {
        const error = new Error("요청 내용이 너무 커요.");
        error.status = 413;
        reject(error);
        request.destroy();
      }
    });
    request.on("end", () => resolve(Object.fromEntries(new URLSearchParams(body))));
    request.on("error", reject);
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

  if (pathname === "/api/ai/goal-plan") {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "POST 요청만 사용할 수 있어요." });
      return;
    }

    try {
      const input = await readJsonBody(request);
      const { createAiGoalPlan } = await aiGoalPlanModule;
      const result = await createAiGoalPlan(input, {
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
      });
      sendJson(response, 200, result);
    } catch (error) {
      console.error("AI goal plan request failed", error);
      const message = error.status === 503 ? "올리가 계획을 준비하는 동안 연결이 지연되고 있어요." : error.message || "AI 계획을 만들지 못했어요.";
      sendJson(response, error.status || 500, { error: message });
    }
    return;
  }

  if (pathname === "/api/ai/plan-revision") {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "POST 요청만 사용할 수 있어요." });
      return;
    }

    try {
      const input = await readJsonBody(request, 20000);
      const { createAiPlanRevision } = await aiPlanRevisionModule;
      const result = await createAiPlanRevision(input, {
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
      });
      sendJson(response, 200, result);
    } catch (error) {
      console.error("AI plan revision request failed", error);
      sendJson(response, error.status || 500, { error: error.message || "AI 변경안을 만들지 못했어요." });
    }
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
