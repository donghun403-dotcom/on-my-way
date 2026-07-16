# 회원·관리자·결제 운영 설정

애플리케이션에는 소셜 OAuth, 계정 저장·동기화, 관리자 권한과 Toss Payments 빌링 코드가 포함되어 있습니다. 다만 외부 서비스 설정이 필요하고 운영 결제는 `PAYMENTS_ENABLED=false`로 비활성화되어 있습니다. 이 문서는 설정과 출시 조건을 설명하며 실제 결제나 새 크레딧 정책의 배포 완료를 보장하지 않습니다.

## 1. 회원 저장소

Cloudflare KV namespace를 Worker의 `USERS_KV` 바인딩으로 연결합니다. 이 바인딩이 없으면 배포 환경의 회원 API는 `503`으로 중단되어 휘발성 운영 회원 데이터가 생기지 않습니다. 로컬 개발 서버는 `tmp/dev-users.json`을 사용합니다.

Preview와 운영은 서로 다른 KV namespace를 사용합니다. 운영 데이터로 Preview를 테스트하지 않습니다.

로그인 회원의 목표·계획·실행·메이트 상태는 사용자별 `appstate:` 레코드로 동기화됩니다. 클라이언트는 revision을 함께 보내 낡은 기기의 덮어쓰기를 거부하고, 충돌 시 서버 최신본을 적용하기 전에 로컬 충돌 백업을 남깁니다.

AI 크레딧은 브라우저 localStorage가 아니라 기존 `user:<id>` JSON의 `aiCredits` 필드에 저장된 정책 버전·기간·사용량·예약 상태를 기준으로 해야 합니다. 별도 KV key를 만들지 않습니다. 정책은 `plan-policy.mjs`, 정규화와 차감 수명주기는 `ai-credits-service.mjs`를 기준으로 하며 상세 계약은 [가격 및 AI 크레딧 정책](pricing-and-credits.md)과 [AI 아키텍처](ai-architecture.md)를 따릅니다.

## 2. 소셜 로그인

각 공급자 콘솔에 아래 callback URL을 등록합니다.

- Kakao: `https://서비스도메인/api/auth/callback/kakao`
- Naver: `https://서비스도메인/api/auth/callback/naver`
- Google: `https://서비스도메인/api/auth/callback/google`
- Apple: `https://서비스도메인/api/auth/callback/apple`

Worker Secret/Variable:

- `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`
- `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`
- `SESSION_SECRET`: 충분히 긴 무작위 문자열
- `ADMIN_EMAILS`: 관리자 소셜 계정 이메일을 쉼표로 구분

Secret은 Preview와 운영 Worker에 별도로 등록합니다. 저장소, 일반 환경 변수, 화면 캡처나 로그에 값을 남기지 않습니다.

관리자용 공용 비밀번호를 운영 기본 경로로 사용하지 않습니다. 허용 목록에 등록된 이메일로 소셜 로그인한 계정만 관리자 역할을 받습니다. 운영에서는 `ALLOW_DEV_LOGIN`을 설정하지 않습니다.

## 3. 확정 plan과 체험

- Free: 무료, 월 5 AI 크레딧, 일 2 크레딧, 목표·활성 계획 각 1개
- Pro: 월 4,900원, 월 250 AI 크레딧, 일 30 크레딧, 목표·활성 계획 제한 없음
- Pro Trial: 계정당 1회, 시작 후 24시간, 총 15 AI 크레딧

체험 자격과 시작·종료 시각은 서버 사용자 ID로 관리합니다. localStorage 삭제, 로그아웃이나 기기 변경으로 체험이 다시 생기면 안 됩니다. 체험 종료 후 활성 구독이 없으면 Free로 전환하고 남은 체험 크레딧은 소멸합니다.

결제수단이 등록되지 않은 현재 구조에서는 체험 종료만으로 자동 결제하지 않습니다.

## 4. Toss Payments 현재 상태

