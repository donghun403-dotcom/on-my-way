# On My Way 프로젝트 상태

## 기준

- 기준일: 2026-07-16 (KST)
- 판단 기준: 현재 소스와 작업 트리 → 테스트/CI → Git 커밋·PR → 배포 근거 → 기존 문서
- 인증 안정화 변경은 전용 `fix/omw-auth-stabilization` 브랜치와 PR #9에서만 수행하며, 혼합 worktree와 외부 복구 백업은 수정하지 않는다.

## 최신 검증

### OMW-02 최초 정기결제 원장 구현

- 기준 worktree: `feat/omw-toss-billing`, 최신 `origin/main` `6c027bd4b5eae68dcae73875d7f39a4bfee0b8cc` 기준
- `migrations/0001_billing_ledger.sql`과 `billing-ledger.mjs`를 추가했다.
- `BILLING_DB`는 Preview·Production 전용 D1 바인딩 이름으로 확정했으며 실제 database ID는 외부 Cloudflare 작업 전까지 기록하지 않는다.
- 최초 승인 주문은 사용자·customerKey·서버 정책 금액·논리 요청 fingerprint·Toss `Idempotency-Key`·paymentKey를 원장에 연결한다.
- raw billing key는 D1·로그·공개 응답에 저장하지 않고 billing account에는 SHA-256 fingerprint만 저장한다.
- Toss 승인 응답의 완료 상태·금액·orderId·customerKey·paymentKey를 검증한 뒤에만 Pro를 부여한다.
- timeout/결과 불명확 상태는 `unknown`으로 저장하며 기존 주문 조회 전 신규 청구를 만들지 않는다.
- 관련 단위 테스트 49개와 문법 검사가 통과했다. 기존 전체 단위 테스트·Worker 라우팅·AI 크레딧 회귀는 최종 검증에서 다시 실행한다.
- 이번 단계 제외: 갱신 전체 통합, 환불·부분 환불, webhook/reconciliation, Sandbox 실계정 검증, Production 활성화, 결제 UI 변경.
- 현재 `PAYMENTS_ENABLED=false`, `ALLOW_DEMO_BILLING=false` 정책은 유지한다.

### PR #10 Preview CI 실패 조사

- Preview Playwright 실패는 결제 원장이나 D1 초기화가 아니라 배포 직후 `/plan-policy.mjs`가 일시적으로 `404`가 되어 동적 import가 실패한 Preview 정적 자산 전파 지연으로 판정했다.
- CI 서버 Playwright와 배포 단계는 성공했고, 시간이 지난 뒤 Preview의 `/app.html`, `/plan-policy.mjs`, `/api/auth/providers`, `/api/health` 응답은 정상화됐다.
- 실패 job은 1회 재실행했으나 같은 pricing policy 동적 import 실패가 재현되어 무한 재실행하지 않았다.
- Preview Playwright 전에 `/plan-policy.mjs`가 `200`이 될 때까지 제한적으로 대기하는 workflow 보호 단계를 추가했다.
- `BILLING_CUSTOMER_MISMATCH`의 깨진 소스 문구를 정상 UTF-8 문구로 복구하고, 불일치 시 Pro를 부여하지 않는 결제 테스트를 추가했다.
- 이번 조사에서도 D1 생성, `BILLING_DB` 연결, Toss Secret 설정, 결제 활성화는 수행하지 않았다.

### Preview 결제 원장 인프라

- Preview 전용 D1 `on-my-way-billing-preview`를 APAC 위치로 생성했다.
- `migrations/0001_billing_ledger.sql`을 원격 적용하고 billing 테이블·index·제약조건을 확인했다.
- PR Preview workflow가 Repository Secret의 Preview D1 식별자를 일반 Actions 단계에서만 읽어 임시 generated Wrangler 설정에 `BILLING_DB`를 연결하도록 했다. 식별자는 로그·PR·문서·정적 assets에 노출하지 않는다.
- `smoke_test_` 가짜 데이터로 계정 격리, 멱등 주문, 상태 전이, event 원장을 검증했다. PASS 후 테스트 데이터는 모두 정리됐다.
- `PAYMENTS_ENABLED=false`를 유지했으며 Preview Toss Test Key 구성만 완료했다. Sandbox 결제, Production D1, Production binding과 Production key 설정은 수행하지 않았다.

### PR #10 최신 Preview 검증 결과

- Preview D1 생성, migration 적용, 원장 smoke test와 테스트 데이터 cleanup은 완료된 상태를 재사용했다. 이번 검증에서 D1을 재생성하거나 migration을 재적용하지 않았다.
- Repository Secret의 Preview D1 식별자를 독립적인 Actions 단계에서 generated Wrangler 설정에 주입했고, `BILLING_DB` binding을 포함한 Preview Worker 배포와 generated 설정 cleanup이 성공했다.
- Preview 정적 자산 readiness와 `/plan-policy.mjs` 응답 확인이 성공했으며, `PAYMENTS_ENABLED=false`에서 일반 앱·인증 흐름과 결제 비활성 경로가 정상 동작했다.
- 이전 Preview Playwright 실패는 외부 폰트 요청 취소, pricing policy module import 취소, 앱 hydration 완료 전 상태를 읽은 테스트 타이밍 문제로 분류했다. 외부 폰트 의존성을 제거하고 pricing policy를 lazy singleton import로 전환했으며, 앱 readiness marker와 hydration 대기를 추가했다.
- 최신 PR Preview CI에서 단위 테스트, JavaScript 문법 검사, CI server Playwright, Preview 배포·URL 확인, Preview Playwright가 모두 성공했다. 브라우저 콘솔 오류와 인증 회귀도 재현되지 않았다.
- Preview Toss Test Key Secret 이름 등록과 동일 테스트 환경 구성 확인을 완료했다. Sandbox 결제, Production key, Production D1·Production binding·결제 활성화는 수행하지 않았다.

