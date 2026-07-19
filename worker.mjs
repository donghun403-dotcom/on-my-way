import { createAiGoalPlan } from "./ai-goal-plan.mjs";
import { createCompanionReply } from "./ai-companion-chat.mjs";
import { createAiPlanRevision } from "./ai-plan-revision.mjs";
import {
  commitAiCredits,
  getAiCreditUsage,
  releaseAiCredits,
  reserveAiCredits,
  startAiTrial,
  withAiCreditUserLock,
} from "./ai-credits-service.mjs";
import {
  handleAccountApi,
  parseCookies,
  createKvStore,
  createLegalRetentionStore,
  currentSessionUser,
  billingStatus,
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

const FUNNEL_STEPS = new Set([
  "step1_enter",
  "step2_enter",
  "step3_enter",
  "step4_enter",
  "trial_start",
  "pricing_viewed",
  "pricing_plan_selected",
  "trial_started",
  "trial_completed",
  "trial_credit_exhausted",
  "pro_cta_clicked",
  "ai_credit_insufficient",
  "ai_credit_charged",
  "usage_details_opened",
]);

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
  const hasFreeLimit = user && user.role !== "admin" && user.plan === "free";
  if (hasFreeLimit && user.goalPlanGeneratedAt) {
    const error = new Error("Free 플랜에서는 목표와 활성 계획을 1개까지 이용할 수 있어요. 기존 계획의 수정에서 이어가 주세요.");
    error.status = 409;
    error.code = "GOAL_PLAN_LIMIT_REACHED";
    throw error;
  }

  const result = await generatePlan(input, {
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL || "gpt-5.4-mini",
  });

  if (user && user.role !== "admin") {
    await withAiCreditUserLock(user.id, async () => {
      const latestUser = await userStore.getUser(user.id);
      if (!latestUser || (latestUser.status && latestUser.status !== "active")) {
        const error = new Error("계정 상태가 변경되어 생성한 계획을 저장하지 않았어요.");
        error.status = 409;
        error.code = "ACCOUNT_INACTIVE";
        throw error;
      }
      latestUser.goalPlanGeneratedAt = now;
      await userStore.putUser(latestUser);
      Object.assign(user, latestUser);
    });
  }
  return result;
}

const AI_GENERATION_ROUTES = Object.freeze({
  "/api/ai/goal-plan": { action: "create_plan", kind: "goal", maxBytes: 50_000 },
  "/api/ai/companion-chat": { action: "companion_chat", kind: "companion", maxBytes: 5_000 },
  "/api/ai/plan-revision": { action: "revise_plan", kind: "revision", maxBytes: 20_000 },
  "/api/ai/recovery-plan": { action: "recovery_plan", kind: "revision", maxBytes: 20_000 },
  "/api/ai/reschedule-plan": { action: "reschedule_plan", kind: "revision", maxBytes: 20_000 },
});

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
  return payload;
}

async function readBoundedJson(request, maxBytes) {
  const reader = request.body?.getReader();
  if (!reader) {
    const error = new Error("요청 형식이 올바르지 않아요.");
    error.status = 400;
    error.code = "INVALID_JSON";
    throw error;
  }
  const decoder = new TextDecoder();
  let byteLength = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel().catch(() => {});
        const error = new Error("요청 내용이 너무 커요.");
        error.status = 413;
        error.code = "AI_REQUEST_TOO_LARGE";
        throw error;
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch {
    if (byteLength > maxBytes) {
      const error = new Error("요청 내용이 너무 커요.");
      error.status = 413;
      error.code = "AI_REQUEST_TOO_LARGE";
      throw error;
    }
    const error = new Error("요청 형식이 올바르지 않아요.");
    error.status = 400;
    error.code = "INVALID_JSON";
    throw error;
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error("요청 형식이 올바르지 않아요.");
    error.status = 400;
    error.code = "INVALID_JSON";
    throw error;
  }
}