Toss Payments 자동결제 코드는 부분 구현 상태입니다. 운영의 `wrangler.production.jsonc`는 다음 값을 유지합니다.

```json
{
  "PAYMENTS_ENABLED": "false",
  "ALLOW_DEMO_BILLING": "false"
}
```

필요한 설정:

- 공개 변수 `TOSS_CLIENT_KEY`
- Worker Secret `TOSS_SECRET_KEY`
- 자동결제 계약과 운영 MID

정책상 최초 승인과 갱신 목표 금액은 `4,900`원입니다. UI 문구, 서버 승인 금액, Toss 상품·MID와 테스트 기대값이 모두 같은 중앙 plan 설정을 사용해야 합니다. 이전 저가 요금 값을 그대로 승인하거나 화면만 바꾸면 안 됩니다.

결제가 활성화되기 전 CTA는 `Pro 출시 준비 중`처럼 실제 상태를 표시해야 합니다. 실제 전송 경로가 없는 출시 알림이나 카드 등록창, 결제 완료, Pro 전환이 일어난 것처럼 가장하지 않습니다. Toss 브라우저 SDK도 결제 운영 승인이 켜지고 사용자가 결제를 시작할 때만 동적으로 불러옵니다.

### 4-1. 최초 승인 결제 원장

최초 정기결제 승인 주문은 전용 D1 데이터베이스의 `BILLING_DB` 바인딩을 사용합니다. migration은 `migrations/0001_billing_ledger.sql`이며 다음 테이블을 만듭니다.

- `billing_accounts`: 사용자 ID와 서버 생성 `customerKey`의 1:1 연결, billing key fingerprint와 상태
- `billing_orders`: 서버 확정 금액, 논리 요청 fingerprint, Toss `Idempotency-Key`, 주문 상태와 `paymentKey`
- `billing_events`: 주문 상태 전이를 보존하는 append-only 이벤트

Preview와 Production은 서로 다른 D1 database를 `BILLING_DB`로 연결해야 합니다. 실제 database ID는 외부 Cloudflare 작업 후에만 각 Wrangler 설정에 추가하며, 저장소에는 placeholder ID를 기록하지 않습니다. D1에는 raw billing key를 저장하지 않고, Worker 사용자 KV에 있는 기존 billing key와 단방향 fingerprint만 연결합니다.

최초 승인 재시도는 같은 논리 요청의 기존 주문과 같은 `Idempotency-Key`를 재사용합니다. Toss 응답의 완료 상태·금액 4,900원·주문 ID·customerKey·paymentKey를 서버에서 검증한 뒤에만 Pro 권한을 부여합니다. timeout 또는 결과 불명확 상태는 `unknown`으로 남기고 신규 청구를 만들지 않습니다.

이번 단계에서 갱신 전체 통합, 환불·부분 환불, webhook/reconciliation, Toss Sandbox 실계정 검증과 Production 활성화는 아직 완료하지 않습니다.

### Preview 배포 전파 보호

Cloudflare Preview 배포 직후 정적 asset 전파가 늦어질 수 있으므로 `.github/workflows/pr-preview.yml`은 Preview Playwright 전에 `/plan-policy.mjs`의 `200` 응답을 제한적으로 확인합니다. 이 대기는 결제 API를 호출하지 않으며 `PAYMENTS_ENABLED=false` 정책과 D1 미연결 상태를 변경하지 않습니다.

### Preview D1 binding 및 Smoke Test

