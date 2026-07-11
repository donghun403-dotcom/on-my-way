const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT || 8765);
const host = "127.0.0.1";
const root = path.resolve(__dirname);
const aiGoalPlanModule = import("./ai-goal-plan.mjs");
const aiPlanRevisionModule = import("./ai-plan-revision.mjs");
const authServiceModule = import("./auth-service.mjs");
const localEnv = {
  ...process.env,
  ALLOW_DEV_LOGIN: process.env.ALLOW_DEV_LOGIN || "true",
  ALLOW_DEMO_BILLING: process.env.ALLOW_DEMO_BILLING || "true",
  SESSION_SECRET: process.env.SESSION_SECRET || "omw-local-development-session-secret",
};

// 로컬 개발용 회원 저장소: tmp/dev-users.json (git에 올라가지 않음)
const devUsersFile = path.join(root, "tmp", "dev-users.json");

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

const server = http.createServer(async (request, response) => {
  let pathname = "/";
  let requestUrl = new URL("/", `http://${host}:${port}`);

  try {
    requestUrl = new URL(request.url || "/", `http://${host}:${port}`);
    pathname = requestUrl.pathname;
  } catch {
    pathname = "/";
  }

  if (pathname.startsWith("/api/auth/") || pathname.startsWith("/api/billing/") || pathname.startsWith("/api/admin/")) {
    try {
      const { handleAccountApi, parseCookies } = await authServiceModule;
      const cookies = parseCookies(request.headers.cookie);
      const result = await handleAccountApi({
        method: request.method,
        url: requestUrl,
        secure: false,
        getCookie: (name) => cookies[name],
        readJson: () => readJsonBody(request, 10000).catch(() => ({})),
        env: localEnv,
        store: localUserStore,
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
      sendJson(response, error.status || 500, { error: error.message || "AI 계획을 만들지 못했어요." });
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

  if (pathname === "/") {
    pathname = "/index.html";
  }

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
