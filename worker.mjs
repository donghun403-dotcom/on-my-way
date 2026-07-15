import { createAiGoalPlan } from "./ai-goal-plan.mjs";
import { createCompanionReply } from "./ai-companion-chat.mjs";
import { createAiPlanRevision } from "./ai-plan-revision.mjs";
import {
  handleAccountApi,
  parseCookies,
  createKvStore,
  createLegalRetentionStore,
  currentSessionUser,
  renewDueSubscriptions,
  purgeDueAccountDeletions,
} from "./auth-service.mjs";

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function accountResultToResponse(result) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  for (const value of result.cookies || []) headers.append("Set-Cookie", value);
  if (result.redirect) {
    headers.set("Location", result.redirect);
    return new Response(null, { status: result.status || 302, headers });
  }
  if (result.html) {
    headers.set("Content-Type", "text/html; charset=utf-8");
    return new Response(result.html, { status: result.status || 200, headers });
  }
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(result.json ?? {}), { status: result.status || 200, headers });
}

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://js.tosspayments.com",
  "style-src 'self' 'unsafe-inline' https://fastly.jsdelivr.net",
  "font-src 'self' data: https://fastly.jsdelivr.net",
  "img-src 'self' data: https:",
  "connect-src 'self' https://*.tosspayments.com",
  "frame-src https://*.tosspayments.com",
  "upgrade-insecure-requests",
].join("; ");

function secureResponse(response) {
  const secured = new Response(response.body, response);
  secured.headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  secured.headers.set("Referrer-Policy", "no-referrer");
  secured.headers.set("X-Content-Type-Options", "nosniff");
  secured.headers.set("X-Frame-Options", "DENY");
  secured.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(self)");
  secured.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  if (secured.headers.get("Content-Type")?.includes("text/html")) {
    secured.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  }
  return secured;
}

const FUNNEL_STEPS = new Set(["step1_enter", "step2_enter", "step3_enter", "step4_enter", "trial_start"]);

