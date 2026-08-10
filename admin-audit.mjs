/* 관리자 조작 이력 (migrations/0003_admin_actions.sql).
 *
 * 결제 상태는 entitlement_events가 append-only로 남기지만, 관리자가 회원의 plan·role을
 * 직접 바꾸는 경로에는 그런 기록이 없었다. 이 모듈이 그 자리를 채운다.
 *
 * 설계 한 줄: **감사 기록 실패가 관리자 작업을 막지 않는다.** BILLING_DB가 없는
 * 배포에서는 createAdminAuditStore가 null을 돌려주고 호출부는 조용히 넘어간다.
 * 기록이 남지 않는 것보다 회원의 잘못된 plan을 못 고치는 쪽이 나쁘다.
 *
 * 같은 BILLING_DB를 billing-ledger.mjs와 entitlement-service.mjs도 쓴다. 각 모듈이
 * 자기 메모리 페이크와 판별 표시를 갖는 것이 이 저장소의 관례다. */

export function createMemoryAdminAuditDb() {
  return { __adminAuditMemory: true, actions: [] };
}

/* 쓸 수 있는 저장소가 아니면 null이다. 호출부는 null을 "감사 꺼짐"으로 읽는다 —
   테스트 env처럼 다른 모듈의 메모리 페이크가 들어와도 여기서 걸러진다. */
export function createAdminAuditStore(db) {
  if (db?.__adminAuditMemory) {
    return {
      async insertAction(values) {
        db.actions.push({ ...values });
      },
      async listActions({ limit = 50 } = {}) {
        return [...db.actions].sort((a, b) => b.created_at - a.created_at).slice(0, limit);
      },
    };
  }
  if (typeof db?.prepare !== "function") return null;
  return {
    async insertAction(values) {
      await db.prepare(
        `INSERT INTO admin_actions
           (action_id, actor_id, actor_source, action, target_user_id,
            previous_value, new_value, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      ).bind(
        values.action_id, values.actor_id, values.actor_source, values.action,
        values.target_user_id ?? null, values.previous_value ?? null,
        values.new_value ?? null, values.created_at,
      ).run();
    },
    async listActions({ limit = 50 } = {}) {
      const result = await db.prepare(
        "SELECT * FROM admin_actions ORDER BY created_at DESC LIMIT ?1",
      ).bind(limit).all();
      return result?.results || [];
    },
  };
}

/* 비밀번호 로그인은 KV에 레코드가 없는 합성 관리자다(auth-service.mjs의
   currentSessionUser). 그래서 id 하나로 두 종류를 구분할 수 있다. */
export function adminActorSource(adminId) {
  return String(adminId) === "admin:password" ? "password" : "account";
}
