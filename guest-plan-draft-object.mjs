const STATE_KEY = "draft";
export const GUEST_DRAFT_SCHEMA_VERSION = 1;
export const GUEST_DRAFT_TTL_MS = 24 * 60 * 60 * 1_000;
export const GUEST_DRAFT_GENERATION_LEASE_MS = 90 * 1_000;
// Successful revisions allowed after the initial preview. Guests get the
// initial plan plus this many free AI adjustments; past that they must log in
// (claim is free) so anonymous traffic cannot burn unbounded provider spend.
export const GUEST_DRAFT_MAX_REVISIONS = 3;
export const GUEST_GENERATION_RESULT_OUTCOMES = Object.freeze({
  SUCCESS: "success",
  TERMINAL_CONTRACT_FAILURE: "terminal_contract_failure",
  RETRYABLE_PROVIDER_FAILURE: "retryable_provider_failure",
});
export const GUEST_DRAFT_STATUSES = Object.freeze({
  GENERATING: "GENERATING",
  READY: "READY",
  CLAIMED: "CLAIMED",
  EXPIRED: "EXPIRED",
  FAILED: "FAILED",
});

function response(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function expired(state, now) {
  return !state || !Number.isFinite(Number(state.expiresAt)) || Number(state.expiresAt) <= now;
}

function publicMetadata(state) {
  return {
    draftPlanId: state.draftId,
    status: state.status,
    activeRevision: Number(state.activeRevision || 0),
    activeInputHash: String(state.activeInputHash || ""),
    activeInput: state.activeInput || null,
    preview: state.activePreview || null,
    claimedBy: state.claimedBy || "",
    claimedAt: Number(state.claimedAt || 0),
    claimPlanId: String(state.claimPlanId || state.draftId || ""),
    claimScheduleStartPreference: String(state.claimScheduleStartPreference || ""),
    expiresAt: Number(state.expiresAt || 0),
  };
}

function generationLeaseExpired(state, now) {
  const startedAt = Number(state?.pendingGeneration?.startedAt);
  return state?.status === GUEST_DRAFT_STATUSES.GENERATING
    && Number.isFinite(startedAt)
    && startedAt + GUEST_DRAFT_GENERATION_LEASE_MS <= now;
}

function sanitizeFailureCode(value, fallback = "AI_PROVIDER_REQUEST_FAILED") {
  const code = String(value || "").trim();
  return /^[A-Z][A-Z0-9_]{1,63}$/.test(code) ? code : fallback;
}

function sanitizeFailureMessage(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 240);
}

function normalizeFailureOutcome(value) {
  return value === GUEST_GENERATION_RESULT_OUTCOMES.TERMINAL_CONTRACT_FAILURE
    ? GUEST_GENERATION_RESULT_OUTCOMES.TERMINAL_CONTRACT_FAILURE
    : GUEST_GENERATION_RESULT_OUTCOMES.RETRYABLE_PROVIDER_FAILURE;
}

function generationFingerprint(source = {}) {
  return {
    idempotencyKey: String(source.idempotencyKey || ""),
    inputHash: String(source.inputHash || source.pendingInputHash || ""),
    baseRevision: Number(source.baseRevision ?? source.expectedRevision ?? 0),
    baseInputHash: String(source.baseInputHash || source.expectedInputHash || ""),
  };
}

function generationResultMatches(result, source) {
  const fingerprint = generationFingerprint(source);
  return String(result?.idempotencyKey || "") === fingerprint.idempotencyKey
    && String(result?.inputHash || "") === fingerprint.inputHash
    && Number(result?.baseRevision || 0) === fingerprint.baseRevision
    && String(result?.baseInputHash || "") === fingerprint.baseInputHash;
}

function generationResultForKey(state, idempotencyKey) {
  const key = String(idempotencyKey || "");
  if (!key) return null;
  const stored = Array.isArray(state?.generationResults)
    ? state.generationResults.find((result) => result?.idempotencyKey === key) || null
    : null;
  if (stored) return stored;
  if (state?.lastGeneration?.idempotencyKey !== key) return null;
  return {
    ...generationFingerprint(state.lastGeneration),
    outcome: GUEST_GENERATION_RESULT_OUTCOMES.SUCCESS,
    code: "",
    retryable: false,
    revision: Number(state.lastGeneration.revision || state.activeRevision || 0),
  };
}

