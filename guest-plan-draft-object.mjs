const STATE_KEY = "draft";
export const GUEST_DRAFT_SCHEMA_VERSION = 1;
export const GUEST_DRAFT_TTL_MS = 24 * 60 * 60 * 1_000;
export const GUEST_DRAFT_FAILURE_TTL_MS = 60 * 1_000;
export const GUEST_DRAFT_GENERATION_LEASE_MS = 90 * 1_000;
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
    expiresAt: Number(state.expiresAt || 0),
  };
}

function generationLeaseExpired(state, now) {
  const startedAt = Number(state?.pendingGeneration?.startedAt);
  return state?.status === GUEST_DRAFT_STATUSES.GENERATING
    && Number.isFinite(startedAt)
    && startedAt + GUEST_DRAFT_GENERATION_LEASE_MS <= now;
}

async function normalizeLiveState(storage, state, now) {
  if (!state) return null;
  if (expired(state, now)) {
    await storage.delete(STATE_KEY);
    return null;
  }
  if (!generationLeaseExpired(state, now)) return state;
  if (Number(state.activeRevision || 0) < 1 || !state.activePlan) {
    await storage.delete(STATE_KEY);
    return null;
  }
  const recovered = {
    ...state,
    status: GUEST_DRAFT_STATUSES.READY,
    pendingGeneration: null,
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
        if (state?.status === "FAILED") {
          return { status: 429, body: { ok: false, code: "GUEST_PREVIEW_COOLDOWN" } };
        }
        if (state?.status === "GENERATING") {
          return { status: 409, body: { ok: false, code: "GUEST_PREVIEW_PENDING" } };
        }
        if (state) {
          if (!capabilityMatches(state, body.capabilityHash)) return { status: 403, body: { ok: false, code: "DRAFT_PLAN_ACCESS_DENIED" } };
          if (state.activeInputHash !== body.inputHash) return { status: 429, body: { ok: false, code: "GUEST_PREVIEW_ALREADY_USED" } };
          return { status: 200, body: { ok: true, cached: true, ...publicMetadata(state) } };
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
        if (Number(state.activeRevision || 0) > 0) {
          await txn.put(STATE_KEY, { ...state, status: "READY", pendingGeneration: null, updatedAt: now });
        } else {
          const expiresAt = now + GUEST_DRAFT_FAILURE_TTL_MS;
          await txn.put(STATE_KEY, {
            ...state,
            status: "FAILED",
            pendingGeneration: null,
            updatedAt: now,
            expiresAt,
          });
          await txn.setAlarm(expiresAt);
        }
        return { status: 200, body: { ok: true } };
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
        if (state.status === "CLAIMED") return { status: 409, body: { ok: false, code: "DRAFT_PLAN_ALREADY_CLAIMED" } };
        if (
          state.lastGeneration?.idempotencyKey === body.idempotencyKey
          && state.lastGeneration?.inputHash === body.inputHash
          && Number(state.lastGeneration?.baseRevision) === Number(body.expectedRevision)
          && state.lastGeneration?.baseInputHash === body.expectedInputHash
        ) {
          return { status: 200, body: { ok: true, cached: true, idempotent: true, ...publicMetadata(state) } };
        }
        if (Number(body.expectedRevision) !== Number(state.activeRevision) || body.expectedInputHash !== state.activeInputHash) {
          return { status: 412, body: { ok: false, code: "DRAFT_REVISION_CONFLICT", ...publicMetadata(state) } };
        }
        if (body.inputHash === state.activeInputHash) {
          return { status: 200, body: { ok: true, cached: true, unchanged: true, ...publicMetadata(state) } };
        }
        if (state.pendingGeneration) return { status: 409, body: { ok: false, code: "DRAFT_REVISION_PENDING" } };
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
        const next = {
          ...state,
          status: "CLAIMED",
          claimedBy: String(body.userId || ""),
          claimedAt: now,
          claimPlanId: state.draftId,
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