- Preview 전용 D1 database 이름은 `on-my-way-billing-preview`이며 APAC 위치로 생성했습니다.
- `migrations/0001_billing_ledger.sql`을 원격 적용하고 billing 테이블·index·unique/check/foreign key 제약을 확인했습니다.
- PR Preview workflow는 Repository Secret의 Preview D1 식별자를 독립적인 Actions 단계에서 읽고 배포 직전에만 임시 generated Wrangler 설정에 `BILLING_DB`를 주입합니다. 식별자는 GitHub 로그에서 mask 처리하고 생성 설정은 정적 assets에서 제외하며, 저장소·PR·문서에는 기록하지 않습니다.
- `BILLING_DB`는 Preview workflow가 생성하는 설정에만 연결하며 Production 설정에는 연결하지 않습니다.
- 실제 결제 API 없이 `smoke_test_` 가짜 데이터로 사용자 격리, logical request·idempotency 중복 방지, `created → pending → succeeded` 전이, event 원장을 검증했습니다. 결과는 accounts 2, orders 2, events 3이며 cleanup 후 잔여 행은 모두 0입니다.
- `PAYMENTS_ENABLED=false`를 유지하고 Preview Toss Test Key Secret 이름 등록·구성 검증만 완료했습니다. Sandbox 결제·Production key·Production D1은 설정하지 않았습니다.

### 최신 Preview 검증 결과

- Preview D1 생성, `0001_billing_ledger.sql` migration 적용, 원장 smoke test 성공과 smoke test 데이터 cleanup 완료 상태를 확인하고 그대로 재사용했습니다.
- Repository Secret 기반 generated Wrangler 설정으로 `BILLING_DB` Preview binding을 생성·배포했으며, 배포 후 generated 설정 cleanup까지 성공했습니다. database 식별자와 인증정보는 로그·문서·PR에 기록하지 않았습니다.
- Preview URL과 `/plan-policy.mjs` readiness 확인이 성공했고, 앱 readiness marker를 기준으로 정적 자산과 hydration 완료를 확인했습니다.
- 이전 Preview Playwright 실패의 외부 폰트 요청 취소와 pricing policy module import 취소를 제거했으며, `today.spec.js`는 앱 hydration 완료 후 상태를 검사하도록 안정화했습니다.
- 최신 PR Preview CI에서 단위 테스트, JavaScript 문법 검사, CI server Playwright, Preview 배포, Preview Playwright가 모두 성공했습니다. 일반 앱·인증 흐름과 Apple 로그인 숨김 상태도 유지됐습니다.
- `PAYMENTS_ENABLED=false`를 유지했습니다. Toss Test/Production key 설정, Sandbox 결제, 환불·갱신·webhook, Production D1과 Production binding은 수행하지 않았습니다.

### Toss Test Key 구성 게이트

- 현재 자동결제 흐름은 SDK v2 `payment().requestBillingAuth()`와 API 개별 연동 키를 사용합니다. 성공 URL은 `/app.html?billing=success`, 실패 URL은 `/app.html?billing=fail`이며 성공 리다이렉트의 `authKey`·`customerKey`는 `/api/billing/activate`로 서버에 전달됩니다.
- 자동결제용 API 개별 연동 Test MID 또는 개발 연동 체험 상점을 선택하고, 그 상점의 같은 세트인 테스트 클라이언트 키와 테스트 시크릿 키를 사용해야 합니다. 결제위젯 키, 다른 MID 키, 테스트·라이브 혼합 조합은 사용하지 않습니다.
- 코드의 구성 게이트는 양쪽 키의 존재·형식·동일 환경을 확인하고 Preview에서는 테스트 키만 허용합니다. `configured`는 키 구성 상태, `enabled`는 여기에 `PAYMENTS_ENABLED=true`가 추가된 상태로 분리합니다. 현재 flags가 false이므로 결제창·빌링키 발급·승인·D1 order 생성·Pro 변경은 차단됩니다.
- Preview Worker Secret `TOSS_CLIENT_KEY`와 `TOSS_SECRET_KEY` 이름이 존재하며 사용자 측에서 동일 테스트 환경·세트임을 확인했습니다. 키 값, MID 전체값, billing key, paymentKey, Secret은 로그·응답·문서에 남기지 않습니다.
- 테스트 결과: 동일 테스트 세트 fixture의 구성 판정, 부분·혼합·Preview 라이브 키 거부, health/config 비노출, 결제 비활성 fetch·원장·Pro 차단이 성공했으며 전체 단위 테스트 108/108과 JavaScript 문법 검사가 통과했습니다.
- Preview 구성 판정은 `configured=true`, `environment=test`, `enabled=false`입니다. `PAYMENTS_ENABLED=false`, `ALLOW_DEMO_BILLING=false`와 Production Worker의 Toss key 미설정을 유지합니다.
- Toss API 호출, D1 billing account/order/event 생성, Pro 권한 변경은 없었고 Sandbox 결제도 수행하지 않았습니다.

