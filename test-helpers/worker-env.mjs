/* 워커 라우트 테스트가 공유하는 env 스텁.

   차감 경로에 KV 폴백이 없어진 뒤로는 worker.fetch를 부르는 모든 테스트가
   ENERGY_LEDGER를 갖고 있어야 한다. 파일마다 스텁을 다시 쓰면 그중 하나가
   실제 DO와 다르게 동작해도 아무도 모르므로 여기 한 벌만 둔다. */
import { EnergyLedgerObject } from "../energy-ledger-object.mjs";

export function memoryKv() {
  const values = new Map();
  return {
    values,
    async get(key, type) {
      const value = values.get(key);
      if (value === undefined) return null;
      if (type === "json" || type?.type === "json") return JSON.parse(value);
      return value;
    },
    async put(key, value) { values.set(key, String(value)); },
    async delete(key) { values.delete(key); },
    async list({ prefix = "" } = {}) {
      return {
        keys: [...values.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })),
        list_complete: true,
        cursor: "",
      };
    },
  };
}

/* 실제 DO를 흉내 낸다. 중요한 성질 두 가지를 지킨다:
   ① id마다 인스턴스가 하나다   ② 그 인스턴스의 요청은 직렬로 처리된다.
   이 두 가지가 이중 차감을 막는 근거이므로 스텁도 반드시 이렇게 동작해야 한다. */
export function durableObjectNamespace() {
  const instances = new Map();
  const queues = new Map();

  function instanceFor(name) {
    if (!instances.has(name)) {
      const values = new Map();
      const storage = {
        async get(key) { const v = values.get(key); return v === undefined ? undefined : structuredClone(v); },
        async put(key, value) { values.set(key, structuredClone(value)); },
        async delete(key) { values.delete(key); },
        async list({ prefix = "" } = {}) {
          const out = new Map();
          for (const [k, v] of [...values.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
            if (k.startsWith(prefix)) out.set(k, structuredClone(v));
          }
          return out;
        },
        // 트랜잭션: 콜백이 던지면 변경을 되돌린다.
        async transaction(callback) {
          const snapshot = new Map([...values.entries()].map(([k, v]) => [k, structuredClone(v)]));
          try {
            return await callback(storage);
          } catch (error) {
            values.clear();
            for (const [k, v] of snapshot) values.set(k, v);
            throw error;
          }
        },
      };
      instances.set(name, new EnergyLedgerObject({ storage }, {}));
    }
    return instances.get(name);
  }

  return {
    idFromName(name) { return name; },
    get(name) {
      return {
        // 실제 DO stub과 같은 시그니처: fetch(url, init) 또는 fetch(Request).
        async fetch(input, init) {
          const request = input instanceof Request ? input : new Request(input, init);
          // 인스턴스당 단일 실행: 앞선 요청이 끝나야 다음이 시작된다.
          const previous = queues.get(name) || Promise.resolve();
          const current = previous.catch(() => {}).then(() => instanceFor(name).fetch(request));
          queues.set(name, current.catch(() => {}));
          return current;
        },
      };
    },
  };
}

/* 바인딩이 아예 없는 env를 만들 때 쓴다 — fail-closed 경로를 보는 테스트용.
   기본값은 "원장이 있는" 정상 배포 모양이다. */
export function workerEnv({ kv = memoryKv(), ledger = durableObjectNamespace(), ...overrides } = {}) {
  return {
    USERS_KV: kv,
    ENERGY_LEDGER: ledger,
    APP_ENV: "test",
    ...overrides,
  };
}