function appendGenerationResult(state, result) {
  const existing = Array.isArray(state?.generationResults) ? state.generationResults : [];
  return [
    ...existing.filter((entry) => entry?.idempotencyKey !== result.idempotencyKey),
    result,
  ];
}

function publicGenerationResult(result) {
  if (!result) return null;
  const outcome = String(result.outcome || "");
  const publicResult = {
    outcome,
    code: outcome === GUEST_GENERATION_RESULT_OUTCOMES.SUCCESS
      ? ""
      : sanitizeFailureCode(result.code),
    retryable: outcome === GUEST_GENERATION_RESULT_OUTCOMES.RETRYABLE_PROVIDER_FAILURE,
    status: outcome === GUEST_GENERATION_RESULT_OUTCOMES.SUCCESS
      ? 200
      : Number.isInteger(Number(result.status)) && Number(result.status) >= 400 && Number(result.status) <= 599
        ? Number(result.status)
        : (outcome === GUEST_GENERATION_RESULT_OUTCOMES.RETRYABLE_PROVIDER_FAILURE ? 503 : 502),
  };
  const error = sanitizeFailureMessage(result.error);
  if (error) publicResult.error = error;
  return publicResult;
}

function cachedGenerationResult(state, result) {
  const generationResult = publicGenerationResult(result);
  const metadata = generationResult?.outcome === GUEST_GENERATION_RESULT_OUTCOMES.SUCCESS && result?.snapshot
    ? result.snapshot
    : publicMetadata(state);
  return {
    ok: generationResult?.outcome === GUEST_GENERATION_RESULT_OUTCOMES.SUCCESS,
    cached: true,
    idempotent: true,
    shouldGenerate: false,
    generationResult,
    ...metadata,
  };
}

function idempotencyReplay(state, source) {
  const result = generationResultForKey(state, source?.idempotencyKey);
  if (!result) return null;
  if (!generationResultMatches(result, source)) {
    return {
      status: 409,
      body: { ok: false, code: "DRAFT_IDEMPOTENCY_KEY_CONFLICT" },
    };
  }
  return { status: 200, body: cachedGenerationResult(state, result) };
}

function leaseFailureResult(pending, now) {
  return {
    ...generationFingerprint(pending),
    outcome: GUEST_GENERATION_RESULT_OUTCOMES.RETRYABLE_PROVIDER_FAILURE,
    code: "AI_GENERATION_LEASE_EXPIRED",
    error: "AI 응답을 확인하지 못했어요. 다시 시도해 주세요.",
    retryable: true,
    status: 504,
    recordedAt: now,
  };
}

async function normalizeLiveState(storage, state, now) {
  if (!state) return null;
  if (expired(state, now)) {
    await storage.delete(STATE_KEY);
    return null;
  }
  if (!generationLeaseExpired(state, now)) return state;
  const pending = state.pendingGeneration;
  const hasActivePlan = Number(state.activeRevision || 0) >= 1 && Boolean(state.activePlan);
  const recovered = {
    ...state,
    status: hasActivePlan ? GUEST_DRAFT_STATUSES.READY : GUEST_DRAFT_STATUSES.FAILED,
    pendingGeneration: null,
    generationResults: appendGenerationResult(state, leaseFailureResult(pending, now)),
    updatedAt: now,
  };
  await storage.put(STATE_KEY, recovered);
  return recovered;
}