### Toss Test Key 구성 게이트

- 현재 자동결제 코드는 Toss Payments SDK v2의 `payment().requestBillingAuth()`와 API 개별 연동 키 쌍을 기준으로 한다. 성공·실패 URL은 `/app.html?billing=success`와 `/app.html?billing=fail`이며, 성공 리다이렉트의 `authKey`·`customerKey`는 서버의 `/api/billing/activate`에서만 처리한다.
- `TOSS_CLIENT_KEY`와 `TOSS_SECRET_KEY`는 각각 `test_ck_...`·`test_sk_...` 또는 `live_ck_...`·`live_sk_...`의 동일 환경·동일 세트여야 한다. Preview에서는 라이브 키를 거부하고, 테스트/라이브 혼용도 거부한다.
- 키 구성과 결제 활성화는 분리했다. 양쪽 테스트 키가 있으면 config 응답은 `configured=true`, `environment=test`를 공개하지만 `PAYMENTS_ENABLED=false`이면 `enabled=false`이고 클라이언트 키·시크릿 키는 공개하지 않는다. health 응답의 결제 상태도 유효한 동일 세트와 활성화 스위치를 함께 통과해야 true가 된다.
- 결제 비활성 테스트에서 Toss fetch 0회, billing account/order 0건, Pro 권한 변경 없음과 키 비노출을 확인했다. 전체 단위 테스트 108/108 및 JavaScript 문법 검사가 통과했다.
- Preview Worker Secret `TOSS_CLIENT_KEY`와 `TOSS_SECRET_KEY` 이름이 존재하고 사용자 측에서 동일 테스트 환경·세트임을 확인했다. 실제 키·MID는 저장소·PR·문서·Codex 대화에 기록하지 않는다.
- Preview 구성 판정은 `configured=true`, `environment=test`, `enabled=false`이며 `PAYMENTS_ENABLED=false`, `ALLOW_DEMO_BILLING=false`를 유지한다. Production Worker에는 Toss key가 없다.
- Toss API 호출, D1 billing account/order/event 생성, Pro 권한 변경은 발생하지 않았다. Sandbox 결제는 수행하지 않았다.

- PR #7은 `d09e508d8a1f34e7af52adda5645eb5b40a3bc68`로 `main`에 병합되었다.
- Preview 정적 자산 수정 PR의 최종 CI에서 단위 테스트, JavaScript 문법 검사, CI 서버 Playwright, Preview 배포와 URL 확인, Preview Playwright가 모두 성공했다.
- Preview의 `/plan-policy.mjs`는 `200 OK`와 JavaScript MIME을 반환하며, 존재하지 않는 `.mjs`, `.js`, `.css` 요청은 HTML fallback 없이 `404`를 반환한다.
- Preview Playwright에서 flaky retry가 관찰되었으므로 출시 준비 단계에서 불안정 테스트 여부를 별도로 추적한다.

## 출시 전략

- 1차 출시 대상은 Android이며, iOS 출시는 Android 사용자 반응을 확인한 뒤 별도 단계로 진행한다.
- Apple 로그인 제품 구현과 자동 테스트는 보존 완료 상태다. Apple Developer 외부 설정과 실제 계정 검증은 iOS 출시 단계로 계획적으로 연기한다.
- Android 1차 출시와 현재 Production·Preview 배포 설정에서는 `APPLE_LOGIN_VISIBLE=false`를 명시해 Apple 로그인 버튼과 시작 API를 비활성화한다. Apple Secret 유무와 관계없이 기본값은 false다.
- `/api/auth/providers`는 Apple의 `configured`와 `visible`을 분리해 반환하며, Android UI는 `visible:false`를 존중해 버튼·빈 공간·키보드 및 스크린리더 접근 대상을 남기지 않는다.
- iOS 출시 전에는 기능 플래그를 true로 전환하고 Apple Developer 설정·Cloudflare Secret·실제 Apple 계정 검증을 별도로 완료해야 한다.
- Apple 상태: 구현 완료 / 자동 테스트 완료 / Android 노출 비활성 / Apple Developer 설정 연기 / 실제 Apple 로그인 연기 / iOS 출시 차단 항목 해당 / Android 출시 차단 항목 아님.

## 인증 안정화 자동 검증

- Preview 정적 자산 수정을 담은 PR #8은 `9bb20959f7d8107885a6ec8fc7427c5cb11263c7`로 `main`에 병합되었으며, 인증 안정화 작업은 이 커밋에서 분리한 `fix/omw-auth-stabilization` 브랜치와 전용 worktree에서 수행한다.
- 백업된 인증 제품 코드 후보는 최신 `main`에 이미 같거나 더 강한 형태로 반영되어 있어 다시 적용하지 않았다. 대신 Preview·Production 동일 Origin 허용, 서버 세션 사용자 기준 AI 요청 제한, 로그아웃 후 계정 데이터 차단과 동일 계정 재로그인 복원을 명시적으로 고정하는 회귀 테스트만 보완했다.
- JavaScript 문법 검사와 전체 단위 테스트, 데스크톱 Chromium의 계정 격리·로그아웃·재로그인·탈퇴 E2E가 성공했다. 지원 브라우저별 인증 회귀에서는 태블릿 Chromium의 페이지 전환 중 `script.js` 요청 취소가 한 번 관찰됐고 해당 테스트 재실행은 성공했다. Apple 변경 head의 단위 테스트, 문법 검사, CI 서버 Playwright, Preview 배포·URL 확인과 Preview Playwright도 모두 성공했다.
- PR #9 Preview에서 Google·Kakao·Naver의 실제 로그인, callback 복귀, 회원 UI, 세션 유지, 로그아웃, 동일 계정 복원, Provider 간 데이터 격리, 로그인 취소·거부, 앱 내부 탈퇴, 기존 세션 무효화와 삭제 대기 재로그인 차단을 확인했다.
- Android 출시용 실제 인증 검증은 완료됐다. Apple 실제 Provider 검증은 실패가 아니라 iOS 출시 단계로 연기했다.

