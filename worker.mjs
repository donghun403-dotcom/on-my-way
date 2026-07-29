// 게스트 초안 라우트는 사라졌지만 Durable Object 클래스는 wrangler 마이그레이션이
// 참조하므로 계속 내보낸다.
import { GuestPlanDraftObject } from "./guest-plan-draft-object.mjs";
import { createCompanionReply, createCrisisReply, detectCrisisSignal, normalizeCheerEventType } from "./ai-companion-chat.mjs";
import { createAiPlanRevision } from "./ai-plan-revision.mjs";
import {
  safeAiDiagnostics,
  safeAiSuccessDiagnostics,
} from "./ai-output-contract.mjs";
import { PLAN_REVISION_MAX_OUTPUT_TOKENS } from "./ai-plan-output-policy.mjs";
import {
  commitAiCredits,
  getAiCreditUsage,
  releaseAiCredits,
  reserveAiCredits,
  startAiTrial,
  withAiCreditUserLock,
} from "./ai-credits-service.mjs";
// 에너지 원장은 유저별 Durable Object가 권위다. KV read-modify-write로는 서로 다른
// 아이솔레이트의 동시 요청을 직렬화할 수 없어 이중 차감을 막지 못한다.
import { EnergyLedgerObject } from "./energy-ledger-object.mjs";
import { createEnergyLedgerClient, describeTrial, resolveUserPlan } from "./energy-ledger-client.mjs";
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
  "script-src 'self' 'unsafe-inline' https://js.tosspayments.com https://static.cloudflareinsights.com/beacon.min.js https://static.cloudflareinsights.com/beacon.min.js/",
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
  "plan_complete",
  "signup_gate_shown",
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

// 무료 치어링(축하·위로)은 올리 에너지를 차감하지 않는 대신 KST 기준 하루 각 1회로 서버가 상한을 건다.
// (docs/pricing-system-v2.md의 비용 가드레일 — 클라이언트 상한만 믿지 않는다)
export function checkDailyCheerAllowance(user, eventType, now = Date.now()) {
  const dateKey = funnelDateKey(now);
  const log = user?.cheerLog && user.cheerLog.date === dateKey ? { ...user.cheerLog } : { date: dateKey };
  if (log[eventType]) return { allowed: false, user };
  log[eventType] = now;
  return { allowed: true, user: { ...user, cheerLog: log } };
}

/* 오늘의 무료 응원을 "선점"한다. 크레딧과 같은 유저 락 안에서 읽고 쓰기 때문에
   동시에 들어온 요청 중 하나만 true를 받는다. 확인만 하고 AI를 부른 뒤 기록하면
   겹친 요청이 전부 통과해 provider 비용이 중복 발생하므로, 크레딧과 똑같이
   "먼저 잡고 실패하면 되돌린다"로 간다.
   세션은 유효하지만 저장된 회원 레코드가 없는 경우(관리자 비밀번호 세션)는
   회계할 대상이 없으므로 잡지 않는다 — 없는 레코드를 새로 만들지 않기 위해서다. */
export function claimDailyCheer({ store, userId, eventType, now = Date.now() }) {
  return withAiCreditUserLock(userId, async () => {
    const latest = await store.getUser(userId);
    if (!latest) return false;
    const claimed = checkDailyCheerAllowance(latest, eventType, now);
    if (!claimed.allowed) return false;
    await store.putUser(claimed.user);
    return true;
  });
}

