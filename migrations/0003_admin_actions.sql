-- ─────────────────────────────────────────────────────────────────────────────
-- 0003_admin_actions.sql — 관리자 조작 이력
--
-- 왜 필요한가: 결제로 생긴 상태 변화는 entitlement_events에 append-only로 남는다.
-- 누가·왜·어느 알림 때문에 바뀌었는지 되짚을 수 있다. 그런데 관리자가
-- /api/admin/users/update로 회원의 plan이나 role을 직접 바꾸면 **아무 기록도
-- 남지 않았다.** 나중에 "이 계정은 왜 Pro지?", "관리자 권한을 언제 누가 줬지?"를
-- 물으면 답할 방법이 없다.
--
-- 무엇을 싣지 않는가:
--   * 이메일·이름 — target_user_id는 usr_<HMAC> 내부 ID다. 그것으로 충분하다.
--   * 접속 IP — 지금 관리자는 운영자 본인 하나뿐이라 얻는 것보다 보관 책임이 크다.
--   * 비밀번호 — 변경 사실만 남기고 이전·이후 값은 담지 않는다.
--
-- 쓰기는 admin-audit.mjs가 하고, BILLING_DB가 없는 배포에서는 조용히 꺼진다.
-- 감사 기록 실패가 관리자 작업 자체를 막아서는 안 되기 때문이다.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_actions (
  action_id      TEXT PRIMARY KEY,

  /* 조작한 주체. 비밀번호 로그인은 KV에 레코드가 없는 합성 관리자라 'admin:password'가
     그대로 들어오고, 소셜 로그인 관리자는 usr_<HMAC>가 들어온다. 그 둘을 구분해야
     "서버 비밀번호를 아는 사람"과 "특정 계정"을 나눠 볼 수 있다. */
  actor_id       TEXT NOT NULL,
  actor_source   TEXT NOT NULL CHECK (actor_source IN ('password', 'account')),

  action         TEXT NOT NULL CHECK (action IN (
                   'user_plan_change',
                   'user_role_change',
                   'admin_password_change'
                 )),

  /* 대상 회원. 비밀번호 변경처럼 대상이 없는 조작은 NULL. */
  target_user_id TEXT,

  /* 바뀌기 전과 후. 값이 없는 조작(비밀번호)은 둘 다 NULL이다. */
  previous_value TEXT,
  new_value      TEXT,

  created_at     INTEGER NOT NULL
);

/* "최근에 무슨 일이 있었나" — 관리 화면과 사고 조사가 읽는 순서. */
CREATE INDEX IF NOT EXISTS idx_admin_actions_created
  ON admin_actions (created_at DESC);

/* "이 회원에게 무슨 일이 있었나" — 문의 응대가 읽는 순서. */
CREATE INDEX IF NOT EXISTS idx_admin_actions_target
  ON admin_actions (target_user_id, created_at DESC);