## 인증 화면 복귀 정책

- OAuth 로그인을 취소하면 랜딩 페이지로 강제 이동하지 않고 사용자가 원래 보던 앱 화면으로 복귀할 수 있으며, 비로그인 상태를 유지하는 것이 정상 동작이다.
- 로그아웃 후에도 랜딩 페이지로 강제 이동하지 않고 앱 화면에 남을 수 있다. 비회원 사용이 가능하므로 화면 위치가 아니라 서버 세션 폐기, 보호 API 거부, 회원 데이터 비노출과 익명 저장 범위 전환을 성공 기준으로 삼는다.
- 이 정책을 위해 새로운 화면 이동이나 redirect 코드를 추가하지 않는다.

## Google 실제 Preview 인증 검증

- 검증일: 2026-07-16 (KST)
- PR #9 Preview에서 신규 Google 로그인과 회원 생성, 앱 복귀와 회원 UI 표시, 새로고침 후 세션 유지가 성공했다.
- 로그아웃 후 회원 데이터 비노출, 동일 Google 계정 재로그인 후 데이터 복원, 서로 다른 Google 계정 간 데이터 격리가 성공했다.
- 계정 탈퇴, 탈퇴 후 기존 세션 무효화, 삭제 대기 계정 재로그인 정책을 확인했다.
- 로그인 취소 후 오류나 무한 로딩 없이 원래 앱 화면으로 복귀하고 비로그인 상태가 유지됨을 확인했다.
- 검증 기록에는 Secret, 이메일 주소, 사용자 ID, 토큰을 포함하지 않는다.
- Kakao와 Naver를 포함한 Android 출시 대상 Provider의 필수 실제 인증 시나리오를 모두 확인했다.
- Apple 실제 검증은 iOS 출시 단계로 계획적으로 연기하며 Android 인증 완료 조건에는 포함하지 않는다.

## Kakao 실제 Preview 인증 검증

- 검증일: 2026-07-16 (KST)
- PR #9 Preview의 `/api/auth/providers`에서 Kakao가 설정된 상태로 동작함을 확인했다.
- 카카오 로그인 화면 진입, 실제 카카오 계정 인증, OAuth callback을 통한 Preview 앱 복귀와 회원 로그인 상태 표시가 성공했다.
- 새로고침 후 세션 유지, 로그아웃 후 비로그인 전환과 회원 데이터 비노출, 동일 Kakao 계정 재로그인과 데이터 복원, Google 계정과의 데이터 격리를 확인했다.
- 로그인 취소 후 오류나 무한 로딩 없이 원래 앱 화면으로 복귀함을 확인했다.
- 앱 내부 계정 탈퇴, 기존 세션 무효화와 삭제 대기 중 재로그인 차단 정책을 확인했다.
- Kakao 외부 unlink API는 Android 1차 출시 후 정책 과제로 유지한다. 앱 내부 계정 삭제·세션 폐기·데이터 삭제는 검증 완료됐다.
- 검증 기록에는 Secret, 이메일 주소, 사용자 ID, access token을 포함하지 않는다.
- Apple 실제 Provider 검증은 iOS 출시 단계로 연기했다.

## Naver 실제 Preview 인증 검증

- 검증일: 2026-07-16 (KST)
- PR #9 Preview의 `/api/auth/providers`에서 Google·Kakao·Naver가 모두 설정된 상태로 동작함을 확인했다.
- 신규 Naver 로그인, OAuth callback을 통한 앱 복귀, 회원 UI 표시와 새로고침 후 세션 유지가 성공했다.
- 로그아웃 후 회원 데이터 비노출, 동일 Naver 계정 재로그인과 기존 데이터 복원이 성공했다.
- Google·Kakao·Naver 계정 간 데이터 격리가 성공했다.
- 로그인 취소·거부 후 오류나 무한 로딩 없이 원래 앱 화면으로 복귀함을 확인했다.
- 앱 내부 계정 탈퇴, 탈퇴 후 기존 세션 무효화와 삭제 대기 중 재로그인 차단 정책을 확인했다.
- Naver 외부 연결 해제 API는 Android 1차 출시 후 정책 과제로 유지한다. 앱 내부 계정 삭제·세션 폐기·데이터 삭제는 검증 완료됐다.
- 검증 기록에는 Secret, 이메일 주소, 사용자 ID, access token을 포함하지 않는다.
- Apple 실제 Provider 검증은 iOS 출시 단계로 연기했다.

## Apple 구현 및 자동 검증