/* 잡아 둔 오늘의 응원을 되돌린다. AI가 답을 만들지 못했으면 다시 시도할 수 있어야 한다. */
export function releaseDailyCheer({ store, userId, eventType, now = Date.now() }) {
  return withAiCreditUserLock(userId, async () => {
    const latest = await store.getUser(userId);
    if (!latest?.cheerLog || latest.cheerLog.date !== funnelDateKey(now) || !latest.cheerLog[eventType]) return false;
    const log = { ...latest.cheerLog };
    delete log[eventType];
    await store.putUser({ ...latest, cheerLog: log });
    return true;
  });
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

const AI_GENERATION_ROUTES = Object.freeze({
  // 계획은 유저가 수동 빌더로 직접 만든다. AI는 이미 있는 계획을 다듬고 대화하는 데만 쓴다.
  "/api/ai/companion-chat": { action: "companion_chat", kind: "companion", maxBytes: 5_000 },
  "/api/ai/plan-revision": { action: "revise_plan", kind: "revision", maxBytes: 20_000 },
  "/api/ai/recovery-plan": { action: "recovery_plan", kind: "revision", maxBytes: 20_000 },
  "/api/ai/reschedule-plan": { action: "reschedule_plan", kind: "revision", maxBytes: 20_000 },
});

// 게스트 온보딩 라우트는 사라졌지만 /api/health의 services.ai가 이 판정을 쓰고,
// 스테이징 배포 워크플로가 그 값으로 게이트한다. GUEST_PLAN_DRAFTS는 아직 모든
// wrangler 설정에 바인딩돼 있어 검사 대상으로 남긴다.
export function getGuestAiReadiness(env = {}) {
  const missingDependencies = [];
  const invalidDependencies = [];
  const requireBinding = (name, value, isValid) => {
    if (value === undefined || value === null || value === "") {
      missingDependencies.push(name);
    } else if (!isValid(value)) {
      invalidDependencies.push(name);
    }
  };

  requireBinding("OPENAI_API_KEY", env.OPENAI_API_KEY, (value) => String(value).trim().length > 0);
  requireBinding("SESSION_SECRET", env.SESSION_SECRET, (value) => String(value).length >= 32);
  requireBinding("USERS_KV", env.USERS_KV, (value) => (
    typeof value?.get === "function" && typeof value?.put === "function"
  ));
  requireBinding("AI_RATE_LIMITER", env.AI_RATE_LIMITER, (value) => typeof value?.limit === "function");
  requireBinding("GUEST_PLAN_DRAFTS", env.GUEST_PLAN_DRAFTS, (value) => (
    typeof value?.idFromName === "function" && typeof value?.get === "function"
  ));
  requireBinding("ENERGY_LEDGER", env.ENERGY_LEDGER, (value) => (
    typeof value?.idFromName === "function" && typeof value?.get === "function"
  ));
  return {
    ready: missingDependencies.length === 0 && invalidDependencies.length === 0,
    missingDependencies,
    invalidDependencies,
  };
}

function aiErrorBody(error, usage = null) {
  const body = {
    ok: false,
    error: error?.message || "AI 요청을 처리하지 못했어요.",
    code: error?.code || "AI_REQUEST_FAILED",
    retryable: Boolean(error?.retryable),
  };
  if (error?.details && !error?.diagnostics) body.details = error.details;
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

  const cheerEventType = route.kind === "companion" ? normalizeCheerEventType(input?.eventType) : "chat";
  const isFreeCheer = cheerEventType !== "chat";

  // 원장 바인딩이 있으면 그쪽이 권위다. 없으면(로컬·구버전 환경) 기존 KV 경로로
  // 물러난다 — 배포 환경에는 항상 있고 CI 설정 검증이 그것을 고정한다.
  const ledger = createEnergyLedgerClient(env);
  const userPlan = resolveUserPlan(user);
  const userTrial = describeTrial(user);

  /* 위기 신호는 예약보다 먼저 걸러 낸다. 잡았다가 되돌리는 방식이면 되돌리기가 실패했을 때
     힘든 말을 꺼낸 대가로 에너지가 사라진다. 아예 재화 경로에 들어가지 않는 편이 확실하다.
     AI도 부르지 않으므로 이 답에는 모델이 무슨 말을 할지 모르는 구간이 없다. */
  if (route.kind === "companion" && !isFreeCheer && detectCrisisSignal(input?.message)) {
    const usage = ledger
      ? await ledger.usage(user.id, { plan: userPlan, trial: userTrial }).catch(() => null)
      : await getAiCreditUsage({ store: userStore, userId: user.id }).catch(() => null);
    return json({
      ok: true,
      ...publicAiResult(createCrisisReply()),
      requestId,
      chargedCredits: 0,
      ...(usage ? { usage } : {}),
    });
  }

  let reservation = null;
  let providerCalled = false;
  let cheerClaimed = false;
  const model = env.OPENAI_MODEL || "gpt-5.4-mini";
  const aiCorrelationId = crypto.randomUUID();
  let aiStartedAt = 0;
  try {
    if (isFreeCheer) {
      /* 자동 치어링(축하·위로)은 유료 재화를 쓰지 않는 대신 하루 각 1회라는 별도
         상한을 탄다. AI를 부르기 전에 자리를 잡아야 상한 초과 요청이 provider
         비용을 만들지 않는다. 자리잡기 자체가 KV 오류로 실패하는 경우까지 try 안에
         두어, 크레딧 예약이 실패했을 때와 같은 모양(aiErrorBody)으로 응답한다. */
      cheerClaimed = await claimDailyCheer({ store: userStore, userId: user.id, eventType: cheerEventType });
      if (!cheerClaimed) {
        return json({ ok: false, error: "오늘의 무료 응원은 이미 전해드렸어요. 내일 또 만나요!", code: "CHEER_LIMIT_REACHED" }, 429);
      }
    } else if (ledger) {
      reservation = await ledger.reserve(user.id, { plan: userPlan, action: route.action, requestId, trial: userTrial });
    } else {
      reservation = await reserveAiCredits({ store: userStore, userId: user.id, action: route.action, requestId });
    }

    let result;
    aiStartedAt = Date.now();
    if (route.kind === "companion") {
      result = await createCompanionReply(input, {
        apiKey: env.OPENAI_API_KEY,
        model,
        allowPersonalization: !isFreeCheer && ["pro", "trial"].includes(reservation.usage.plan),
      });
    } else {
      result = await createAiPlanRevision(input, { apiKey: env.OPENAI_API_KEY, model });
    }
    providerCalled = true;
    if (route.kind === "revision") {
      console.info(`AI ${route.action} completed`, safeAiSuccessDiagnostics(result, {
        correlationId: aiCorrelationId,
        environment: env.APP_ENV || "unknown",
        model,
        operation: route.action,
        latencyMs: Date.now() - aiStartedAt,
      }));
    }

    if (isFreeCheer) {
      // 자리는 이미 잡아 뒀다. 답이 나왔으니 그대로 소진 상태로 둔다.
      return json({ ok: true, ...publicAiResult(result), requestId, eventType: cheerEventType, chargedCredits: 0 });
    }

    const committed = ledger
      ? await ledger.commit(user.id, { plan: userPlan, requestId, meta: { model }, trial: userTrial })
      : await commitAiCredits({
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
    console.error(`AI ${route.action} request failed`, safeAiDiagnostics(error, {
      correlationId: aiCorrelationId,
      environment: env.APP_ENV || "unknown",
      model,
      operation: route.action,
      latencyMs: aiStartedAt ? Date.now() - aiStartedAt : 0,
      maxOutputTokens: route.kind === "revision" ? PLAN_REVISION_MAX_OUTPUT_TOKENS : 0,
    }));
    if (cheerClaimed) {
      // AI가 답을 만들지 못했으면 잡아 둔 오늘의 응원을 돌려준다 (다시 시도할 수 있어야 한다).
      try {
        await releaseDailyCheer({ store: userStore, userId: user.id, eventType: cheerEventType });
      } catch (releaseError) {
        console.error("Daily cheer release failed", {
          correlationId: aiCorrelationId,
          errorCategory: releaseError?.code || "CHEER_RELEASE_FAILED",
        });
      }
    }
    if (reservation?.shouldExecute) {
      try {
        if (ledger) {
          await ledger.release(user.id, {
            plan: userPlan,
            requestId,
            errorCode: error?.code || "AI_REQUEST_FAILED",
            trial: userTrial,
          });
        } else {
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
        }
      } catch (releaseError) {
        console.error("AI credit reservation release failed", {
          correlationId: aiCorrelationId,
          errorCategory: releaseError?.code || "AI_CREDIT_RELEASE_FAILED",
        });
      }
    }
    const usage = ledger
      ? await ledger.usage(user.id, { plan: userPlan, trial: userTrial }).catch(() => null)
      : await getAiCreditUsage({ store: userStore, userId: user.id }).catch(() => null);
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
      const guestAi = getGuestAiReadiness(env);
      return json({
        ok: Boolean(env.USERS_KV),
        environment: String(env.APP_ENV || "unknown"),
        services: {
          accountStorage: Boolean(env.USERS_KV),
          ai: guestAi.ready,
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
        // 조회 전용. 클라이언트가 만질 수 있는 에너지 표면은 이것뿐이다.
        const ledger = createEnergyLedgerClient(env);
        if (ledger) return json(await ledger.usage(user.id, { plan: resolveUserPlan(user), trial: describeTrial(user) }));
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
        // 체험이 시작되면 원장을 체험 플랜 기준으로 다시 세운다. 이 시점에 지급이
        // 일어나야 체험 크레딧이 잔량에 실제로 들어온다.
        const trialLedger = createEnergyLedgerClient(env);
        if (trialLedger && refreshedUser) {
          await trialLedger
            .reset(user.id, { plan: resolveUserPlan(refreshedUser), reason: "trial_start" })
            .catch((error) => console.error("Trial ledger grant failed", { errorCategory: error?.code || "LEDGER_RESET_FAILED" }));
        }
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

export { GuestPlanDraftObject, EnergyLedgerObject };

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
