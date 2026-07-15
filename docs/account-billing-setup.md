# 회원·관리자·월정액 운영 설정

애플리케이션 코드는 소셜 OAuth, 24시간 체험, 관리자 권한, 토스페이먼츠 자동결제까지 연결되어 있다. 실제 배포에서는 아래 외부 서비스 키와 Cloudflare 바인딩이 필요하다. 비밀 키는 저장소나 `wrangler.jsonc`에 넣지 않고 Cloudflare Secret으로 등록한다.

## 1. 회원 저장소

Cloudflare KV namespace를 만든 뒤 Worker의 `USERS_KV` 바인딩으로 연결한다. 이 바인딩이 없으면 배포 환경의 회원 API는 `503`으로 중단되어 휘발성 회원 데이터가 생기지 않는다. 로컬 개발 서버는 `tmp/dev-users.json`을 사용한다.

## 2. 소셜 로그인

각 공급자 콘솔에 아래 콜백 URL을 등록한다.

- 카카오: `https://서비스도메인/api/auth/callback/kakao`
- 네이버: `https://서비스도메인/api/auth/callback/naver`
- 구글: `https://서비스도메인/api/auth/callback/google`
- Apple: `https://서비스도메인/api/auth/callback/apple`

Worker Secret/Variable:

- `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`
- `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`
- `SESSION_SECRET`: 충분히 긴 무작위 문자열
- `ADMIN_EMAILS`: 관리자 소셜 계정 이메일을 쉼표로 구분

관리자용 공용 비밀번호는 사용하지 않는다. 허용 목록에 등록된 이메일로 소셜 로그인한 계정만 관리자 역할을 받는다.

운영에서는 `ALLOW_DEV_LOGIN`을 설정하지 않는다. 로컬 `serve-local.cjs`에서만 데모 로그인이 기본 활성화된다.

## 3. PRO 월정액

토스페이먼츠 자동결제(빌링) 계약을 완료하고 자동결제 MID의 키를 등록한다.

- 공개 변수 `TOSS_CLIENT_KEY`
- Worker Secret `TOSS_SECRET_KEY`

사용자가 PRO를 선택하면 토스 SDK 카드 등록창이 열리고, 서버가 `authKey`로 빌링키를 발급한 뒤 첫 달 2,900원을 승인한다. 매일 00:15 UTC에 실행되는 Worker Cron이 결제일이 지난 활성 구독을 갱신한다. 사용자가 해지하면 빌링키를 삭제하고 이미 결제한 기간 종료일까지 PRO를 유지한다. 통신 오류 때는 같은 주문 ID로 결제 결과를 조회하며, 갱신 실패는 하루 간격으로 최대 3회까지 처리한 뒤 PRO를 중단한다.

실제 판매는 다음을 모두 마친 뒤에만 `wrangler.production.jsonc`의 `PAYMENTS_ENABLED`를 `true`로 바꾼다. 키만 등록해도 이 값이 `false`이면 결제창과 승인 API는 비활성 상태를 유지한다.

- 토스페이먼츠 빌링 계약과 운영 MID 심사 완료
- 사업자명, 대표자, 사업자등록번호, 통신판매업 신고번호, 사업장 주소, 대표 연락처를 결제 화면과 법적 페이지에 공개
- 청약철회·환불 기준과 정기결제 사전 고지 법률 검토
- 테스트 키로 최초 승인, 중복 요청 복구, 해지, 3회 갱신 실패, 탈퇴 시 빌링키 해지를 확인

운영에서는 `ALLOW_DEMO_BILLING`을 설정하지 않는다. 로컬 서버에서만 실제 카드 결제 없는 데모 전환이 기본 활성화된다.

## 4. 배포 전 확인

1. 세 소셜 공급자에서 실제 계정 로그인과 콜백을 각각 확인한다.
2. `ADMIN_EMAILS`에 없는 회원이 `/admin.html`과 `/api/admin/users`에서 거부되는지 확인한다.
3. 토스 테스트 키로 카드 등록, 첫 결제, 중복 콜백, 해지, 갱신 실패를 확인한다.
4. 라이브 키 전환 뒤 토스 상점관리자 결제 내역과 앱 회원의 PRO 상태가 일치하는지 확인한다.

## 5. 서버 동기화

로그인 회원의 목표·계획·실행·메이트 상태는 `USERS_KV`의 사용자별 `appstate:` 레코드로 동기화된다. 클라이언트는 revision을 함께 보내 낡은 기기의 덮어쓰기를 거부하고, 충돌 시 서버 최신본을 적용하기 전에 로컬 충돌 백업을 남긴다. 휴대전화 일부와 마케팅 동의처럼 동기화가 불필요한 정보는 서버에 올리지 않는다.

탈퇴 요청이 성공하면 app state, 소셜 identity와 session을 즉시 삭제하고, 재로그인 방지용 최소 tombstone만 7일 뒤 Cron에서 삭제한다. 운영 전 두 기기에서 순차 수정, 동시 수정 충돌, 오프라인 후 복귀, 탈퇴 후 재로그인 거부를 수동 확인한다.