## 5. 결제 활성화 선행 조건

다음을 모두 마친 뒤에만 운영의 `PAYMENTS_ENABLED`를 `true`로 변경합니다.

1. Toss Payments 자동결제 계약과 운영 MID 심사를 완료합니다.
2. 월 4,900원 상품과 주문·구독 식별자를 확정합니다.
3. 사업자명, 대표자, 사업자등록번호, 통신판매업 신고번호, 사업장 주소와 대표 연락처를 결제 화면과 법적 페이지에 표시합니다.
4. 정기결제 금액·주기·다음 결제일·해지·환불·청약철회 제한을 결제 전에 고지합니다.
5. 테스트 키로 최초 승인, 응답 유실 복구, 중복 요청, 해지, 갱신 실패와 계정 탈퇴를 검증합니다.
6. 서버가 Toss 승인·조회 응답을 검증한 뒤에만 Pro를 부여함을 확인합니다.
7. 운영 상품 가격, UI 가격, 서버 승인 금액과 이용약관의 가격이 모두 4,900원인지 확인합니다.
8. Free, Trial과 기존 Pro 사용자 마이그레이션을 Preview 사본 데이터로 검증합니다.

키가 등록되어 있어도 `PAYMENTS_ENABLED=false`이면 결제창과 승인 API는 비활성 상태를 유지해야 합니다.

## 6. 갱신, 해지와 실패

결제 활성화 후 목표 흐름은 다음과 같습니다.

- 서버가 `authKey`로 빌링키를 발급하고 월 4,900원을 승인합니다.
- 같은 주문의 응답이 유실되면 새 청구 전에 Toss 주문 조회로 결과를 확인합니다.
- Worker Cron이 결제일이 지난 활성 구독을 갱신합니다.
- 갱신 실패는 같은 주문 정책과 문서화된 재시도 횟수를 따릅니다.
- 사용자가 해지하면 빌링키를 삭제하고 이미 결제한 이용 기간까지 Pro를 유지합니다.
- 결제사 해지를 확인하지 못하면 빌링키나 구독 상태를 임의로 삭제하지 않습니다.
- 영수증·승인 검증 없이 클라이언트 응답만으로 Pro를 부여하지 않습니다.

달력 기준 크레딧을 사용 중인 `PAYMENTS_ENABLED=false` 단계에서는 Pro 월간 크레딧이 결제 주기 기준이라고 안내하지 않습니다. 결제 활성화 시 월간 기간을 실제 구독 기간과 맞추는 전환 계획을 별도로 검증합니다.

## 7. AI 크레딧 마이그레이션

KV는 schema-less이므로 별도 인프라 migration이나 신규 namespace를 만들지 않습니다. `ai-credits-service.mjs`가 사용자를 읽을 때 기존 `user:<id>` JSON의 `aiCredits`를 새 정책으로 정규화하는 schema-on-read 방식을 사용합니다.

- 기존 유효 Pro를 보존합니다.
- 아직 유효한 Trial은 원래 종료 시각까지 인정한 뒤 Free로 전환합니다.
- 만료되거나 불완전한 Trial과 일반 사용자는 Free로 정규화합니다.
- 레거시 localStorage `omwOllieEnergy`를 서버 크레딧으로 환산하지 않습니다.
- 배포 후 첫 정규화 시 새 서버 기간을 시작하고 plan별 크레딧을 한 번 지급합니다.
- 정책 버전과 기간 키를 저장해 반복 지급을 방지합니다.
- 목표·계획·기록·구독과 계정 데이터는 보존합니다.
- 안정화 전 기존 필드를 대량 삭제하지 않습니다.

