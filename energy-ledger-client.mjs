// worker → EnergyLedger DO 호출 어댑터.
//
// DO는 fetch 인터페이스만 노출하므로 매 호출마다 URL·직렬화를 다루게 된다.
// 그 지저분함을 여기 가둬서 worker 쪽은 reserve/commit/release만 부르면 되게 한다.
// 이 모듈은 절대 외부 라우트에 연결되지 않는다 — 차감 경로는 서버 내부에만 있다.

const INTERNAL_ORIGIN = "https://energy-ledger.internal";

export class EnergyLedgerUnavailableError extends Error {
  constructor() {
    super("에너지 원장을 사용할 수 없어요.");
    this.name = "EnergyLedgerUnavailableError";
    this.code = "ENERGY_LEDGER_UNAVAILABLE";
    this.status = 503;
  }
}

function ledgerError(payload, status) {
  const error = new Error(payload?.error || "에너지 원장 요청이 실패했어요.");
  error.code = payload?.code || "ENERGY_LEDGER_FAILED";
  error.status = Number(status) || 500;
  if (payload?.details) error.details = payload.details;
  return error;
}

// 체험 기간이 살아 있으면 플랜은 trial이다. 서버 레코드만 보고 판정한다 —
// 클라이언트가 보내는 값은 신뢰하지 않는다.
export function resolveUserPlan(user, now = Date.now()) {
  if (!user) return "free";
  if (user.plan === "pro") return "pro";
  const expiresAt = Number(user.trialExpiresAt || 0);
  if (Number.isFinite(expiresAt) && expiresAt > now) return "trial";
  return user.plan === "trial" ? "free" : user.plan || "free";
}

// 체험 자격·기간은 회원 레코드의 사실이므로 원장이 아니라 여기서 만든다.
// 남은 크레딧은 원장이 실제 잔량으로 채워 넣는다.
export function describeTrial(user, now = Date.now()) {
  if (!user) return { eligible: false, active: false, startedAt: null, endsAt: null };
  const endsAtMs = Number(user.trialExpiresAt || 0);
  const startedAtMs = Number(user.trialStartedAt || 0);
  return {
    eligible: !user.trialUsedAt && user.plan !== "pro",
    active: Number.isFinite(endsAtMs) && endsAtMs > now,
    startedAt: startedAtMs ? new Date(startedAtMs).toISOString() : null,
    endsAt: endsAtMs ? new Date(endsAtMs).toISOString() : null,
  };
}

export function createEnergyLedgerClient(env) {
  const binding = env?.ENERGY_LEDGER;
  if (!binding || typeof binding.idFromName !== "function" || typeof binding.get !== "function") return null;

  async function call(userId, operation, body = {}) {
    const id = String(userId || "").trim();
    if (!id) throw new EnergyLedgerUnavailableError();
    // id를 유저별로 고정해야 "유저당 단일 인스턴스"가 성립한다.
    const stub = binding.get(binding.idFromName(`user:${id}`));
    const response = await stub.fetch(`${INTERNAL_ORIGIN}${operation}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok || payload?.ok === false) throw ledgerError(payload, response.status);
    return payload;
  }

  return {
    reserve: (userId, { plan, action, requestId, now, trial }) => call(userId, "/reserve", { plan, action, requestId, now, trial }),
    commit: (userId, { plan, requestId, now, meta, trial }) => call(userId, "/commit", { plan, requestId, now, meta, trial }),
    release: (userId, { plan, requestId, now, errorCode, trial }) => call(userId, "/release", { plan, requestId, now, errorCode, trial }),
    usage: (userId, { plan, now, trial } = {}) => call(userId, "/usage", { plan, now, trial }),
    purchase: (userId, { plan, orderId, amount, expiresAt, now, meta }) =>
      call(userId, "/purchase", { plan, orderId, amount, expiresAt, now, meta }),
    reset: (userId, { plan, now, reason } = {}) => call(userId, "/reset", { plan, now, reason }),
    transactions: (userId, { limit } = {}) => call(userId, "/transactions", { limit }),
  };
}