async function readLiveState(storage, now) {
  return storage.transaction(async (txn) => normalizeLiveState(txn, await txn.get(STATE_KEY), now));
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function accessDenied() {
  return response({ ok: false, code: "DRAFT_PLAN_ACCESS_DENIED" }, 403);
}

function expiredResponse() {
  return response({ ok: false, code: "DRAFT_PLAN_EXPIRED", status: GUEST_DRAFT_STATUSES.EXPIRED }, 410);
}

function capabilityMatches(state, capabilityHash) {
  return Boolean(capabilityHash) && String(state?.capabilityHash || "") === String(capabilityHash);
}

/**
 * SQLite-backed Durable Object selected by Wrangler's new_sqlite_classes migration.
 * The class intentionally uses the Durable Object storage API so it remains directly
 * testable under Node without importing Cloudflare-only modules.
 */
export class GuestPlanDraftObject {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const body = await readJson(request);
    const now = Number.isFinite(Number(body.now)) ? Number(body.now) : Date.now();

    if (request.method !== "POST") return response({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);

    if (url.pathname === "/begin-initial") {
      const generationToken = String(body.generationToken || "");
      const result = await this.ctx.storage.transaction(async (txn) => {
        let state = await normalizeLiveState(txn, await txn.get(STATE_KEY), now);
        if (state) {
          if (!capabilityMatches(state, body.capabilityHash)) return { status: 403, body: { ok: false, code: "DRAFT_PLAN_ACCESS_DENIED" } };
          const replay = idempotencyReplay(state, {
            idempotencyKey: body.idempotencyKey,
            inputHash: body.inputHash,
            baseRevision: 0,
            baseInputHash: "",
          });
          if (replay) return replay;
          if (state.status === GUEST_DRAFT_STATUSES.GENERATING) {
            return { status: 409, body: { ok: false, code: "GUEST_PREVIEW_PENDING" } };
          }
          if (state.activeRevision > 0 && state.activePlan) {
            if (state.activeInputHash !== body.inputHash) return { status: 429, body: { ok: false, code: "GUEST_PREVIEW_ALREADY_USED" } };
            return { status: 200, body: { ok: true, cached: true, shouldGenerate: false, ...publicMetadata(state) } };
          }
          if (state.initialInputHash && state.initialInputHash !== body.inputHash) {
            return { status: 429, body: { ok: false, code: "GUEST_PREVIEW_ALREADY_USED" } };
          }
          state = {
            ...state,
            status: GUEST_DRAFT_STATUSES.GENERATING,
            pendingGeneration: {
              kind: "initial",
              generationToken,
              pendingInputHash: String(body.inputHash || ""),
              pendingInput: body.input || null,
              idempotencyKey: String(body.idempotencyKey || ""),
              baseRevision: 0,
              baseInputHash: "",
              startedAt: now,
            },
            updatedAt: now,
          };
          await txn.put(STATE_KEY, state);
          return {
            status: 200,
            body: {
              ok: true,
              cached: false,
              shouldGenerate: true,
              generationToken,
              expiresAt: state.expiresAt,
            },
          };
        }

        const expiresAt = now + GUEST_DRAFT_TTL_MS;
        state = {
          schemaVersion: GUEST_DRAFT_SCHEMA_VERSION,
          draftId: String(body.draftPlanId || ""),
          anonymousActorHash: String(body.anonymousActorHash || ""),
          capabilityHash: String(body.capabilityHash || ""),
          status: "GENERATING",
          activeRevision: 0,
          activeInputHash: "",
          activeInput: null,
          activePlan: null,
          activePlanInputHash: "",
          activePreview: null,
          initialInputHash: String(body.inputHash || ""),
          generationResults: [],
          pendingGeneration: {
            kind: "initial",
            generationToken,
            pendingInputHash: String(body.inputHash || ""),
            pendingInput: body.input || null,
            idempotencyKey: String(body.idempotencyKey || ""),
            baseRevision: 0,
            baseInputHash: "",
            startedAt: now,
          },
          createdAt: now,
          updatedAt: now,
          expiresAt,
        };
        await txn.put(STATE_KEY, state);
        await txn.setAlarm(expiresAt);
        return { status: 200, body: { ok: true, cached: false, shouldGenerate: true, generationToken, expiresAt } };
      });
      return response(result.body, result.status);
    }

    if (url.pathname === "/commit-generation") {
      const result = await this.ctx.storage.transaction(async (txn) => {
        const state = await normalizeLiveState(txn, await txn.get(STATE_KEY), now);
        if (!state) {
          return { status: 410, body: { ok: false, code: "DRAFT_PLAN_EXPIRED", status: GUEST_DRAFT_STATUSES.EXPIRED } };
        }
        const pending = state.pendingGeneration;
        if (
          !pending
          || pending.generationToken !== body.generationToken
          || pending.pendingInputHash !== body.inputHash
          || pending.idempotencyKey !== body.idempotencyKey
        ) {
          if (state.activeInputHash === body.inputHash && state.lastGeneration?.idempotencyKey === body.idempotencyKey) {
            return { status: 200, body: { ok: true, cached: true, ...publicMetadata(state) } };
          }
          return { status: 409, body: { ok: false, code: "DRAFT_REVISION_CONFLICT" } };
        }
        if (Number(pending.baseRevision || 0) !== Number(state.activeRevision || 0)) {
          return { status: 409, body: { ok: false, code: "DRAFT_REVISION_CONFLICT" } };
        }
        const nextRevision = Number(state.activeRevision || 0) + 1;
        const successSnapshot = {
          draftPlanId: state.draftId,
          status: GUEST_DRAFT_STATUSES.READY,
          activeRevision: nextRevision,
          activeInputHash: pending.pendingInputHash,
          activeInput: pending.pendingInput,
          preview: body.preview,
          claimedBy: state.claimedBy || "",
          claimedAt: Number(state.claimedAt || 0),
          claimPlanId: String(state.claimPlanId || state.draftId || ""),
          expiresAt: Number(state.expiresAt || 0),
        };
        const next = {
          ...state,
          status: "READY",
          activeRevision: nextRevision,
          activeInputHash: pending.pendingInputHash,
          activeInput: pending.pendingInput,
          activePlan: body.plan,
          activePlanInputHash: pending.pendingInputHash,
          activePreview: body.preview,
          pendingGeneration: null,
          generationResults: appendGenerationResult(state, {
            ...generationFingerprint(pending),
            outcome: GUEST_GENERATION_RESULT_OUTCOMES.SUCCESS,
            code: "",
            retryable: false,
            status: 200,
            revision: nextRevision,
            snapshot: successSnapshot,
            recordedAt: now,
          }),
          lastGeneration: {
            idempotencyKey: pending.idempotencyKey,
            inputHash: pending.pendingInputHash,
            baseRevision: Number(pending.baseRevision || 0),
            baseInputHash: String(pending.baseInputHash || ""),
            revision: nextRevision,
          },
          updatedAt: now,
        };
        await txn.put(STATE_KEY, next);
        return { status: 200, body: { ok: true, cached: false, ...publicMetadata(next) } };
      });
      return response(result.body, result.status);
    }

    if (url.pathname === "/fail-generation") {
      const result = await this.ctx.storage.transaction(async (txn) => {
        const state = await normalizeLiveState(txn, await txn.get(STATE_KEY), now);
        if (!state) return { status: 200, body: { ok: true } };
        if (state.pendingGeneration?.generationToken !== body.generationToken) return { status: 200, body: { ok: true } };
        const pending = state.pendingGeneration;
        const outcome = normalizeFailureOutcome(body.outcome || body.resultCategory);
        const failureResult = {
          ...generationFingerprint(pending),
          outcome,
          code: sanitizeFailureCode(
            body.code,
            outcome === GUEST_GENERATION_RESULT_OUTCOMES.TERMINAL_CONTRACT_FAILURE
              ? "AI_OUTPUT_DOMAIN_INVALID"
              : "AI_PROVIDER_REQUEST_FAILED",
          ),
          error: sanitizeFailureMessage(body.error),
          retryable: outcome === GUEST_GENERATION_RESULT_OUTCOMES.RETRYABLE_PROVIDER_FAILURE,
          status: Number.isInteger(Number(body.status)) && Number(body.status) >= 400 && Number(body.status) <= 599
            ? Number(body.status)
            : (outcome === GUEST_GENERATION_RESULT_OUTCOMES.RETRYABLE_PROVIDER_FAILURE ? 503 : 502),
          recordedAt: now,
        };
        const next = {
          ...state,
          status: Number(state.activeRevision || 0) > 0
            ? GUEST_DRAFT_STATUSES.READY
            : GUEST_DRAFT_STATUSES.FAILED,
          pendingGeneration: null,
          generationResults: appendGenerationResult(state, failureResult),
          updatedAt: now,
        };
        await txn.put(STATE_KEY, next);
        return {
          status: 200,
          body: {
            ok: true,
            cached: false,
            generationResult: publicGenerationResult(failureResult),
          },
        };
      });
      return response(result.body, result.status);
    }

    if (url.pathname === "/begin-revision") {
      const generationToken = String(body.generationToken || "");
      const result = await this.ctx.storage.transaction(async (txn) => {
        const state = await normalizeLiveState(txn, await txn.get(STATE_KEY), now);
        if (!state) {
          return { status: 410, body: { ok: false, code: "DRAFT_PLAN_EXPIRED", status: GUEST_DRAFT_STATUSES.EXPIRED } };
        }
        if (!capabilityMatches(state, body.capabilityHash)) return { status: 403, body: { ok: false, code: "DRAFT_PLAN_ACCESS_DENIED" } };
        const replay = idempotencyReplay(state, {
          idempotencyKey: body.idempotencyKey,
          inputHash: body.inputHash,
          baseRevision: body.expectedRevision,
          baseInputHash: body.expectedInputHash,
        });
        if (replay) return replay;
        if (state.status === "CLAIMED") return { status: 409, body: { ok: false, code: "DRAFT_PLAN_ALREADY_CLAIMED" } };
        if (Number(body.expectedRevision) !== Number(state.activeRevision) || body.expectedInputHash !== state.activeInputHash) {
          return { status: 412, body: { ok: false, code: "DRAFT_REVISION_CONFLICT", ...publicMetadata(state) } };
        }
        if (body.inputHash === state.activeInputHash) {
          return { status: 200, body: { ok: true, cached: true, unchanged: true, ...publicMetadata(state) } };
        }
        if (state.pendingGeneration) return { status: 409, body: { ok: false, code: "DRAFT_REVISION_PENDING" } };
        // activeRevision 1 is the initial preview, so revisions used = activeRevision - 1.
        if (Number(state.activeRevision || 0) > GUEST_DRAFT_MAX_REVISIONS) {
          return { status: 429, body: { ok: false, code: "GUEST_REVISION_LIMIT_REACHED" } };
        }
        const next = {
          ...state,
          status: "GENERATING",
          pendingGeneration: {
            kind: "revision",
            generationToken,
            pendingInputHash: String(body.inputHash || ""),
            pendingInput: body.input || null,
            idempotencyKey: String(body.idempotencyKey || ""),
            baseRevision: Number(state.activeRevision || 0),
            baseInputHash: String(state.activeInputHash || ""),
            startedAt: now,
          },
          updatedAt: now,
        };
        await txn.put(STATE_KEY, next);
        return { status: 200, body: { ok: true, cached: false, shouldGenerate: true, generationToken } };
      });
      return response(result.body, result.status);
    }

    if (url.pathname === "/inspect") {
      const state = await readLiveState(this.ctx.storage, now);
      if (!state) return expiredResponse();
      if (!capabilityMatches(state, body.capabilityHash)) return accessDenied();
      return response({ ok: true, ...publicMetadata(state) });
    }

    if (url.pathname === "/claim") {
      const result = await this.ctx.storage.transaction(async (txn) => {
        const state = await normalizeLiveState(txn, await txn.get(STATE_KEY), now);
        if (!state) {
          return { status: 410, body: { ok: false, code: "DRAFT_PLAN_EXPIRED", status: GUEST_DRAFT_STATUSES.EXPIRED } };
        }
        if (!capabilityMatches(state, body.capabilityHash)) return { status: 403, body: { ok: false, code: "DRAFT_PLAN_ACCESS_DENIED" } };
        if (state.status === "GENERATING") return { status: 409, body: { ok: false, code: "DRAFT_REVISION_PENDING" } };
        if (!state.activePlan || state.activePlanInputHash !== state.activeInputHash) {
          return { status: 409, body: { ok: false, code: "DRAFT_PLAN_INPUT_MISMATCH" } };
        }
        if (Number(body.expectedRevision) !== Number(state.activeRevision) || body.expectedInputHash !== state.activeInputHash) {
          return { status: 412, body: { ok: false, code: "DRAFT_REVISION_CONFLICT", ...publicMetadata(state) } };
        }
        if (state.status === "CLAIMED") {
          if (state.claimedBy !== body.userId) return { status: 409, body: { ok: false, code: "DRAFT_PLAN_ALREADY_CLAIMED" } };
          return { status: 200, body: { ok: true, idempotent: true, plan: state.activePlan, ...publicMetadata(state) } };
        }
        if (state.activePlan?.scheduleContract?.requiresAdjustmentBeforeClaim === true) {
          return { status: 409, body: { ok: false, code: "DRAFT_ADJUSTMENT_REQUIRED" } };
        }
        const next = {
          ...state,
          status: "CLAIMED",
          claimedBy: String(body.userId || ""),
          claimedAt: now,
          claimPlanId: state.draftId,
          claimScheduleStartPreference: ["as-is", "change-days", "shorter"].includes(body.scheduleStartPreference)
            ? body.scheduleStartPreference
            : "as-is",
          updatedAt: now,
        };
        await txn.put(STATE_KEY, next);
        return { status: 200, body: { ok: true, idempotent: false, plan: next.activePlan, ...publicMetadata(next) } };
      });
      return response(result.body, result.status);
    }

    return response({ ok: false, code: "NOT_FOUND" }, 404);
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}