AI 실패, timeout, 잘못된 응답 또는 서버 오류가 나면 예약한 크레딧을 해제합니다. 같은 사용자와 `requestId`는 한 번만 확정 차감합니다.

## 8. KV 동시성 위험

`ai-credits-service.mjs`는 같은 Worker isolate 안에서 사용자별 작업을 직렬화하고, `requestId`로 동일 요청의 재전송을 멱등 처리합니다. 다만 Cloudflare KV read-modify-write 자체는 원자적 트랜잭션이 아니므로 서로 다른 isolate·리전에서 들어온 두 요청의 동시 차감 경쟁까지 완전히 막지는 못합니다.

운영 잔여 위험:

- 서로 다른 동시 요청의 일시적인 한도 초과 승인
- 마지막 쓰기에 의한 사용량 갱신 유실
- 지역 간 전파 지연으로 오래된 잔액 조회
- 공급자 완료와 예약 만료 사이의 경합

결제 활성화 또는 트래픽 증가 전에 Durable Object나 D1 트랜잭션 원장으로 사용자별 차감을 직렬화하는 방안을 우선 검토합니다. KV 기반 구현을 강한 원자성이 있다고 설명하지 않습니다.

## 9. 계정 탈퇴와 보존

탈퇴 요청이 성공하면 app state, 소셜 identity와 session을 즉시 삭제하고 재로그인 방지용 최소 tombstone만 정책 기간 동안 유지합니다. 한 번만 가능한 Pro 체험은 결정론적 내부 사용자 ID에 연결된 가명 사용 표식을 일반 회원 데이터와 분리해 1년간 유지하여 같은 Provider 재가입의 즉시 재발급을 막습니다. 결제 사용자는 먼저 구독과 빌링키 해지를 확인하고, 법적 보존 의무가 있는 결제 기록에는 빌링키나 불필요한 인증정보를 남기지 않습니다.

결제사 해지 실패 시 회원 정보와 로그인 상태를 보존하고 사용자에게 실패를 안내합니다. 실패한 결제 해지를 성공한 탈퇴로 표시하지 않습니다.

## 10. 롤백

마이그레이션이나 차감 오류가 발생하면 다음 순서로 대응합니다.

1. AI 쓰기와 결제 활성화를 중단합니다.
2. 운영 Worker를 직전 정상 버전으로 되돌립니다.
3. 새 AI 크레딧 상태와 기존 plan·trial·구독 필드를 모두 보존해 대조합니다.
4. 진행 중 예약을 만료·해제하고 OpenAI 요청 기록과 비교합니다.
5. 기존 Pro를 Free로 강등하지 않고 유효 Trial 종료 시각을 보존합니다.
6. 새 크레딧을 레거시 localStorage 에너지로 역변환하지 않습니다.
7. 수정 배포는 정책 버전을 올리고 schema-on-read가 중복 지급되지 않는지 다시 확인합니다.

## 11. 배포 전 수동 확인

1. 설정한 각 소셜 공급자에서 실제 계정 로그인과 callback을 확인합니다.
2. `ADMIN_EMAILS`에 없는 회원이 `/admin.html`과 `/api/admin/users`에서 거부되는지 확인합니다.
3. 두 기기에서 순차 수정, 동시 수정 충돌과 오프라인 후 복귀를 확인합니다.
4. Free, Pro, Trial의 plan·크레딧·초기화 시각을 서버 응답으로 확인합니다.
5. AI 성공, 공급자 실패, timeout과 같은 `requestId` 재전송을 확인합니다.
6. Preview에서 기존 Pro와 유효 Trial을 보존하는 schema-on-read 전환을 확인합니다.
7. 운영에서 `PAYMENTS_ENABLED=false`이고 결제 가능한 것처럼 동작하는 CTA가 없는지 확인합니다.
8. 결제를 활성화할 때만 Toss 테스트·라이브 승인 금액 4,900원과 앱 Pro 상태를 대조합니다.