- 현재 구현은 Apple authorize `https://appleid.apple.com/auth/authorize`, token `https://appleid.apple.com/auth/token`, callback `/api/auth/callback/apple`을 사용한다. Preview callback은 `https://on-my-way-pr-9.jungslawyer.workers.dev/api/auth/callback/apple`, Production callback은 `https://onmyway.olivenrich.com/api/auth/callback/apple`이다.
- 인가 요청은 일회용 `state`와 `nonce`, `response_type=code`, `response_mode=form_post`, 최소 scope `name email`을 사용한다. callback은 state cookie와 서버 transaction을 대조하고, Apple ID token의 서명·issuer·audience·만료·nonce를 검증한 뒤 이메일이 아닌 `sub`를 Provider 고유 ID로 저장한다.
- 서버는 `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`가 모두 있을 때만 Apple을 configured로 표시한다. 정적 `APPLE_CLIENT_SECRET`은 사용하지 않고 private key로 짧은 수명의 client secret을 서버에서 생성한다.
- Apple token 응답의 refresh token을 서버 계정에만 보관하고 공개 사용자 응답에서는 제외한다. 계정 탈퇴는 Apple revoke endpoint에서 연결 해제가 확인된 뒤에만 내부 identity와 session을 삭제하도록 보완했다.
- 자동 테스트는 Provider 설정 조건, Preview authorize URL과 callback, state 불일치, 로그인 취소, client secret 요청, ID token 검증, 이메일 없는 `sub` 기반 가입·재로그인, 최초 이름·private relay 유지, refresh token 비노출, revoke 실패 시 탈퇴 중단과 성공 시 세션·identity 삭제를 확인한다.
- `APPLE_LOGIN_VISIBLE`은 기본값과 Preview·Production 설정 모두 false다. false이면 Secret이 있어도 UI를 숨기고 로그인 시작 API는 `PROVIDER_DEFERRED`로 거부하며, true일 때만 기존 Apple 구현을 노출할 수 있다.
- Apple Developer 설정과 Cloudflare Secret은 입력하지 않으며, 실제 Apple 계정 로그인·세션·격리·탈퇴·취소 검증은 iOS 출시 단계로 연기한다.
- 문서와 PR에는 Secret, 이메일 주소, 사용자 ID, token 값을 기록하지 않는다.

## 현재 저장소

- 현재 브랜치: `codex/detailed-plan-editor`
- 현재 HEAD: `6bb5b27` `Align account UI with final pricing policy`
- 추적 원격: `origin/codex/detailed-plan-editor` (`ff33b5d`), 로컬 HEAD가 1커밋 앞서고 22커밋 뒤처짐
- `origin/main`: `6245a77` `Implement Free/Pro pricing and AI credit policy (#5)`
- 현재 브랜치는 `origin/main`의 `6245a77`을 포함하지 않는다. 비교 결과 `origin/main` 고유 2커밋, 현재 HEAD 고유 23커밋이다.
- 로컬 `main`: `825321f`, `origin/main`보다 2커밋 뒤처짐
- 현재 혼합 worktree의 미커밋 변경은 2026-07-16에 생성한 저장소 외부 복구 백업에 패치·manifest·변경 분류·검증 보고서로 보존했다. 정확한 로컬 경로는 저장소에 기록하지 않으며, 원본 worktree의 변경은 그대로 유지한다.

### 커밋되지 않은 변경

추적 파일 변경:

`.assetsignore`, `app.html`, `auth-service.test.mjs`, `script.js`, `styles.css`, `tests/e2e/storage-recovery.spec.js`, `tmp/dev-funnel.json`, `worker.mjs`, `wrangler.jsonc`

추적되지 않은 파일·디렉터리:

`.codex-artifacts/`, `.wrangler/preview-dry-run/`, `docs/pr-preview-manual-qa.md`, `outputs/`, `wrangler.preview.jsonc`

변경 내용은 계정별 로컬 저장소 격리, AI API 인증·보안 헤더, 모바일 이미지·스크롤 동작, 정적 자산 제외 규칙, Preview 설정과 관련되어 있다. 서로 다른 단계의 변경이 한 작업 트리에 섞여 있으므로 현재 상태를 완료로 판정하거나 배포 대상으로 사용하지 않는다.

## PR 및 브랜치

### 열린 PR

- PR #6 — `codex/detailed-plan-editor` → `main`, Draft, HEAD `ff33b5d`, 44커밋. PR 설명에는 단위 테스트 52건과 모달 회귀 6건이 기록되어 있으나, 현재 HEAD의 GitHub status와 workflow 조회는 비어 있고 Preview 결과 댓글도 없다.
- PR #6 전체 병합은 권장하지 않는다. 최신 `origin/main`과 충돌·중복되는 결제·배포·오래된 구현이 섞여 있으므로 인증·UX·출시 준비 변경을 단계별로 분리 검토한다.

### 병합된 PR

- PR #5 — `codex/pricing-credits-policy` → `main`, 2026-07-15 병합, 병합 커밋 `6245a77`. Free/Pro 가격·크레딧 정책과 결제 비활성 상태를 포함한다.
- PR #3 — `codex/detailed-plan-editor` → `main`, 2026-07-15 병합, 병합 커밋 `d45d99e`. 배포 경로·계정 동기화·법정 페이지·AI/결제 운영 경계를 포함한다.
- PR #2 — `agent/mori-problem-section` → `main`, 2026-07-12 병합, 병합 커밋 `295f167`. Ollie 브랜딩·소셜 로그인·체험·기본 결제·관리자 흐름을 포함한다.

GitHub PR 전체 조회 결과는 열린 1개와 병합된 3개이며, 별도의 닫힌 미병합 PR은 확인되지 않았다.

### 조사한 브랜치

- 로컬 브랜치 5개: `main`, `codex/detailed-plan-editor`, `agent/mori-problem-section`, `claude/clever-williams-65a954`, `claude/interesting-mendeleev-9976f0`
- 원격 추적 브랜치: `origin/main`, `origin/codex/detailed-plan-editor`, `origin/agent/mori-problem-section`, `origin/cloudflare/workers-autoconfig`

## Worktree 현황