function funnelDateKey(now = Date.now()) {
  // 한국 시간 기준 일자 버킷
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function recordFunnelEvent({ step, kv, now = Date.now() }) {
  const name = String(step || "").replace(/^funnel:/, "");
  if (!FUNNEL_STEPS.has(name)) return null;
  const key = `funnel:${funnelDateKey(now)}`;
  let counts = {};
  try {
    counts = JSON.parse((await kv.get(key)) || "{}") || {};
  } catch (error) {
    counts = {};
  }
  counts[name] = Number(counts[name] || 0) + 1;
  // 근사 지표라 동시 요청 간 원자적 갱신은 생략
  await kv.put(key, JSON.stringify(counts), { expirationTtl: 60 * 60 * 24 * 90 });
  return { key, counts };
}

export async function createGoalPlanForUser({ input, env, userStore, user, generatePlan = createAiGoalPlan, now = Date.now() }) {
  const hasTrialLimit = user && user.role !== "admin" && user.plan !== "pro";
  if (hasTrialLimit && user.goalPlanGeneratedAt) {
    const error = new Error("무료 체험에서는 AI 목표 계획을 1개 만들 수 있어요. 기존 계획을 앱에서 이어가 주세요.");
    error.status = 409;
    error.code = "GOAL_PLAN_LIMIT_REACHED";
    throw error;
  }

  const result = await generatePlan(input, {
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL || "gpt-5.4-mini",
  });

  if (hasTrialLimit) {
    user.goalPlanGeneratedAt = now;
    await userStore.putUser(user);
  }
  return result;
}

async function handleFetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const origin = request.headers.get("origin");
      const isAppleCallback = url.pathname === "/api/auth/callback/apple" && request.method === "POST";
      const trustedApplePost = isAppleCallback && origin === "https://appleid.apple.com";
      if (origin && origin !== url.origin && !trustedApplePost) return json({ error: "허용되지 않은 요청 출처입니다." }, 403);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: "GET, POST, PUT, OPTIONS" } });
    }

    const cookies = parseCookies(request.headers.get("cookie"));
    const accountContext = {
      method: request.method,
      url,
      secure: url.protocol === "https:",
      getCookie: (name) => cookies[name],
      readJson: () => request.json().catch(() => ({})),
      readForm: async () => Object.fromEntries((await request.formData()).entries()),
      env,
      store: createKvStore(env.USERS_KV),
      // 전용 binding이 구성되면 물리적으로 분리하고, 그 전에는 USERS_KV의 legal: namespace로 논리 분리한다.
      legalStore: createLegalRetentionStore(env.LEGAL_RETENTION_KV || env.USERS_KV),
    };

    if (url.pathname === "/api/health" && request.method === "GET") {
      const billingConfigured = Boolean(env.TOSS_CLIENT_KEY && env.TOSS_SECRET_KEY);
      return json({
        ok: Boolean(env.USERS_KV),
        environment: String(env.APP_ENV || "unknown"),
        services: {
          accountStorage: Boolean(env.USERS_KV),
          ai: Boolean(env.OPENAI_API_KEY),
          payments: billingConfigured && String(env.PAYMENTS_ENABLED || "").toLowerCase() === "true",
        },
      }, env.USERS_KV ? 200 : 503);
    }

    if (url.pathname === "/admin.html" || url.pathname === "/admin") {
      if (!env.USERS_KV) return json({ error: "USERS_KV 바인딩이 필요합니다." }, 503);
      try {
        const user = await currentSessionUser(accountContext);
        if (user?.role !== "admin") {
          const location = user ? "/app.html?admin=denied" : "/app.html?auth=login&redirect=admin";
          return Response.redirect(new URL(location, url.origin), 302);
        }
        if (url.pathname === "/admin") return Response.redirect(new URL("/admin.html", url.origin), 302);
      } catch (error) {
        console.error("Admin access check failed", error);
        return json({ error: "관리자 접근을 확인하지 못했습니다." }, 500);
      }
    }

    if (url.pathname.startsWith("/api/auth/") || url.pathname.startsWith("/api/account/") || url.pathname.startsWith("/api/billing/") || url.pathname.startsWith("/api/admin/")) {
      if (!env.USERS_KV && url.pathname !== "/api/auth/providers") return json({ error: "회원 저장소 설정이 필요합니다." }, 503);
      try {
        if (url.pathname === "/api/admin/login" && request.method === "POST" && env.AI_RATE_LIMITER) {
          const actor = request.headers.get("cf-connecting-ip") || "anonymous";
          const { success } = await env.AI_RATE_LIMITER.limit({ key: `admin-login:${actor}` });
          if (!success) return json({ error: "로그인 시도가 잠시 많습니다. 1분 후 다시 시도해 주세요." }, 429);
        }
        const result = await handleAccountApi(accountContext);
        if (result) return accountResultToResponse(result);
        return json({ error: "요청을 처리할 수 없어요." }, 404);
      } catch (error) {
        console.error("Account API failed", error);
        return json({ error: "요청 처리 중 문제가 생겼어요." }, 500);
      }
    }

    if (url.pathname === "/api/ai/goal-plan") {
      if (request.method !== "POST") return json({ error: "POST 요청만 사용할 수 있어요." }, 405);

      if (!env.USERS_KV) return json({ error: "회원 저장소 설정이 필요합니다." }, 503);
      const userStore = createKvStore(env.USERS_KV);
      const user = await currentSessionUser({ ...accountContext, store: userStore });
      if (!user) return json({ error: "로그인 후 AI 기능을 이용할 수 있어요." }, 401);

      if (env.AI_RATE_LIMITER) {
        const actor = `${user.id}:${request.headers.get("cf-connecting-ip") || "unknown"}`;
        const { success } = await env.AI_RATE_LIMITER.limit({ key: `goal-plan:${actor}` });
        if (!success) return json({ error: "AI 요청이 잠시 많아요. 1분 후 다시 시도해 주세요." }, 429);
      }

      const contentLength = Number(request.headers.get("content-length") || 0);
      if (contentLength > 50000) return json({ error: "요청 내용이 너무 커요." }, 413);

      try {
        const input = await request.json();
        const result = await createGoalPlanForUser({ input, env, userStore, user });
        return json(result);
      } catch (error) {
        console.error("AI goal plan request failed", error);
        const message = error.status === 503 ? "올리가 계획을 준비하는 동안 연결이 지연되고 있어요." : error.message || "AI 계획을 만들지 못했어요.";
        return json({ error: message, code: error.code || undefined }, error.status || 500);
      }
    }

    if (url.pathname === "/api/ai/companion-chat") {
      if (request.method !== "POST") return json({ error: "POST 요청만 사용할 수 있어요." }, 405);

      if (!env.USERS_KV) return json({ error: "회원 저장소 설정이 필요합니다." }, 503);
      const user = await currentSessionUser(accountContext);
      if (!user) return json({ error: "로그인 후 AI 기능을 이용할 수 있어요." }, 401);

      if (env.AI_RATE_LIMITER) {
        const actor = `${user.id}:${request.headers.get("cf-connecting-ip") || "unknown"}`;
        const { success } = await env.AI_RATE_LIMITER.limit({ key: `companion-chat:${actor}` });
        if (!success) return json({ error: "올리가 잠시 바빠요. 1분 후 다시 말 걸어주세요." }, 429);
      }

      const contentLength = Number(request.headers.get("content-length") || 0);
      if (contentLength > 5000) return json({ error: "메시지가 너무 길어요." }, 413);

      try {
        const input = await request.json();
        const result = await createCompanionReply(input, {
          apiKey: env.OPENAI_API_KEY,
          model: env.OPENAI_MODEL || "gpt-5.4-mini",
        });
        return json(result);
      } catch (error) {
        console.error("Companion chat request failed", error);
        return json({ error: error.message || "올리의 답을 만들지 못했어요.", code: error.code || undefined }, error.status || 500);
      }
    }

    if (url.pathname === "/api/ai/plan-revision") {
      if (request.method !== "POST") return json({ error: "POST 요청만 사용할 수 있어요." }, 405);

      if (!env.USERS_KV) return json({ error: "회원 저장소 설정이 필요합니다." }, 503);
      const user = await currentSessionUser(accountContext);
      if (!user) return json({ error: "로그인 후 AI 기능을 이용할 수 있어요." }, 401);

      if (env.AI_RATE_LIMITER) {
        const actor = `${user.id}:${request.headers.get("cf-connecting-ip") || "unknown"}`;
        const { success } = await env.AI_RATE_LIMITER.limit({ key: `plan-revision:${actor}` });
        if (!success) return json({ error: "AI 수정 요청이 잠시 많아요. 1분 후 다시 시도해 주세요." }, 429);
      }

      const contentLength = Number(request.headers.get("content-length") || 0);
      if (contentLength > 20000) return json({ error: "수정 요청 내용이 너무 커요." }, 413);

      try {
        const input = await request.json();
        const result = await createAiPlanRevision(input, {
          apiKey: env.OPENAI_API_KEY,
          model: env.OPENAI_MODEL || "gpt-5.4-mini",
        });
        return json(result);
      } catch (error) {
        console.error("AI plan revision request failed", error);
        return json({ error: error.message || "AI 변경안을 만들지 못했어요.", code: error.code || undefined }, error.status || 500);
      }
    }

    if (url.pathname === "/api/funnel") {
      if (request.method !== "POST") return json({ error: "POST 요청만 사용할 수 있어요." }, 405);
      try {
        const body = await request.json().catch(() => ({}));
        if (env.USERS_KV) await recordFunnelEvent({ step: body.step, kv: env.USERS_KV });
      } catch (error) {
        console.error("Funnel event failed", error);
      }
      return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "요청한 API 경로를 찾을 수 없어요." }, 404);
    }

    const staticEntries = new Map([
      ["/", "/index.html"],
      ["/app", "/app.html"],
      ["/privacy", "/privacy.html"],
      ["/terms", "/terms.html"],
      ["/support", "/support.html"],
      ["/delete-account", "/delete-account.html"],
    ]);
    if ((request.method === "GET" || request.method === "HEAD") && staticEntries.has(url.pathname)) {
      const assetUrl = new URL(request.url);
      assetUrl.pathname = staticEntries.get(url.pathname);
      return env.ASSETS.fetch(new Request(assetUrl.toString(), request));
    }

    return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env) {
    return secureResponse(await handleFetch(request, env));
  },
  async scheduled(_controller, env, ctx) {
    if (!env.USERS_KV) return;
    const userStore = createKvStore(env.USERS_KV);
    ctx.waitUntil(
      Promise.all([
        renewDueSubscriptions({ env, store: userStore }).then((result) => console.log("Subscription renewal completed", result)),
        purgeDueAccountDeletions({ store: userStore }).then((result) => console.log("Account deletion purge completed", result)),
      ]),
    );
  },
};