async function handleAiGenerationRequest({ request, env, accountContext, route }) {
  if (request.method !== "POST") return json({ ok: false, error: "POST 요청만 사용할 수 있어요.", code: "METHOD_NOT_ALLOWED" }, 405);

  const userStore = accountContext.store;
  const user = await currentSessionUser(accountContext);
  if (!user) return json({ ok: false, error: "로그인 후 AI 기능을 이용할 수 있어요.", code: "AUTH_REQUIRED" }, 401);

  if (env.AI_RATE_LIMITER) {
    const actor = `${user.id}:${request.headers.get("cf-connecting-ip") || "unknown"}`;
    const { success } = await env.AI_RATE_LIMITER.limit({ key: `ai:${route.action}:${actor}` });
    if (!success) return json({ ok: false, error: "AI 요청이 잠시 많아요. 1분 뒤 다시 시도해 주세요.", code: "AI_RATE_LIMITED" }, 429);
  }

  const requestId = String(request.headers.get("x-request-id") || "").trim();
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > route.maxBytes) {
    return json({ ok: false, error: "요청 내용이 너무 커요.", code: "AI_REQUEST_TOO_LARGE" }, 413);
  }

  let input;
  try {
    input = await readBoundedJson(request, route.maxBytes);
  } catch (error) {
    return json(aiErrorBody(error), error.status || 400);
  }

  let reservation = null;
  let providerCalled = false;
  const model = env.OPENAI_MODEL || "gpt-5.4-mini";
  try {
    reservation = await reserveAiCredits({ store: userStore, userId: user.id, action: route.action, requestId });

    let result;
    if (route.kind === "goal") {
      // Reload after the reservation write so the goal-limit write cannot overwrite credit state.
      const creditAwareUser = await userStore.getUser(user.id);
      result = await createGoalPlanForUser({ input, env, userStore, user: creditAwareUser });
    } else if (route.kind === "companion") {
      result = await createCompanionReply(input, {
        apiKey: env.OPENAI_API_KEY,
        model,
        allowPersonalization: ["pro", "trial"].includes(reservation.usage.plan),
      });
    } else {
      result = await createAiPlanRevision(input, { apiKey: env.OPENAI_API_KEY, model });
    }
    providerCalled = true;

    const committed = await commitAiCredits({
      store: userStore,
      userId: user.id,
      requestId,
      ...providerMetadata(result, model),
    });
    return json({
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
          store: userStore,
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
    const usage = await getAiCreditUsage({ store: userStore, userId: user.id }).catch(() => null);
    return json(aiErrorBody(error, usage), error?.status || 500);
  }
}

const NON_HTML_ASSET_PATH = /\.(?:mjs|js|css)$/i;

async function fetchStaticAsset(request, env) {
  const response = await env.ASSETS.fetch(request);
  const url = new URL(request.url);
  const contentType = response.headers.get("content-type") || "";
  if (NON_HTML_ASSET_PATH.test(url.pathname) && response.ok && contentType.toLowerCase().includes("text/html")) {
    return new Response("Static asset not found.", {
      status: 404,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return response;
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
      const billing = billingStatus(env);
      return json({
        ok: Boolean(env.USERS_KV),
        environment: String(env.APP_ENV || "unknown"),
        services: {
          accountStorage: Boolean(env.USERS_KV),
          ai: Boolean(env.OPENAI_API_KEY),
          payments: billing.enabled,
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

    if (url.pathname === "/api/ai/usage") {
      if (request.method !== "GET") return json({ ok: false, error: "GET 요청만 사용할 수 있어요.", code: "METHOD_NOT_ALLOWED" }, 405);
      if (!env.USERS_KV) return json({ ok: false, error: "회원 저장소 설정이 필요합니다.", code: "ACCOUNT_STORAGE_UNAVAILABLE" }, 503);
      const user = await currentSessionUser(accountContext);
      if (!user) return json({ ok: false, error: "로그인 후 사용량을 확인할 수 있어요.", code: "AUTH_REQUIRED" }, 401);
      try {
        return json(await getAiCreditUsage({ store: accountContext.store, userId: user.id }));
      } catch (error) {
        return json(aiErrorBody(error), error?.status || 500);
      }
    }

    if (url.pathname === "/api/ai/trial/start") {
      if (request.method !== "POST") return json({ ok: false, error: "POST 요청만 사용할 수 있어요.", code: "METHOD_NOT_ALLOWED" }, 405);
      if (!env.USERS_KV) return json({ ok: false, error: "회원 저장소 설정이 필요합니다.", code: "ACCOUNT_STORAGE_UNAVAILABLE" }, 503);
      const user = await currentSessionUser(accountContext);
      if (!user) return json({ ok: false, error: "로그인 후 무료 체험을 시작할 수 있어요.", code: "AUTH_REQUIRED" }, 401);
      try {
        const result = await startAiTrial({ store: accountContext.store, userId: user.id });
        const refreshedUser = await accountContext.store.getUser(user.id);
        return json({ ...result, user: refreshedUser ? {
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
        } : null });
      } catch (error) {
        const usage = await getAiCreditUsage({ store: accountContext.store, userId: user.id }).catch(() => null);
        return json(aiErrorBody(error, usage), error?.status || 500);
      }
    }

    const aiGenerationRoute = AI_GENERATION_ROUTES[url.pathname];
    if (aiGenerationRoute) {
      if (!env.USERS_KV) return json({ ok: false, error: "회원 저장소 설정이 필요합니다.", code: "ACCOUNT_STORAGE_UNAVAILABLE" }, 503);
      return handleAiGenerationRequest({ request, env, accountContext, route: aiGenerationRoute });
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

    return fetchStaticAsset(request, env);
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