1. 현재 작업 트리 — `codex/detailed-plan-editor`, `6bb5b27`, 미커밋 변경 있음
2. `.claude/worktrees/clever-williams-65a954` — detached HEAD `f0afb59`, `Exclude private files from deployed static assets`
3. `.claude/worktrees/interesting-mendeleev-9976f0` — detached HEAD `633238d`, `Exclude server-only modules from deployed static assets`

두 Claude worktree의 커밋은 현재 브랜치와 `origin/main`의 조상으로 확인되며, 별도 PR은 조회되지 않았다.

## 단계별 작업 상태

| ID | 단계 | 작업 항목 | 상태 | 확인 근거 | 관련 파일·PR | 다음 조치 |
| -- | -- | ----- | -- | ----- | -------- | ----- |
| A1 | 1단계 — 인증 안정화 | Kakao·Naver·Google 가입/로그인, 세션 유지, 로그아웃 | 완료 | PR #9 Preview에서 세 Provider의 실제 로그인·callback·세션 유지·로그아웃·재로그인·Provider 간 격리·취소 처리를 확인했다. | `auth-service.mjs`, `auth-service.test.mjs`, PR #9 | PR #9 최종 자동 검증과 병합 |
| A2 | 1단계 — 인증 안정화 | Apple 로그인 | iOS 단계로 연기 | Apple authorize/token/callback, state·nonce, 동적 client secret, ID token 검증, `sub` 기반 계정과 탈퇴 전 token revoke 구현·자동 테스트를 보존했다. Android·현재 Production은 명시적 기본 false 플래그로 숨긴다. | `auth-service.mjs`, `apple-auth.test.mjs`, `app.html`, `script.js`, `wrangler*.jsonc`, PR #9 | iOS 출시 브랜치에서 플래그 활성화·외부 설정·실계정 검증 |
| A3 | 1단계 — 인증 안정화 | 계정 격리, 탈퇴, 재로그인 정책, 인증 실패 처리와 테스트 | 완료 | 세 Provider의 실제 계정 데이터 격리, 앱 내부 탈퇴, 기존 세션 무효화, 삭제 대기 재로그인 차단과 자동 회귀 테스트를 확인했다. | `auth-service.mjs`, `worker.mjs`, `auth-service.test.mjs`, `apple-auth.test.mjs`, `tests/e2e/storage-recovery.spec.js`, PR #9 | PR #9 최종 자동 검증과 병합 |
| B1 | 2단계 — 결제·구독 | Pricing, 무료 체험, Pro 권한, AI 크레딧 정책 | 진행 중 | PR #5가 `origin/main`에 병합되었고 PR 설명에 85/85 단위·34/34 문법·브라우저 회귀 근거가 있으나 독립적인 최신 CI/Preview status는 없음 | PR #5, `index.html`, `app.html`, `auth-service.mjs` | 병합된 `main` 기준 정책과 현재 PR #6의 중복 범위 비교 |
| B2 | 2단계 — 결제·구독 | 결제 성공·실패, webhook, 환불, 해지·갱신, 중복 결제 방지 | 차단 | 코드에 Toss billing·해지·갱신 경로는 있으나 `PAYMENTS_ENABLED=false`이고 Toss 승인·sandbox 실패/환불·webhook·실결제 검증 근거가 없음 | `auth-service.mjs`, `worker.mjs`, PR #5 | 외부 결제 콘솔·sandbox 검증 전에는 결제 활성화나 재구현을 하지 않음 |
| C1 | 3단계 — 모바일 UX | 오늘·계획·올리·기록 탭과 주요 실행 흐름 | 진행 중 | `app.html`과 `script.js`에 탭·계획·기록·올리 흐름 및 E2E가 존재하고, 현재 작업 트리에 모바일 이미지·스크롤 관련 변경이 미커밋 상태임 | `app.html`, `script.js`, `styles.css`, `tests/e2e/*`, PR #3/#6 | 최신 기준으로 최소 모바일 회귀 범위만 확인 |
| C2 | 3단계 — 모바일 UX | 반응형·접근성·로딩/빈 상태/오류 상태·실기기 UX 검증 | 미확인 | Playwright 회귀 근거는 있으나 기존 Preview 수동 QA 문서의 항목은 모두 `미검증`이며 실제 iPhone/Galaxy/iPad 검증 결과가 없음 | `docs/pr-preview-manual-qa.md`, `tests/e2e/responsive.spec.js`, PR #3 댓글 | 실기기 수동 QA 한 번만 수행하고 결과를 기록 |
| D1 | 4단계 — 출시 준비 | 개인정보처리방침·이용약관·고객지원·계정 탈퇴 라우트 구현 | 완료 | PR #3 검증 댓글에 양 도메인의 `/privacy`, `/terms`, `/support`, `/delete-account` 200 응답과 Preview/Production 회귀 결과가 기록됨 | `privacy.html`, `terms.html`, `support.html`, `delete-account.html`, PR #3 | 법무·사업자 문구의 최종 수동 승인만 별도 확인 |
| D2 | 4단계 — 출시 준비 | 도메인·HTTPS·Preview/Production 배포 경로와 운영 health 검증 | 진행 중 | `origin/main`에 Preview/Production workflow와 production Wrangler 설정이 존재하고, PR #3의 과거 production 성공·도메인 200 근거는 있으나 PR #5 병합 이후 최신 배포 증거는 없음 | `.github/workflows/*`, `wrangler*.jsonc`, PR #3/#6 | `origin/main` 최신 커밋의 CI·Preview·Production 결과를 한 번에 확인 |
| D3 | 4단계 — 출시 준비 | 환경변수 분리, 보안 헤더, 전체 회귀 CI, 앱 아이콘·스토어 자료·롤백 절차 | 진행 중 | 환경변수 이름과 보안 헤더 구현 일부는 존재하지만 현재 보안 헤더 변경·Preview 설정은 미커밋이고, 관련 status 조회가 비어 있음. 스토어 자료·롤백 실행 기록은 확인하지 못함 | `worker.mjs`, `wrangler*.jsonc`, `.assetsignore`, PR #6 | 출시 체크리스트에서 코드 근거와 외부 운영 근거를 분리 |

