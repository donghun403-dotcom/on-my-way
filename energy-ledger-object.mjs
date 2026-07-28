// 유저별 에너지 원장 Durable Object.
//
// 이 클래스가 존재하는 이유는 단 하나다: **유저당 단일 실행 보장**.
// 기존 원장은 KV 유저 레코드를 read-modify-write 했고, 직렬화는 `userOperationLocks`라는
// 모듈 스코프 Map에 의존했다. 그 Map은 아이솔레이트 안에서만 유효하므로 서로 다른
// 아이솔레이트에 떨어진 동시 요청은 같은 레코드를 읽고 각자 예약한 뒤 덮어써서
// 이중 차감이 가능했다. KV에는 CAS가 없어 그 구조로는 막을 방법이 없다.
// DO는 id마다 단 하나의 인스턴스가 단일 스레드로 도므로 이 문제 자체가 사라진다.
//
// 외부에 직접 노출하지 않는다. worker만 바인딩을 통해 부른다 —
// 차감 API를 공개하지 않는다는 원칙이 여기서도 유지된다.

import {
  EnergyLedgerError,
  commitEnergy,
  getEnergyUsage,
  listTransactions,
  purchaseEnergy,
  releaseEnergy,
  reserveEnergy,
  resetLedgerForPlan,
} from "./energy-ledger.mjs";

function response(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function readJson(request) {
  try {
    const value = await request.json();
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function errorBody(error) {
  if (error instanceof EnergyLedgerError) {
    const body = { ok: false, code: error.code, error: error.message };
    if (error.details) body.details = error.details;
    return { body, status: error.status };
  }
  return {
    body: { ok: false, code: "ENERGY_LEDGER_FAILED", error: "에너지 원장을 사용할 수 없어요." },
    status: 500,
  };
}

export class EnergyLedgerObject {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    if (request.method !== "POST") return response({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);

    const url = new URL(request.url);
    const body = await readJson(request);
    const now = Number.isFinite(Number(body.now)) ? Number(body.now) : Date.now();
    const plan = String(body.plan || "free");
    const timeZone = body.timeZone ? String(body.timeZone) : undefined;
    // 체험 상태는 회원 레코드의 사실이라 worker가 넘겨준다.
    const trial = body.trial && typeof body.trial === "object" ? body.trial : undefined;

    try {
      // 모든 연산을 storage.transaction 안에서 돈다. DO가 이미 단일 실행이라
      // 경합은 없지만, 트랜잭션은 중간 예외 시 부분 기록(거래는 남고 상태는 안 바뀌는 등)을
      // 막아 준다 — append-only 기록과 잔액이 어긋나면 감사 기록의 의미가 없다.
      const result = await this.ctx.storage.transaction(async (txn) => {
        const storage = wrapStorage(txn);
        switch (url.pathname) {
          case "/reserve":
            return reserveEnergy(storage, { plan, action: String(body.action || ""), requestId: body.requestId, now, timeZone, trial });
          case "/commit":
            return commitEnergy(storage, { plan, requestId: body.requestId, now, timeZone, meta: body.meta, trial });
          case "/release":
            return releaseEnergy(storage, { plan, requestId: body.requestId, now, timeZone, errorCode: body.errorCode, trial });
          case "/purchase":
            return purchaseEnergy(storage, {
              plan,
              orderId: body.orderId,
              amount: body.amount,
              expiresAt: body.expiresAt,
              now,
              timeZone,
              meta: body.meta,
            });
          case "/usage":
            return getEnergyUsage(storage, { plan, now, timeZone, trial });
          case "/reset":
            return resetLedgerForPlan(storage, { plan, now, timeZone, reason: String(body.reason || "migration") });
          case "/transactions":
            return { ok: true, transactions: await listTransactions(storage, { limit: body.limit }) };
          default:
            throw new EnergyLedgerError("UNKNOWN_LEDGER_OPERATION", "지원하지 않는 원장 연산이에요.", 404);
        }
      });
      return response(result);
    } catch (error) {
      const { body: errorPayload, status } = errorBody(error);
      if (status >= 500) {
        console.error("Energy ledger operation failed", {
          operation: url.pathname,
          errorCategory: error?.code || error?.name || "UNKNOWN",
        });
      }
      return response(errorPayload, status);
    }
  }
}

// DO 트랜잭션 객체를 energy-ledger.mjs가 기대하는 최소 인터페이스로 감싼다.
// list()는 Map을 돌려주므로 그대로 넘긴다.
function wrapStorage(txn) {
  return {
    get: (key) => txn.get(key),
    put: (key, value) => txn.put(key, value),
    delete: (key) => txn.delete(key),
    list: (options) => txn.list(options),
  };
}
