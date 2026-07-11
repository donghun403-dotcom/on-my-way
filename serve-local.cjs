const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT || 8765);
const host = "127.0.0.1";
const root = path.resolve(__dirname);
const aiGoalPlanModule = import("./ai-goal-plan.mjs");

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

  try {
    pathname = new URL(request.url || "/", `http://${host}:${port}`).pathname;
  } catch {
    pathname = "/";
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