### 1단계 완료 조건

Android 1차 출시 대상인 Google·Kakao·Naver의 실제 가입·callback·재로그인·세션 유지·로그아웃을 검증하고, 계정 격리·앱 내부 탈퇴·세션 무효화·삭제 대기 재로그인 정책과 로그인 취소를 실제 Preview에서 확인하며 관련 CI가 최신 기준으로 통과해야 한다.

필요한 Android 수동 검증은 PR #9 Preview에서 완료했다. Kakao unlink와 Naver 외부 연결 해제 API는 Android 1차 출시 후속 정책으로 추적하며, 앱 내부 탈퇴·세션 폐기·데이터 삭제는 검증 완료됐다.

다시 수행하면 안 되는 중복 작업: PR #2/#3에 이미 병합된 기본 소셜 로그인·세션·관리자 흐름을 새 브랜치에서 다시 구현하지 않는다. 현재 미커밋 저장소 격리 변경을 별도 계정 격리 구현으로 중복 작성하지 않는다.

### 2단계 완료 조건

가격·체험·Pro 권한·크레딧 원장의 서버 권위 동작을 최신 `main`에서 검증하고, Toss sandbox의 성공·실패·취소·갱신·환불·중복 요청과 탈퇴 연계를 확인한 뒤에만 결제 활성화를 검토한다.

필요한 수동 검증: 결제수단 없는 체험, sandbox 승인/실패/취소, webhook 재전송, 갱신 실패, 환불·해지·탈퇴, 동시 요청 멱등성.

다시 수행하면 안 되는 중복 작업: PR #5의 가격·무료 체험·크레딧 정책을 PR #6 또는 새 브랜치에서 다시 만들지 않는다. 결제 외부 설정을 코드 우회로 대체하지 않는다.

### 3단계 완료 조건

오늘·계획·올리·기록의 핵심 흐름이 지원 viewport에서 접근 가능하고, 로딩·빈 상태·오류·백그라운드 복귀와 화면 회전이 안정적이며 실기기 QA 결과가 남아야 한다.

필요한 수동 검증: iPhone Safari, Galaxy Chrome, iPad Safari, 소형 화면, 키보드·safe area·주소창 변화·홈 화면 추가.

다시 수행하면 안 되는 중복 작업: PR #3/#6과 기존 E2E에 있는 모바일 탭·반응형 회귀를 새 테스트 묶음으로 복제하지 않는다. 미커밋 이미지 preload·스크롤 변경을 검증 전 기능 완료로 간주하지 않는다.

### 4단계 완료 조건

법정·지원 문구 승인, 운영 도메인 HTTPS, 최신 `main`의 CI·Preview·Production 검증, 환경변수·Secret·보안 점검, 회귀 테스트, 아이콘·스토어 자료와 롤백 절차가 모두 확인되어야 한다.

필요한 수동 검증: 법무·사업자 표시, 실제 도메인·health 응답, 운영 Secret/KV/AI 연결, 배포 후 핵심 라우트, 롤백 리허설, 스토어용 화면·설명.

다시 수행하면 안 되는 중복 작업: PR #3에서 이미 검증한 배포 workflow·SPA 라우팅·법정 라우트를 다시 만들지 않는다. `claude/clever-williams-65a954`와 `claude/interesting-mendeleev-9976f0`의 정적 자산 제외 작업을 재실행하거나 새 worktree로 복제하지 않는다.

## 출시 차단 항목

1. Android 인증 수동 게이트는 PR #9 Preview에서 완료됐다. PR #9의 최신 자동 검증과 최종 diff 검토·병합만 남아 있다.
2. Apple 구현·자동 테스트는 보존했고 Android에서는 숨겼다. Apple Developer 설정과 실계정 검증은 Android 차단이 아니라 iOS 출시 차단 항목이다.
3. 결제는 `PAYMENTS_ENABLED=false`이며 Toss sandbox/live 승인·실패·webhook·환불·중복 결제·탈퇴 연계 검증이 남아 있다.
4. PR #6 현재 HEAD와 `origin/main` 최신 커밋에 대해 GitHub status/workflow 조회가 비어 있어 최신 CI·Preview 결과를 완료 근거로 삼을 수 없다.
5. PR #5 병합 이후의 Production 배포 상태와 최신 Preview URL을 확인할 근거가 없다.
6. 실기기 모바일 QA, 법무·사업자 문구 최종 승인, 운영 Secret/KV/AI 상태, SPF/DKIM/DMARC, 스토어 자료와 롤백 기록이 없다.

## 미확인 항목

- iOS 출시 단계의 Apple Developer Services ID·도메인·return URL·private key 설정과 Cloudflare Secret
- iOS 출시 단계의 Apple 실제 callback·세션·계정 격리·탈퇴 token revoke 결과
- 운영 Provider callback과 실제 계정 데이터 격리
- Cloudflare Production의 현재 배포 커밋·health·Secret/KV 상태
- PR #6의 Preview 생성 여부와 최신 Preview 회귀 결과
- 결제 webhook·환불·갱신 실패·동시 요청의 실제 sandbox 결과
- iPhone Safari·Galaxy Chrome·iPad Safari·소형 Android 실기기 결과
- SPF, DKIM, DMARC 및 고객지원 운영 채널
- 앱 아이콘·스토어 스크린샷·설명·심사 자료·롤백 리허설

