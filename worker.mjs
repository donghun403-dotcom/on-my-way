import { createAiGoalPlan, goalInputForHash, normalizeGoalInput } from "./ai-goal-plan.mjs";
import { GUEST_DRAFT_MAX_REVISIONS, GuestPlanDraftObject } from "./guest-plan-draft-object.mjs";
import { createCompanionReply } from "./ai-companion-chat.mjs";
import { createGoalAnalysis } from "./ai-goal-analysis.mjs";
import { createAiPlanRevision } from "./ai-plan-revision.mjs";
import {
  AI_CONTRACT_VERSIONS,
  safeAiDiagnostics,
  safeAiSuccessDiagnostics,
} from "./ai-output-contract.mjs";
import {
  AI_OUTPUT_BUDGET_VERSION,
  GOAL_PLAN_MAX_OUTPUT_TOKENS,
  PLAN_REVISION_MAX_OUTPUT_TOKENS,
} from "./ai-plan-output-policy.mjs";
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

  const planInput = {
    ...input,
    draftPlanId: String(input?.draftPlanId || "").trim() || crypto.randomUUID(),
  };
  const result = await generatePlan(planInput, {
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
  // 온보딩 1단계 자연어 → 이해 정리(저비용). 계획 생성은 2단계 확인 뒤 create_plan에서만 한다.
  "/api/ai/goal-analyze": { action: "analyze_goal", kind: "analyze", maxBytes: 5_000 },
  "/api/ai/goal-plan": { action: "create_plan", kind: "goal", maxBytes: 50_000 },
  "/api/ai/companion-chat": { action: "companion_chat", kind: "companion", maxBytes: 5_000 },
  "/api/ai/plan-revision": { action: "revise_plan", kind: "revision", maxBytes: 20_000 },
  "/api/ai/recovery-plan": { action: "recovery_plan", kind: "revision", maxBytes: 20_000 },
  "/api/ai/reschedule-plan": { action: "reschedule_plan", kind: "revision", maxBytes: 20_000 },
});

const GUEST_GOAL_ANALYZE_PATH = "/api/ai/goal-analyze";
const GUEST_GOAL_PREVIEW_PATH = "/api/ai/goal-preview";
const GUEST_GOAL_DRAFT_REVISE_PATH = "/api/ai/goal-draft/revise";
const GUEST_GOAL_DRAFT_CLAIM_PATH = "/api/ai/goal-draft/claim";
const GUEST_GOAL_PREVIEW_TTL_SECONDS = 24 * 60 * 60;
const GUEST_GOAL_DRAFT_COOKIE = "omw_guest_goal_draft";
const GUEST_GOAL_INPUT_SCHEMA_VERSION = 2;
const GUEST_GOAL_PROMPT_VERSION = AI_CONTRACT_VERSIONS.goalPlanPrompt;
const GUEST_GOAL_OUTPUT_SCHEMA_VERSION = AI_CONTRACT_VERSIONS.goalPlanSchema;
const GUEST_GOAL_OUTPUT_BUDGET_VERSION = AI_OUTPUT_BUDGET_VERSION;

async function hmacHex(secret, value) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function guestDraftCapability(secret, draftPlanId) {
  return hmacHex(secret, `guest-goal-draft-capability:v2:${draftPlanId}`);
}

async function legacyGuestDraftCapability(secret, draftPlanId, actorHash) {
  return hmacHex(secret, `guest-goal-draft-capability:${draftPlanId}:${actorHash}`);
}

async function guestDraftCapabilityHash(secret, draftPlanId, capability) {
  return hmacHex(secret, `guest-goal-draft-proof:${draftPlanId}:${capability}`);
}

