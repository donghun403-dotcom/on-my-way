/* 배포된 워커가 실제로 해석한 바인딩을 보고하고, 그 보고 하나로 배포를 판정한다.

   왜 설정 파일이 아니라 런타임 보고를 보는가: 바인딩 주입 경로가 셋이다.
   preview는 워크플로의 jq, staging은 .github/scripts/staging-config.mjs, production은
   wrangler.production.jsonc 그대로. 생성기마다 검증을 따로 두면 셋이 각자 표류하고,
   "설정에는 있는데 배포본에는 없다"는 경우를 아무도 못 잡는다. 산출물 하나(/api/health)를
   검증하면 생성기가 넷이 되어도 검증은 여기 한 곳이다.

   값·ID·시크릿은 절대 싣지 않는다. 있고 없고만 불리언으로 낸다. */

/* 존재만 보지 않고 모양까지 본다. 이름은 맞는데 다른 타입이 꽂힌 경우
   (예: DO 자리에 KV) truthy 검사만으로는 통과해 버린다. */
const BINDING_SHAPES = Object.freeze({
  USERS_KV: ["get", "put"],
  ENERGY_LEDGER: ["idFromName", "get"],
  AI_RATE_LIMITER: ["limit"],
  BILLING_DB: ["prepare"],
  ASSETS: ["fetch"],
});

export const VERIFIED_BINDINGS = Object.freeze(Object.keys(BINDING_SHAPES));

/* 결제를 켜기 전에는 BILLING_DB가 없어도 배포를 막지 않는다. 켜는 순간 스스로 무장된다.
   나머지 넷은 없으면 조용한 성능 저하가 생기는 자리라 항상 요구한다 — 특히
   ENERGY_LEDGER는 빠져도 배포가 성공하고 차감이 KV로 새기 때문에 반드시 걸러야 한다. */
export const ALWAYS_REQUIRED_BINDINGS = Object.freeze(["USERS_KV", "ENERGY_LEDGER", "AI_RATE_LIMITER", "ASSETS"]);
export const PAYMENTS_REQUIRED_BINDINGS = Object.freeze(["BILLING_DB"]);

function resolves(binding, methods) {
  if (!binding || (typeof binding !== "object" && typeof binding !== "function")) return false;
  return methods.every((method) => typeof binding[method] === "function");
}

export function describeBindings(env) {
  const source = env && typeof env === "object" ? env : {};
  const report = {};
  for (const [name, methods] of Object.entries(BINDING_SHAPES)) {
    report[name] = resolves(source[name], methods);
  }
  return report;
}

/* 결제 "의도"다. billingStatus().enabled는 키까지 갖춰져야 true라, 플래그만 켜고 키가
   빠진 상태에서 BILLING_DB 요구가 조용히 면제되는 구멍이 생긴다. 여기서는 플래그만 본다. */
export function paymentsIntended(env) {
  return String(env?.PAYMENTS_ENABLED || "").toLowerCase() === "true";
}

/* 배포된 /api/health 응답 하나만 받아 판정한다. 세 배포 경로가 모두 이 함수를 부른다. */
export function checkBindingInvariants(health) {
  const failures = [];
  if (!health || typeof health !== "object") {
    return { ok: false, failures: ["health 응답을 읽을 수 없습니다."] };
  }

  const bindings = health.bindings;
  if (!bindings || typeof bindings !== "object") {
    // 구버전 워커에 새 검증기를 걸면 여기서 걸린다. 조용히 통과시키지 않는다.
    return { ok: false, failures: ["health 응답에 bindings가 없습니다 — 배포본이 검증기보다 오래됐습니다."] };
  }

  for (const name of VERIFIED_BINDINGS) {
    if (typeof bindings[name] !== "boolean") failures.push(`${name}: 보고되지 않음`);
  }

  for (const name of ALWAYS_REQUIRED_BINDINGS) {
    if (bindings[name] === false) failures.push(`${name}: 해석되지 않음 (항상 필요)`);
  }

  if (health.paymentsEnabled === true) {
    for (const name of PAYMENTS_REQUIRED_BINDINGS) {
      if (bindings[name] !== true) failures.push(`${name}: 해석되지 않음 (PAYMENTS_ENABLED=true)`);
    }
  }

  return { ok: failures.length === 0, failures };
}