## 중복 또는 폐기 후보 작업

- `agent/mori-problem-section`: PR #2가 병합되었고 `543b02e`가 `origin/main`의 조상이다. 새 기능 작업 대상으로 취급하지 않는다.
- `claude/clever-williams-65a954` worktree와 `f0afb59`, `claude/interesting-mendeleev-9976f0` worktree와 `633238d`: 두 커밋 모두 현재 브랜치와 `origin/main`의 조상이며 별도 PR이 없어 폐기 후보다. 삭제는 하지 않는다.
- `docs/pr-preview-manual-qa.md`: Draft PR #3을 대상으로 한 미검증 문서라 병합된 PR의 완료 근거로 재사용하지 않는다. 필요하면 최신 Preview 기준으로 한 번만 갱신한다.
- PR #6의 44커밋은 `origin/main` 최신 2커밋을 포함하지 않는다. 동일 내용을 새 브랜치에서 복제하지 말고, 먼저 최신 `main`과의 차이를 검토한다.

## 권장 병합 순서

1. 기준선을 병합된 `origin/main` `6245a77`로 고정하고, 현재 미커밋 변경과 PR #6의 차이를 단계별로 분리한다.
2. PR #6에서 필요한 인증·보안·UX 변경만 최신 `main` 기준으로 재검토하고, 중복·오래된 배포/가격 변경은 제외한다.
3. 인증 안정화의 실제 Provider·계정 정책 검증을 완료한다.
4. 결제는 외부 sandbox 검증과 운영 승인 전까지 비활성으로 유지한다.
5. 모바일 실기기 QA와 출시 준비 체크를 완료한 뒤 최신 `main`에서 Preview → Production 순서로 검증한다.

## 다음에 수행할 단일 작업

PR #9 최신 head의 자동 검증과 diff·리뷰·충돌 상태를 최종 확인한 뒤 조건이 충족되면 Squash merge한다. 인증 병합 후 결제·구독 단계는 최신 `main`의 별도 worktree와 브랜치에서 시작한다.

## 다시 수행하면 안 되는 작업

- PR #2/#3/#5에 이미 병합된 소셜 로그인, 배포 경계, SPA 라우팅, 가격·체험·크레딧 정책을 근거 없이 재구현하지 않는다.
- 최신 `main`을 포함하지 않은 PR #6을 기준으로 새 기능이나 새 브랜치를 계속 쌓지 않는다.
- 현재 상태에서 결제 활성화, Production 재배포, 브랜치 병합·삭제, worktree 삭제를 하지 않는다.
- 실제 Secret·토큰·비밀번호를 코드·로그·문서에 기록하지 않는다.
- 문서 정리 이후에는 위의 단일 다음 작업을 자동으로 시작하지 않는다.

## PR #10 Preview auth/bootstrap stabilization

- Preview initial auth and pricing bootstrap now expose settled state markers, retry one transient browser/network failure, and apply successful results only while the document remains active.
- Navigation-triggered cancellation was reproduced from Playwright diagnostics and separated from real HTTP, MIME, or module errors.
- Preview readiness now requires `/app.html`, `/script.js`, `/plan-policy.mjs`, `/api/health`, and `/api/auth/providers` to return HTTP 200 with the expected content types in two consecutive checks.
- CI server Playwright and Cloudflare Preview Playwright passed after the stabilization. `PAYMENTS_ENABLED=false` remains the repository default. A later Staging-only Toss Sandbox validation completed without enabling Production payments.

## PR #10 final merge readiness (2026-07-19)

- Merged the latest `origin/main` into `feat/omw-toss-billing` without conflicts. The canonical Production workflow and `wrangler.production.jsonc` remain identical to `main`, including `APP_ENV=production`, `PAYMENTS_ENABLED=false`, rollback guards, and external overwrite monitoring.
- The merged result passed all 126 unit tests, JavaScript syntax checks, 137 Chromium project tests, 29 iPhone WebKit core tests, and one full 180-test local Playwright run. The latest-head PR Preview workflow also passed its server Playwright, Preview deploy, readiness, external Preview Playwright, and cleanup stages.
- Staging Toss Sandbox validation confirmed a `DONE` `BILLING` payment for 4,900 KRW, D1 success records, Pro activation, and read-only reconciliation without an additional charge. Staging was restored to `PAYMENTS_ENABLED=false` afterward.
- Production was checked three times through the custom domain and remained `environment=production`, `payments=false`, with account storage, AI, and Google configured; Apple and developer login remained disabled.
- PR #10 remains Draft and Open. Draft removal, merge, Production deployment, Production payment activation, Secret changes, and temporary payment-workflow cleanup were not performed in this step.

## Isolated Staging deployment boundary

- Added `wrangler.staging.jsonc` for the fixed Worker name `on-my-way-staging`. It uses `APP_ENV=staging`, `APPLE_LOGIN_VISIBLE=false`, `ALLOW_DEV_LOGIN=false`, `ALLOW_DEMO_BILLING=false`, and `PAYMENTS_ENABLED=false` by default.
- Added `.github/workflows/staging-deploy.yml`, which runs only by `workflow_dispatch`, generates a temporary config from Staging-only KV/D1 IDs, applies the Staging migration and verifies `billing_accounts`, `billing_orders`, and `billing_events` before deploying the separate Worker, verifies the staging health/provider/static routes, and removes generated files.
- Production `on-my-way`, `onmyway.olivenrich.com`, its OAuth configuration, KV, and `PAYMENTS_ENABLED=false` remain unchanged. PR Preview remains PR-number-scoped and payment-disabled.
- Added `docs/deployment-environments.md` with the fixed workers.dev route boundary, Staging Worker secret names, Google callback template, and external setup order. No Cloudflare KV/D1, Secret, DNS, OAuth callback, or Toss configuration was created in this step.
- ACTION REQUIRED: create Staging-only KV/D1, set protected Staging GitHub IDs, register the Staging Google callback, and set Staging Worker secrets before the manual workflow or any Staging OAuth/Sandbox validation. The workflow applies the billing migration after the D1 is created and stops before Worker deploy if migration or schema verification fails.