async function guestDraftId(secret, actorHash, actorInputHash) {
  const hex = await hmacHex(secret, `guest-goal-draft-id:v1:${actorHash}:${actorInputHash}`);
  const variant = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function guestDraftPreviewResponse(body, capability) {
  const response = json(body);
  response.headers.append(
    "Set-Cookie",
    `${GUEST_GOAL_DRAFT_COOKIE}=${capability}; Max-Age=${GUEST_GOAL_PREVIEW_TTL_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`,
  );
  return response;
}

function guestGoalPreview(plan = {}) {
  const feasibility = plan?.feasibility && typeof plan.feasibility === "object"
    ? {
        status: String(plan.feasibility.status || ""),
        summary: String(plan.feasibility.summary || ""),
        recommendedOption: String(plan.feasibility.recommendedOption || ""),
        adjustmentOptions: Array.isArray(plan.feasibility.adjustmentOptions)
          ? plan.feasibility.adjustmentOptions.slice(0, 4).map(String)
          : [],
      }
    : null;
  const scheduleContract = plan?.scheduleContract && typeof plan.scheduleContract === "object"
    ? {
        timezone: String(plan.scheduleContract.timezone || ""),
        startDate: String(plan.scheduleContract.startDate || ""),
        generatedDays: Number(plan.scheduleContract.generatedDays || 0),
        exactDatesServerDerived: plan.scheduleContract.exactDatesServerDerived === true,
        requiresAdjustmentBeforeClaim: plan.scheduleContract.requiresAdjustmentBeforeClaim === true,
      }
    : null;
  return {
    personalitySummary: String(plan.personalitySummary || ""),
    planningStyle: String(plan.planningStyle || ""),
    firstAction: String(plan.firstAction || ""),
    weekTitle: String(plan.weekTitle || ""),
    weekPlan: Array.isArray(plan.weekPlan) ? plan.weekPlan.slice(0, 7).map(String) : [],
    coachMessage: String(plan.coachMessage || ""),
    feasibility,
    scheduleContract,
    feasibilitySummary: String(plan.feasibilitySummary || feasibility?.summary || ""),
    todaySchedule: Array.isArray(plan.todaySchedule)
      ? plan.todaySchedule.slice(0, 1).map((item) => ({
        time: String(item?.time || ""),
        durationMinutes: Number(item?.durationMinutes || 0),
        task: String(item?.task || ""),
        completionRule: String(item?.completionRule || ""),
      }))
      : [],
    firstWeekSchedule: Array.isArray(plan.firstWeekSchedule)
      ? plan.firstWeekSchedule.slice(0, 7).map((day) => ({
          dayNumber: Number(day?.dayNumber || 0),
          dayLabel: String(day?.dayLabel || ""),
          isRestDay: Boolean(day?.isRestDay),
          items: Array.isArray(day?.items) ? day.items.slice(0, 5).map((item) => ({
            id: String(item?.id || ""),
            planId: String(item?.planId || ""),
            type: String(item?.type || ""),
            title: String(item?.title || ""),
            sourceReference: String(item?.sourceReference || ""),
            quantityOrRange: String(item?.quantityOrRange || ""),
            durationMinutes: Number(item?.durationMinutes || 0),
            completionRule: String(item?.completionRule || ""),
            time: String(item?.time || ""),
            scheduledAt: String(item?.scheduledAt || ""),
            status: String(item?.status || "pending"),
            recurrenceGroupId: String(item?.recurrenceGroupId || ""),
          })) : [],
        }))
      : [],
    assumptions: Array.isArray(plan.assumptions) ? plan.assumptions.slice(0, 5).map(String) : [],
  };
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function guestGoalInputHash(input, versions = {}) {
  return sha256Hex(canonicalJson({
    inputSchemaVersion: versions.inputSchemaVersion || GUEST_GOAL_INPUT_SCHEMA_VERSION,
    promptVersion: versions.promptVersion || GUEST_GOAL_PROMPT_VERSION,
    outputSchemaVersion: versions.outputSchemaVersion || GUEST_GOAL_OUTPUT_SCHEMA_VERSION,
    outputBudgetVersion: versions.outputBudgetVersion || GUEST_GOAL_OUTPUT_BUDGET_VERSION,
    input: goalInputForHash(input),
  }));
}

async function guestPreviewIdentity(request, env) {
  const ip = String(request.headers.get("cf-connecting-ip") || "").trim();
  const userAgent = String(request.headers.get("user-agent") || "unknown").slice(0, 240);
  const secret = String(env.SESSION_SECRET || "");
  if (!ip || secret.length < 32) return null;
  const [ipHash, actorHash] = await Promise.all([
    hmacHex(secret, `guest-preview-ip:${ip}`),
    hmacHex(secret, `guest-preview-actor:${ip}|${userAgent}`),
  ]);
  return { ipHash, actorHash };
}

function guestDraftStub(env, draftPlanId) {
  if (!env.GUEST_PLAN_DRAFTS) return null;
  return env.GUEST_PLAN_DRAFTS.get(env.GUEST_PLAN_DRAFTS.idFromName(draftPlanId));
}

function validGuestDraftId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

async function guestDraftCommand(env, draftPlanId, command, body) {
  const stub = guestDraftStub(env, draftPlanId);
  if (!stub) return { response: null, body: { ok: false, code: "GUEST_DRAFT_STORAGE_UNAVAILABLE" } };
  const response = await stub.fetch(new Request(`https://guest-plan-draft.internal/${command}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
  return { response, body: await response.json().catch(() => ({ ok: false, code: "GUEST_DRAFT_STORAGE_INVALID" })) };
}

function guestDraftApiError(code, status, metadata = {}) {
  const messages = {
    GUEST_PREVIEW_ALREADY_USED: "오늘의 AI 계획 미리보기를 이미 사용했어요. 현재 초안에서 조건을 수정해 주세요.",
    GUEST_PREVIEW_PENDING: "AI 계획 미리보기를 만들고 있어요. 잠시 후 다시 확인해 주세요.",
    GUEST_PREVIEW_COOLDOWN: "AI 연결을 잠시 쉬고 있어요. 잠시 후 다시 시도해 주세요.",
    DRAFT_PLAN_EXPIRED: "계획 초안이 만료되었어요. 목표와 조건을 확인해 다시 만들어 주세요.",
    DRAFT_PLAN_ACCESS_DENIED: "이 브라우저에서 만든 계획 초안인지 확인하지 못했어요.",
    DRAFT_PLAN_ALREADY_CLAIMED: "이미 다른 계정에 저장된 계획 초안이에요.",
    DRAFT_REVISION_PENDING: "수정한 조건으로 계획을 만드는 중이에요.",
    GUEST_REVISION_LIMIT_REACHED: `무료로 다듬을 수 있는 ${GUEST_DRAFT_MAX_REVISIONS}번을 모두 사용했어요. 로그인하면 지금 계획을 그대로 저장하고 무료 체험 크레딧으로 이어서 조정할 수 있어요.`,
    DRAFT_REVISION_CONFLICT: "계획 초안이 다른 화면에서 변경됐어요. 최신 초안을 다시 확인해 주세요.",
    DRAFT_PLAN_INPUT_MISMATCH: "입력 조건과 AI 일정이 일치하지 않아 저장하지 않았어요.",
    DRAFT_ADJUSTMENT_REQUIRED: "현재 조건으로는 전체 일정을 확정할 수 없어요. 조정안을 선택해 계획을 다시 확인해 주세요.",
    DRAFT_IDEMPOTENCY_KEY_CONFLICT: "이전 요청과 입력 조건이 달라 새 요청으로 다시 시도해 주세요.",
  };
  const terminal = code === "DRAFT_IDEMPOTENCY_KEY_CONFLICT"
    || code === "GUEST_REVISION_LIMIT_REACHED"
    || (code === "DRAFT_REVISION_CONFLICT" && Number(status) === 412);
  return json({
    ok: false,
    code,
    error: messages[code] || "계획 초안을 처리하지 못했어요.",
    ...(terminal ? { terminal: true, cached: false, retryable: false } : {}),
    ...(terminal && code === "DRAFT_REVISION_CONFLICT" ? {
      draftPlanId: String(metadata.draftPlanId || ""),
      preview: metadata.preview || null,
      activeInput: metadata.activeInput || null,
      activeInputHash: String(metadata.activeInputHash || ""),
      activeRevision: Number(metadata.activeRevision || 0),
    } : {}),
  }, status || 409);
}

function currentKstDateKey(now = Date.now()) {
  return new Date(now + 9 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

function guestGenerationOutcome(error) {
  const code = String(error?.code || "AI_REQUEST_FAILED");
  const terminalContract = code.startsWith("AI_OUTPUT_")
    || code === "MATERIAL_RANGE_INVALID"
    || error?.retryable === false;
  return terminalContract ? "terminal_contract_failure" : "retryable_provider_failure";
}

function guestGenerationFailureResponse(result = {}, { cached = true } = {}) {
  const code = String(result.code || "AI_REQUEST_FAILED");
  const terminalContract = result.outcome === "terminal_contract_failure";
  const status = Number.isInteger(Number(result.status)) ? Number(result.status) : (terminalContract ? 502 : 503);
  const error = String(result.error || "").trim() || (terminalContract
    ? "계획을 완성하지 못했어요. 적어둔 내용은 그대로 보관했어요."
    : "AI 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
  return json({
    ok: false,
    code,
    error,
    retryable: Boolean(result.retryable),
    cached,
    terminal: true,
  }, status);
}

async function recordGuestGenerationFailure(env, draftPlanId, {
  generationToken,
  outcome,
  code,
  status,
  error,
}) {
  try {
    const recorded = await guestDraftCommand(env, draftPlanId, "fail-generation", {
      generationToken,
      resultCategory: outcome,
      code,
      status,
      error,
    });
    if (!recorded.response?.ok || !recorded.body?.generationResult) return null;
    return recorded.body.generationResult;
  } catch {
    console.error("Guest generation result persistence failed", { code: "DRAFT_GENERATION_RESULT_NOT_STORED" });
    return null;
  }
}

function guestGenerationPersistenceError() {
  return json({
    ok: false,
    code: "DRAFT_GENERATION_RESULT_NOT_STORED",
    error: "요청 결과를 안전하게 저장하지 못했어요. 같은 요청으로 다시 확인해 주세요.",
    retryable: true,
    terminal: false,
    cached: false,
  }, 503);
}

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
  return {
    ready: missingDependencies.length === 0 && invalidDependencies.length === 0,
    missingDependencies,
    invalidDependencies,
  };
}

// 온보딩 1단계는 로그인 전에도 거치므로, 계획 생성과 달리 비회원에게도 열되
// IP 해시 기준 레이트리밋으로만 보호한다(초안 저장·크레딧 차감 없음).
async function handleGuestGoalAnalysis({ request, env }) {
  if (request.method !== "POST") return json({ ok: false, error: "POST 요청만 사용할 수 있어요.", code: "METHOD_NOT_ALLOWED" }, 405);
  if (!getGuestAiReadiness(env).ready) {
    return json({ ok: false, error: "올리의 목표 정리가 아직 준비되지 않았어요.", code: "GUEST_PREVIEW_UNAVAILABLE" }, 503);
  }

  let requestBody;
  try {
    requestBody = await readBoundedJson(request, 5_000);
  } catch (error) {
    return json(aiErrorBody(error), error.status || 400);
  }

  const identity = await guestPreviewIdentity(request, env);
  if (!identity) {
    return json({
      ok: false,
      error: "안전한 요청 정보를 확인하지 못했어요.",
      code: "GUEST_PREVIEW_IDENTITY_REQUIRED",
    }, 400);
  }

  if (env.AI_RATE_LIMITER) {
    const { success } = await env.AI_RATE_LIMITER.limit({ key: `ai:guest-goal-analyze:${identity.ipHash}` });
    if (!success) {
      return json({ ok: false, error: "요청이 잠시 많아요. 1분 뒤 다시 시도해 주세요.", code: "AI_RATE_LIMITED" }, 429);
    }
  }

  // OPENAI_ANALYZE_MODEL은 분석 호출만 다른 모델로 돌리는 탈출구다. gpt-5.4를
  // 실측한 결과 24~44초(45초 타임아웃 임박)라 온보딩에는 부적합했고, 명시된
  // 조건은 reconcileConditionsWithGoalText가 결정론적으로 보장하므로 기본은
  // mini다. 현재 어떤 환경도 이 변수를 설정하지 않는다.
  const model = env.OPENAI_ANALYZE_MODEL || env.OPENAI_MODEL || "gpt-5.4-mini";
  const aiStartedAt = Date.now();
  try {
    // UTF-8이 아닌 본문은 디코딩 단계에서 U+FFFD로 뭉개진 채 도착한다(비UTF-8
    // 클라이언트로 실측). 그대로 모델에 넘기면 그럴듯하지만 틀린 분석이 나오므로
    // 여기서 명확하게 거절한다. 브라우저 fetch는 항상 UTF-8이라 영향이 없다.
    if (String(requestBody?.goalText || "").includes("�")) {
      return json({ ok: false, error: "목표 텍스트의 인코딩이 깨졌어요. UTF-8로 다시 보내 주세요.", code: "INVALID_TEXT_ENCODING" }, 400);
    }
    const { analysis } = await createGoalAnalysis({ goalText: requestBody?.goalText }, {
      apiKey: env.OPENAI_API_KEY,
      model,
    });
    return json({ ok: true, analysis });
  } catch (error) {
    console.error("Guest goal analysis failed", safeAiDiagnostics(error, {
      correlationId: crypto.randomUUID(),
      environment: env.APP_ENV || "unknown",
      model,
      operation: "guest_goal_analysis",
      latencyMs: Date.now() - aiStartedAt,
    }));
    return json(aiErrorBody(error), error.status || 502);
  }
}

async function handleGuestGoalPreview({ request, env, accountContext }) {
  if (request.method !== "POST") return json({ ok: false, error: "POST 요청만 사용할 수 있어요.", code: "METHOD_NOT_ALLOWED" }, 405);
  if (!getGuestAiReadiness(env).ready) {
    return json({ ok: false, error: "AI 계획 미리보기가 아직 준비되지 않았어요.", code: "GUEST_PREVIEW_UNAVAILABLE" }, 503);
  }
  if (await currentSessionUser(accountContext)) {
    return json({ ok: false, error: "회원은 무료 체험에서 전체 AI 계획을 만들 수 있어요.", code: "MEMBER_PREVIEW_NOT_ALLOWED" }, 409);
  }
  let requestBody;
  try {
    requestBody = await readBoundedJson(request, 50_000);
  } catch (error) {
    return json(aiErrorBody(error), error.status || 400);
  }
  const requestedIdempotencyKey = String(requestBody?.idempotencyKey || "").trim();
  if (requestedIdempotencyKey && !/^initial:[A-Za-z0-9_-]{16,144}$/.test(requestedIdempotencyKey)) {
    return json({ ok: false, error: "AI 미리보기 요청을 확인하지 못했어요.", code: "DRAFT_IDEMPOTENCY_KEY_INVALID" }, 400);
  }
  const input = requestBody && typeof requestBody === "object" ? { ...requestBody } : {};
  delete input.idempotencyKey;
  const requestNow = Date.now();
  input.availability = {
    ...(input.availability || {}),
    scheduleStartDate: currentKstDateKey(requestNow),
  };
  const identity = await guestPreviewIdentity(request, env);
  if (!identity) {
    return json({
      ok: false,
      error: "AI 계획 미리보기의 안전한 요청 정보를 확인하지 못했어요.",
      code: "GUEST_PREVIEW_IDENTITY_REQUIRED",
      retryable: true,
      terminal: true,
      cached: false,
    }, 503);
  }

  const actorInputHash = await guestGoalInputHash(normalizeGoalInput({ ...input, draftPlanId: "" }));
  const actorCacheKey = `guest-ai-preview:${identity.actorHash}:${actorInputHash}`;
  const actorDailyKey = `guest-ai-preview-day:${identity.actorHash}`;
  const actorDaily = await env.USERS_KV.get(actorDailyKey, "json");
  const draftIdentitySeed = requestedIdempotencyKey || identity.actorHash;
  const draftInputIdentity = requestedIdempotencyKey ? "explicit-idempotency-key:v1" : actorInputHash;
  const deterministicDraftPlanId = await guestDraftId(
    env.SESSION_SECRET,
    draftIdentitySeed,
    draftInputIdentity,
  );
  const actorDailyDraftPlanId = String(actorDaily?.draftPlanId || "");
  const reusesExplicitDraftIdentity = Boolean(
    requestedIdempotencyKey
    && validGuestDraftId(actorDailyDraftPlanId)
    && actorDailyDraftPlanId === deterministicDraftPlanId
  );
  if (
    actorDaily?.actorInputHash
    && actorDaily.actorInputHash !== actorInputHash
    && !reusesExplicitDraftIdentity
  ) {
    return guestDraftApiError("GUEST_PREVIEW_ALREADY_USED", 429);
  }
  const actorCache = await env.USERS_KV.get(actorCacheKey, "json");
  const cachedDraftPlanId = String(actorCache?.draftPlanId || actorDaily?.draftPlanId || "");
  const draftPlanId = validGuestDraftId(cachedDraftPlanId)
    ? cachedDraftPlanId
    : deterministicDraftPlanId;
  const normalizedInput = normalizeGoalInput({ ...input, draftPlanId });
  const inputHash = await guestGoalInputHash(normalizedInput);
  let capability = await guestDraftCapability(env.SESSION_SECRET, draftPlanId);
  let capabilityHash = await guestDraftCapabilityHash(env.SESSION_SECRET, draftPlanId, capability);
  const generationToken = crypto.randomUUID();
  const idempotencyKey = requestedIdempotencyKey || `initial:${inputHash}`;
  let begin = await guestDraftCommand(env, draftPlanId, "begin-initial", {
    draftPlanId,
    anonymousActorHash: identity.actorHash,
    capabilityHash,
    input: normalizedInput,
    inputHash,
    generationToken,
    idempotencyKey,
  });
  if (
    begin.response?.status === 403
    && validGuestDraftId(cachedDraftPlanId)
  ) {
    capability = await legacyGuestDraftCapability(env.SESSION_SECRET, draftPlanId, identity.actorHash);
    capabilityHash = await guestDraftCapabilityHash(env.SESSION_SECRET, draftPlanId, capability);
    begin = await guestDraftCommand(env, draftPlanId, "begin-initial", {
      draftPlanId,
      anonymousActorHash: identity.actorHash,
      capabilityHash,
      input: normalizedInput,
      inputHash,
      generationToken,
      idempotencyKey,
    });
  }
  if (!begin.response?.ok) return guestDraftApiError(begin.body.code, begin.response?.status || 503);
  if (begin.body.generationResult?.outcome && begin.body.generationResult.outcome !== "success") {
    console.info("Guest AI goal preview replayed", safeAiDiagnostics({
      code: begin.body.generationResult.code,
      retryable: begin.body.generationResult.retryable,
      cached: true,
      providerCalled: false,
      diagnostics: {
        responseStatus: "cached_terminal",
        schemaResult: "unknown",
        domainResult: begin.body.generationResult.outcome === "terminal_contract_failure" ? "fail" : "not_run",
        domainRuleIds: [],
      },
    }, {
      environment: env.APP_ENV || "unknown",
      operation: "guest_goal_generation",
      model: env.OPENAI_MODEL || "gpt-5.4-mini",
      maxOutputTokens: GOAL_PLAN_MAX_OUTPUT_TOKENS,
      cached: true,
      providerCalled: false,
    }));
    return guestGenerationFailureResponse(begin.body.generationResult);
  }
  if (begin.body.cached) {
    console.info("Guest AI goal preview replayed", safeAiSuccessDiagnostics({
      cached: true,
      providerCalled: false,
      diagnostics: { responseStatus: "completed", schemaResult: "pass", domainResult: "pass" },
      contract: { maxOutputTokens: GOAL_PLAN_MAX_OUTPUT_TOKENS },
    }, {
      environment: env.APP_ENV || "unknown",
      operation: "guest_goal_generation",
      model: env.OPENAI_MODEL || "gpt-5.4-mini",
      cached: true,
      providerCalled: false,
    }));
    return guestDraftPreviewResponse({
      ok: true,
      draftPlanId,
      preview: begin.body.preview,
      activeInput: begin.body.activeInput,
      activeInputHash: begin.body.activeInputHash,
      activeRevision: begin.body.activeRevision,
      cached: true,
    }, capability);
  }
  const { success } = await env.AI_RATE_LIMITER.limit({ key: `ai:guest-goal-preview:${identity.ipHash}` });
  if (!success) {
    const error = "AI 계획 미리보기 요청이 잠시 많아요. 1분 뒤 다시 시도해 주세요.";
    const recorded = await recordGuestGenerationFailure(env, draftPlanId, {
      generationToken,
      outcome: "retryable_provider_failure",
      code: "AI_RATE_LIMITED",
      status: 429,
      error,
    });
    if (!recorded) return guestGenerationPersistenceError();
    return guestGenerationFailureResponse(recorded, { cached: false });
  }
  let committed;
  const aiCorrelationId = crypto.randomUUID();
  const aiStartedAt = Date.now();
  try {
    const result = await createAiGoalPlan(normalizedInput, {
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL || "gpt-5.4-mini",
      now: requestNow,
    });
    console.info("Guest AI goal preview completed", safeAiSuccessDiagnostics(result, {
      correlationId: aiCorrelationId,
      environment: env.APP_ENV || "unknown",
      model: env.OPENAI_MODEL || "gpt-5.4-mini",
      operation: "guest_goal_generation",
      latencyMs: Date.now() - aiStartedAt,
    }));
    const preview = guestGoalPreview(result.plan);
    committed = await guestDraftCommand(env, draftPlanId, "commit-generation", {
      generationToken, idempotencyKey, inputHash, plan: result.plan, preview,
    });
    if (!committed.response?.ok) return guestDraftApiError(committed.body.code, committed.response?.status || 503);
  } catch (error) {
    console.error("Guest AI goal preview failed", safeAiDiagnostics(error, {
      correlationId: aiCorrelationId,
      environment: env.APP_ENV || "unknown",
      model: env.OPENAI_MODEL || "gpt-5.4-mini",
      operation: "guest_goal_generation",
      latencyMs: Date.now() - aiStartedAt,
      maxOutputTokens: GOAL_PLAN_MAX_OUTPUT_TOKENS,
    }));
    const errorBody = aiErrorBody(error);
    const recorded = await recordGuestGenerationFailure(env, draftPlanId, {
      generationToken,
      outcome: guestGenerationOutcome(error),
      code: error?.code || "AI_REQUEST_FAILED",
      status: error?.status || 500,
      error: errorBody.error,
    });
    if (!recorded) return guestGenerationPersistenceError();
    return guestGenerationFailureResponse(recorded, { cached: false });
  }
  const expiresAt = Number(committed.body.expiresAt || Date.now() + GUEST_GOAL_PREVIEW_TTL_SECONDS * 1_000);
  const cacheRecord = JSON.stringify({
    draftPlanId,
    actorInputHash,
    inputHash: committed.body.activeInputHash,
    promptVersion: GUEST_GOAL_PROMPT_VERSION,
    inputSchemaVersion: GUEST_GOAL_INPUT_SCHEMA_VERSION,
    outputSchemaVersion: GUEST_GOAL_OUTPUT_SCHEMA_VERSION,
    outputBudgetVersion: GUEST_GOAL_OUTPUT_BUDGET_VERSION,
    expiresAt,
  });
  try {
    await Promise.all([
      env.USERS_KV.put(actorCacheKey, cacheRecord, { expiration: Math.floor(expiresAt / 1_000) }),
      env.USERS_KV.put(actorDailyKey, cacheRecord, { expiration: Math.floor(expiresAt / 1_000) }),
    ]);
  } catch (error) {
    console.error("Guest AI preview cache metadata failed", { code: "GUEST_PREVIEW_CACHE_WRITE_FAILED" });
  }
  return guestDraftPreviewResponse({
    ok: true,
    draftPlanId,
    preview: committed.body.preview,
    activeInput: committed.body.activeInput,
    activeInputHash: committed.body.activeInputHash,
    activeRevision: committed.body.activeRevision,
    cached: false,
  }, capability);
}

async function handleGuestGoalDraftRevision({ request, env, accountContext }) {
  if (request.method !== "POST") return json({ ok: false, error: "POST 요청만 사용할 수 있어요.", code: "METHOD_NOT_ALLOWED" }, 405);
  if (!getGuestAiReadiness(env).ready) {
    return json({ ok: false, error: "AI 계획 초안 저장소가 아직 준비되지 않았어요.", code: "GUEST_PREVIEW_UNAVAILABLE" }, 503);
  }
  if (await currentSessionUser(accountContext)) return json({ ok: false, error: "로그인한 계획은 계획 수정에서 변경해 주세요.", code: "MEMBER_PREVIEW_NOT_ALLOWED" }, 409);
  let body;
  try {
    body = await readBoundedJson(request, 50_000);
  } catch (error) {
    return json(aiErrorBody(error), error.status || 400);
  }
  const draftPlanId = String(body?.draftPlanId || "").trim();
  const idempotencyKey = String(body?.idempotencyKey || "").trim();
  if (!validGuestDraftId(draftPlanId) || !/^[A-Za-z0-9:_-]{16,160}$/.test(idempotencyKey)) {
    return json({ ok: false, error: "수정할 계획 초안을 확인하지 못했어요.", code: "DRAFT_PLAN_INVALID" }, 400);
  }
  const capability = String(parseCookies(request.headers.get("cookie"))[GUEST_GOAL_DRAFT_COOKIE] || "");
  if (!/^[a-f0-9]{64}$/.test(capability)) return guestDraftApiError("DRAFT_PLAN_ACCESS_DENIED", 403);
  const capabilityHash = await guestDraftCapabilityHash(env.SESSION_SECRET, draftPlanId, capability);
  const requestNow = Date.now();
  const inspected = await guestDraftCommand(env, draftPlanId, "inspect", { capabilityHash });
  if (!inspected.response?.ok) {
    return guestDraftApiError(inspected.body.code, inspected.response?.status || 503, inspected.body);
  }
  const storedScheduleStartDate = String(inspected.body?.activeInput?.availability?.scheduleStartDate || "");
  const normalizedInput = normalizeGoalInput({
    ...(body.input || {}),
    draftPlanId,
    availability: {
      ...(body.input?.availability || {}),
      scheduleStartDate: /^\d{4}-\d{2}-\d{2}$/.test(storedScheduleStartDate)
        ? storedScheduleStartDate
        : currentKstDateKey(requestNow),
    },
  });
  const inputHash = await guestGoalInputHash(normalizedInput);
  const generationToken = crypto.randomUUID();
  const begin = await guestDraftCommand(env, draftPlanId, "begin-revision", {
    capabilityHash,
    expectedRevision: Number(body.expectedRevision),
    expectedInputHash: String(body.expectedInputHash || ""),
    input: normalizedInput,
    inputHash,
    generationToken,
    idempotencyKey,
  });
  if (!begin.response?.ok) return guestDraftApiError(begin.body.code, begin.response?.status || 503, begin.body);
  if (begin.body.generationResult?.outcome && begin.body.generationResult.outcome !== "success") {
    console.info("Guest AI goal revision replayed", safeAiDiagnostics({
      code: begin.body.generationResult.code,
      retryable: begin.body.generationResult.retryable,
      cached: true,
      providerCalled: false,
      diagnostics: {
        responseStatus: "cached_terminal",
        schemaResult: "unknown",
        domainResult: begin.body.generationResult.outcome === "terminal_contract_failure" ? "fail" : "not_run",
        domainRuleIds: [],
      },
    }, {
      environment: env.APP_ENV || "unknown",
      operation: "guest_goal_revision",
      model: env.OPENAI_MODEL || "gpt-5.4-mini",
      maxOutputTokens: PLAN_REVISION_MAX_OUTPUT_TOKENS,
      cached: true,
      providerCalled: false,
    }));
    return guestGenerationFailureResponse(begin.body.generationResult);
  }
  if (!begin.body.shouldGenerate) {
    console.info("Guest AI goal revision replayed", safeAiSuccessDiagnostics({
      cached: true,
      providerCalled: false,
      diagnostics: { responseStatus: "completed", schemaResult: "pass", domainResult: "pass" },
      contract: { maxOutputTokens: PLAN_REVISION_MAX_OUTPUT_TOKENS },
    }, {
      environment: env.APP_ENV || "unknown",
      operation: "guest_goal_revision",
      model: env.OPENAI_MODEL || "gpt-5.4-mini",
      cached: true,
      providerCalled: false,
    }));
    return json({
      ok: true,
      draftPlanId,
      preview: begin.body.preview,
      activeInput: begin.body.activeInput,
      activeInputHash: begin.body.activeInputHash,
      activeRevision: begin.body.activeRevision,
      cached: true,
      unchanged: Boolean(begin.body.unchanged),
    });
  }
  const identity = await guestPreviewIdentity(request, env);
  if (!identity) {
    const error = "AI 계획 수정 요청 정보를 확인하지 못했어요.";
    const recorded = await recordGuestGenerationFailure(env, draftPlanId, {
      generationToken,
      outcome: "retryable_provider_failure",
      code: "GUEST_PREVIEW_IDENTITY_REQUIRED",
      status: 503,
      error,
    });
    if (!recorded) return guestGenerationPersistenceError();
    return guestGenerationFailureResponse(recorded, { cached: false });
  }
  const { success } = await env.AI_RATE_LIMITER.limit({ key: `ai:guest-goal-revision:${identity.ipHash}` });
  if (!success) {
    const error = "AI 계획 수정 요청이 잠시 많아요. 1분 뒤 다시 시도해 주세요.";
    const recorded = await recordGuestGenerationFailure(env, draftPlanId, {
      generationToken,
      outcome: "retryable_provider_failure",
      code: "AI_RATE_LIMITED",
      status: 429,
      error,
    });
    if (!recorded) return guestGenerationPersistenceError();
    return guestGenerationFailureResponse(recorded, { cached: false });
  }
  const aiCorrelationId = crypto.randomUUID();
  const aiStartedAt = Date.now();
  try {
    const result = await createAiGoalPlan(normalizedInput, {
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL || "gpt-5.4-mini",
      maxOutputTokens: PLAN_REVISION_MAX_OUTPUT_TOKENS,
      now: requestNow,
    });
    console.info("Guest AI goal revision completed", safeAiSuccessDiagnostics(result, {
      correlationId: aiCorrelationId,
      environment: env.APP_ENV || "unknown",
      model: env.OPENAI_MODEL || "gpt-5.4-mini",
      operation: "guest_goal_revision",
      latencyMs: Date.now() - aiStartedAt,
    }));
    const preview = guestGoalPreview(result.plan);
    const committed = await guestDraftCommand(env, draftPlanId, "commit-generation", {
      generationToken, idempotencyKey, inputHash, plan: result.plan, preview,
    });
    if (!committed.response?.ok) return guestDraftApiError(committed.body.code, committed.response?.status || 503);
    return json({
      ok: true,
      draftPlanId,
      preview: committed.body.preview,
      activeInput: committed.body.activeInput,
      activeInputHash: committed.body.activeInputHash,
      activeRevision: committed.body.activeRevision,
      cached: false,
    });
  } catch (error) {
    console.error("Guest AI goal revision failed", safeAiDiagnostics(error, {
      correlationId: aiCorrelationId,
      environment: env.APP_ENV || "unknown",
      model: env.OPENAI_MODEL || "gpt-5.4-mini",
      operation: "guest_goal_revision",
      latencyMs: Date.now() - aiStartedAt,
      maxOutputTokens: PLAN_REVISION_MAX_OUTPUT_TOKENS,
    }));
    const errorBody = aiErrorBody(error);
    const recorded = await recordGuestGenerationFailure(env, draftPlanId, {
      generationToken,
      outcome: guestGenerationOutcome(error),
      code: error?.code || "AI_REQUEST_FAILED",
      status: error?.status || 500,
      error: errorBody.error,
    });
    if (!recorded) return guestGenerationPersistenceError();
    return guestGenerationFailureResponse(recorded, { cached: false });
  }
}

function normalizedScheduleStartPreference(value) {
  return ["as-is", "change-days", "shorter"].includes(value) ? value : "as-is";
}

function activatedGuestPlan(plan, input, claimPlanId, claimedAt, scheduleStartPreference = "as-is") {
  const firstAction = (plan?.firstWeekSchedule || []).flatMap((day) => Array.isArray(day?.items) ? day.items : []).find((item) => item?.type === "ACTION");
  return {
    ...(plan || {}),
    planId: claimPlanId,
    goal: input?.goal || plan?.goal || "나의 목표",
    period: Number(input?.periodDays) || Number(plan?.periodDays) || 30,
    currentState: input?.currentState || input?.material?.currentProgress || "",
    routineReadiness: input?.routine?.readiness || "계획이 있으면 실행해요",
    routineTime: input?.routine?.preferredTime || "아침",
    currentRoutine: input?.routine?.existingRoutine || "",
    mbti: input?.mbti || "",
    firstAction: plan?.firstAction || firstAction?.title || "첫 행동 시작하기",
    coachMessage: plan?.coachMessage || "검토한 첫 일정부터 시작해요.",
    material: input?.material || {},
    availability: input?.availability || {},
    planningPreferences: input?.planningPreferences || [],
    scheduleStartPreference: normalizedScheduleStartPreference(scheduleStartPreference),
    planStartDate: plan?.scheduleContract?.startDate || input?.availability?.scheduleStartDate || currentKstDateKey(claimedAt || Date.now()),
    aiPreview: plan,
    planSource: "ai-reviewed-draft",
    createdAt: new Date(claimedAt || Date.now()).toISOString(),
  };
}

async function upsertClaimedPlanForUser(store, userId, activatedPlan) {
  const existing = await store.getAppState(userId);
  const state = existing?.state && typeof existing.state === "object" ? { ...existing.state } : {};
  let storedPlan = null;
  try { storedPlan = JSON.parse(state.omwExecutionPlan || "null"); } catch {}
  if (storedPlan?.planId === activatedPlan.planId) return storedPlan;
  state.omwExecutionPlan = JSON.stringify(activatedPlan);
  await store.putAppState(userId, {
    userId,
    state,
    revision: Number(existing?.revision || 0) + 1,
    updatedAt: Date.now(),
    deviceId: String(existing?.deviceId || "guest-draft-claim"),
  });
  return activatedPlan;
}

async function handleGuestGoalDraftClaim({ request, env, accountContext }) {
  if (request.method !== "POST") return json({ ok: false, error: "POST 요청만 사용할 수 있어요.", code: "METHOD_NOT_ALLOWED" }, 405);
  if (!env.USERS_KV || !env.GUEST_PLAN_DRAFTS || String(env.SESSION_SECRET || "").length < 32) return json({ ok: false, error: "회원 계획 저장소 설정이 필요합니다.", code: "ACCOUNT_STORAGE_UNAVAILABLE" }, 503);
  const user = await currentSessionUser(accountContext);
  if (!user) return json({ ok: false, error: "로그인·회원가입 후 계획 초안을 저장할 수 있어요.", code: "AUTH_REQUIRED" }, 401);
  let body;
  try {
    body = await readBoundedJson(request, 2_000);
  } catch (error) {
    return json(aiErrorBody(error), error.status || 400);
  }
  const draftPlanId = String(body?.draftPlanId || "").trim();
  const expectedRevision = Number(body?.expectedRevision);
  const expectedInputHash = String(body?.expectedInputHash || "");
  const scheduleStartPreference = normalizedScheduleStartPreference(body?.scheduleStartPreference);
  if (!validGuestDraftId(draftPlanId) || !Number.isInteger(expectedRevision) || expectedRevision < 1 || !/^[a-f0-9]{64}$/.test(expectedInputHash)) {
    return json({ ok: false, error: "저장할 계획 초안을 확인하지 못했어요.", code: "DRAFT_PLAN_INVALID" }, 400);
  }
  const capability = String(parseCookies(request.headers.get("cookie"))[GUEST_GOAL_DRAFT_COOKIE] || "");
  if (!/^[a-f0-9]{64}$/.test(capability)) return guestDraftApiError("DRAFT_PLAN_ACCESS_DENIED", 403);
  const capabilityHash = await guestDraftCapabilityHash(env.SESSION_SECRET, draftPlanId, capability);
  const inspected = await guestDraftCommand(env, draftPlanId, "inspect", { capabilityHash });
  if (!inspected.response?.ok) return guestDraftApiError(inspected.body.code, inspected.response?.status || 503);
  const latestUser = await accountContext.store.getUser(user.id);
  if (!latestUser || (latestUser.status && latestUser.status !== "active")) {
    return json({ ok: false, error: "계정 상태를 확인하지 못해 계획을 저장하지 않았어요.", code: "ACCOUNT_INACTIVE" }, 409);
  }
  const sameUserRetry = inspected.body.status === "CLAIMED" && inspected.body.claimedBy === user.id;
  const hasFreeLimit = latestUser.role !== "admin" && latestUser.plan === "free";
  if (hasFreeLimit && latestUser.goalPlanGeneratedAt && !sameUserRetry) {
    return json({ ok: false, error: "Free 플랜에서는 목표와 활성 계획을 1개까지 이용할 수 있어요.", code: "GOAL_PLAN_LIMIT_REACHED" }, 409);
  }
  const claimed = await guestDraftCommand(env, draftPlanId, "claim", {
    capabilityHash,
    userId: user.id,
    expectedRevision,
    expectedInputHash,
    scheduleStartPreference,
  });
  if (!claimed.response?.ok) return guestDraftApiError(claimed.body.code, claimed.response?.status || 503, claimed.body);
  const activatedPlan = activatedGuestPlan(
    claimed.body.plan,
    claimed.body.activeInput,
    claimed.body.claimPlanId,
    claimed.body.claimedAt,
    claimed.body.claimScheduleStartPreference || scheduleStartPreference,
  );
  try {
    const storedPlan = await upsertClaimedPlanForUser(accountContext.store, user.id, activatedPlan);
    latestUser.goalPlanGeneratedAt = latestUser.goalPlanGeneratedAt || claimed.body.claimedAt || Date.now();
    await accountContext.store.putUser(latestUser);
    return json({
      ok: true,
      draftPlanId,
      plan: claimed.body.plan,
      activatedPlan: storedPlan,
      activeRevision: claimed.body.activeRevision,
      activeInputHash: claimed.body.activeInputHash,
      chargedCredits: 0,
    });
  } catch {
    console.error("Claimed guest plan member upsert failed", { code: "DRAFT_MEMBER_SAVE_RETRY" });
    return json({ ok: false, error: "계획 초안은 보호되어 있어요. 저장을 다시 시도해 주세요.", code: "DRAFT_MEMBER_SAVE_RETRY" }, 503);
  }
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

  let reservation = null;
  let providerCalled = false;
  const model = env.OPENAI_MODEL || "gpt-5.4-mini";
  const aiCorrelationId = crypto.randomUUID();
  let aiStartedAt = 0;
  try {
    reservation = await reserveAiCredits({ store: userStore, userId: user.id, action: route.action, requestId });

    let result;
    aiStartedAt = Date.now();
    if (route.kind === "goal") {
      // Reload after the reservation write so the goal-limit write cannot overwrite credit state.
      const creditAwareUser = await userStore.getUser(user.id);
      result = await createGoalPlanForUser({ input, env, userStore, user: creditAwareUser });
    } else if (route.kind === "analyze") {
      result = await createGoalAnalysis(input, { apiKey: env.OPENAI_API_KEY, model });
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
    if (route.kind === "goal" || route.kind === "revision") {
      console.info(`AI ${route.action} completed`, safeAiSuccessDiagnostics(result, {
        correlationId: aiCorrelationId,
        environment: env.APP_ENV || "unknown",
        model,
        operation: route.action,
        latencyMs: Date.now() - aiStartedAt,
      }));
    }

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
    console.error(`AI ${route.action} request failed`, safeAiDiagnostics(error, {
      correlationId: aiCorrelationId,
      environment: env.APP_ENV || "unknown",
      model,
      operation: route.action,
      latencyMs: aiStartedAt ? Date.now() - aiStartedAt : 0,
      maxOutputTokens: route.kind === "goal"
        ? GOAL_PLAN_MAX_OUTPUT_TOKENS
        : route.kind === "revision"
          ? PLAN_REVISION_MAX_OUTPUT_TOKENS
          : 0,
    }));
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
        console.error("AI credit reservation release failed", {
          correlationId: aiCorrelationId,
          errorCategory: releaseError?.code || "AI_CREDIT_RELEASE_FAILED",
        });
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

    // 비회원은 레이트리밋만 적용한 무료 분석으로, 회원은 아래 크레딧 경로로 보낸다.
    if (url.pathname === GUEST_GOAL_ANALYZE_PATH && !(await currentSessionUser(accountContext))) {
      return handleGuestGoalAnalysis({ request, env });
    }

    if (url.pathname === GUEST_GOAL_PREVIEW_PATH) {
      return handleGuestGoalPreview({ request, env, accountContext });
    }

    if (url.pathname === GUEST_GOAL_DRAFT_REVISE_PATH) {
      return handleGuestGoalDraftRevision({ request, env, accountContext });
    }

    if (url.pathname === GUEST_GOAL_DRAFT_CLAIM_PATH) {
      return handleGuestGoalDraftClaim({ request, env, accountContext });
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

export { GuestPlanDraftObject };

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