## Free/Pro 무료 체험 표시와 결제 전환

- 사용자에게 노출하는 요금제는 Free와 Pro 두 개로 유지하고, 내부 `plan=trial`은 Free 회원의 `무료 체험 중` 상태로만 표시합니다. 체험을 별도 Pro 상품처럼 보이게 하던 문구와 가격표 표기를 제거했습니다.
- Free 회원은 체험 가능 시 `24시간 무료 체험 시작`, 체험 중에는 결제 활성 상태에 따라 `지금 Pro로 전환하기` 또는 비활성 `Pro 결제 준비 중`, 유료 Pro는 비활성 `현재 이용 중` CTA를 봅니다. 체험 중 CTA는 무료 체험을 다시 시작하지 않습니다.
- 체험 중 최초 결제가 성공하면 Toss 승인 시각을 `trialEndedAt`과 Pro 시작 시각으로 기록하고, 다음 결제일을 승인일 기준 한 달 뒤로 계산합니다. 실패한 승인 검증과 결제창 취소는 기존 체험 종료 시각을 바꾸거나 유료 Pro 권한을 부여하지 않습니다.
- 전체 단위 테스트와 가격·온보딩 관련 Chromium/WebKit/태블릿 Playwright 검증이 통과했습니다. 실제 Toss 결제, 배포, Secret 변경은 수행하지 않았고 저장소의 `PAYMENTS_ENABLED=false` 기본값은 유지됩니다.

## Staging Worker Secret 동기화 준비 (2026-07-18)

- `Staging Deploy`는 GitHub Environment `staging`의 `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`를 임시 secrets 파일로 만들어 `on-my-way-staging`에 동기화하도록 준비한다.
- 임시 파일은 Runner 임시 디렉터리에서만 생성하고 배포 성공 여부와 관계없이 삭제하며, 저장소나 artifact에 보관하지 않는다.
- `SESSION_SECRET`은 값 노출 없이 생성·등록했으며 Google·Toss 외부 Secret 4개도 GitHub Environment `staging`에서 이름 존재를 확인했다. 실제 값은 조회하거나 기록하지 않는다.
- `PAYMENTS_ENABLED=false`와 Production 환경 불변을 유지한다.
# 3A 모바일 앱 셸·오늘 탭 개선 (2026-07-20)

- 브랜치: `feat/mobile-ux-stage3-today` (기준 `origin/main` `1d5f907`)
- 상태: 구현·로컬/Preview 전체 회귀 완료, Draft PR #17 생성
- Production 읽기 전용 확인: Google·Kakao·Naver `configured=true`, Apple `visible=false`, `devLoginEnabled=false`, `environment=production`, `payments=false`, `accountStorage=true`, `AI=true`
- 모바일 셸: 60px 단일 행 헤더, 설계 수정은 drawer에서 유지, 크레딧·메뉴 44px 터치 영역, safe-area 하단 4탭 유지
- 오늘 정보 구조: 날짜·목표·남은 일정 → 오늘의 한 걸음 Hero → 최대 3개 일정과 펼침 → 조건부 회복 → 진행률·올리 통합 요약 → 성향 안내
- 기능 호환: 기존 일정 완료·XP 중복 방지·집중 타이머·정렬·계획 이동·회복·계정별 저장 selector와 저장 형식 유지
- 접근성: 일정명과 checkbox 연결, 펼침 `aria-expanded`, 진행 상태 `aria-live`, 44px 터치 영역, 기존 sheet 포커스·탭 `aria-selected` 유지
- 성능: 신규 라이브러리·폰트·대형 이미지 없음, 첫 화면 아래 올리 이미지 lazy loading, 불필요한 이미지 preload 3개 제거
- 검증: `npm test` 126/126, 전체 JavaScript `node --check` 통과, Playwright 188/188 통과
- CI/Preview: `validate-and-preview` 성공, https://on-my-way-pr-17.jungslawyer.workers.dev
- viewport: 320×568, 360×800, 375×812, 390×844, 430×932, 768×1024, 1440×900 가로 overflow 및 주요 화면 검증
- 스크린샷: `docs/artifacts/mobile-ux-stage3-today/{before,after}`
- 미변경: 인증·결제 서버 코드, OAuth, binding, route, custom domain, Production workflow·설정, `PAYMENTS_ENABLED=false`
- 다음 단일 작업: 3B 계획 탭에서 주간 계획 확인·상세·수정의 모바일 정보 구조를 단순화한다.
# 3B 계획 탭 준비 (2026-07-20)

- PR #17은 squash merge되었고 Production workflow `29703530262`가 성공했다.
- Production은 초기 3회와 120초 overwrite 감시 후 양 origin 각 3회 모두 `environment=production`, `payments=false`였다.
- rollback은 실행되지 않았고 Cloudflare Workers Builds 재발은 확인되지 않았다.
- `feat/mobile-ux-stage3-plan` 브랜치를 최신 main `9ab5cd2`에서 생성했다.
- 제품 코드는 변경하지 않았으며 읽기 전용 감사와 구현 계획은 `docs/mobile-ux-stage3-plan-audit.md`에 기록했다.
- 다음 단일 작업: 감사 계획에 따라 계획 탭 홈의 정보 계층과 primary CTA를 모바일 우선으로 단순화한다.
