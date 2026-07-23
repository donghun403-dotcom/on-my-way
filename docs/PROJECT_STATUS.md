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
## 2026-07-20 — 3B 모바일 Plan UX 구현

- 기준: `main` `9ab5cd207f46c00f45231a1af00b06d9db5b324e`, 기존 감사 커밋 `4b1725fa07641e7f64da0691966e75ad0d41062c`를 유지했다.
- Plan 홈을 현재 목표, 핵심 지표, 접근 가능한 7일 스트립, 다가오는 일정 3개, 단일 주요 CTA 순서로 단순화했다.
- 날짜 선택은 기존 월간 달력과 `calendarDayDetail` ID를 유지하면서 모바일 bottom sheet, 배경·Escape 닫기, body scroll lock, 초점 이동·복원을 추가했다. 데스크톱은 기존 inline 상세를 유지한다.
- 계획 수정은 현재 계획을 접힌 요약으로 바꾸고, 다중 빠른 선택 6종, 자유 입력, 변경안 생성, pending 제안 확인, 명시적 적용·재수정·기존 유지 흐름으로 정리했다. 제안 생성 전에는 적용·취소 액션을 숨긴다.
- 기존 승인 계약과 저장 ID, 계정 격리, Today/Plan 동기화 로직을 유지했다. 인증·OAuth·결제·Worker·workflow·binding·route·custom domain과 `PAYMENTS_ENABLED`는 변경하지 않았다.
- 검증: `npm test` 126/126, JavaScript 35개 `node --check`, 전체 Playwright 199 passed / 1 skipped.
- 증적: `docs/artifacts/mobile-ux-stage3-plan` 전후 비교 PNG 12개, 총 286,267 bytes, 개별 최대 35,484 bytes. 합성 목표 데이터만 포함하며 추가 압축은 불필요하다.
- Production 사전 확인: `environment=production`, `payments=false`, account storage와 AI 준비, Google·Kakao·Naver visible/configured, Apple과 developer login 비노출.
- 다음 상태: Draft PR과 Preview 검증만 수행하며 merge하지 않는다.

## Stage 3D actual-device QA preparation (2026-07-21)

- Created `qa/mobile-ux-stage3d-device-validation` from main `442d3020d9182cb9042e70b7cd04e0e1d3503ac4` in a separate worktree.
- Production remains healthy and payment-disabled. Staging remains payment-disabled but reports `ai=false`; no Staging `OPENAI_API_KEY` Secret name is configured and no Production Secret was read or copied.
- Actual iPhone Safari and Galaxy Chrome sessions were unavailable, so actual-device, OAuth, keyboard, safe-area, and background-resume checks are `BLOCKED`/`NOT RUN`, not PASS.
- Added the execution checklist and evidence placeholders in `docs/mobile-ux-stage3d-device-qa.md` and `docs/artifacts/mobile-ux-stage3d-device-qa/`. No product code, deployment, environment, authentication, billing, binding, route, or domain was changed.
- Automated regression passed: 130 unit tests, 39 JavaScript syntax checks, and 37 targeted mobile/responsive Playwright tests, with no failures, unrun tests, or skips. The first managed-webServer invocation completed all test bodies but hung during Windows teardown; the unchanged suite exited cleanly with an externally managed local server.
- Stage 3D is not complete and private beta is not approved until both actual devices, provider logins/account isolation, and exactly one Staging AI proposal/application flow pass.

## Guarded Staging OpenAI Secret sync (2026-07-21)

- Staging AI remained blocked because `OPENAI_API_KEY` was not part of the guarded Staging Worker Secret delivery path.
- `Staging Deploy` now requires and masks the Staging Environment Secret, includes it in the protected temporary secrets file, verifies its Worker Secret name after deploy, and requires `ai=true` while preserving `payments=false`.
- No Production Secret was queried or copied. No real key registration, Staging deployment, AI call, Production change, or device QA was performed.
- Stage 3D actual-device QA and private beta approval remain blocked.

## Production RUM navigation lifecycle verification (2026-07-20)

- Branch `fix/production-rum-abort-lifecycle` starts from main `2b40962cbb16d6ca318919263387916d51420636` and changes only Playwright diagnostics, its focused unit regression, and the manual verification path in the existing Preview workflow.
- Production evidence shows the document RUM XHR finishes with HTTP 204 before `/index.html` navigates to `/app.html`; the following `resourceType=ping` request is canceled by that committed cross-document navigation, not by CSP or test teardown.
- The helper now accepts that lifecycle only with the exact same-origin POST path, ping resource type, exact Chromium abort reason, a prior 2xx RUM completion for the source document, and a subsequent different main-frame commit. Unrelated request, response, console, and CSP failures remain fatal.
- Unit tests and JavaScript syntax checks pass, and the focused 320x568 Production responsive check passes with two HTTP 204 RUM completions and zero CSP failures. The single manual Production Plan run `29717357116` passed 23 runnable tests with zero failures and zero unrun tests; its one skip is the existing desktop-only mobile-sheet condition. All eight responsive viewports recorded two HTTP 204 RUM completions and zero CSP failures.
- Both Production origins remained `environment=production`, `payments=false`, account storage and AI ready, Google/Kakao/Naver configured, Apple hidden, and developer login disabled in three no-cache checks each. No deploy workflow ran, and 3C audit work was not started in this task.
- Draft PR #20's first Preview run passed unit, syntax, and CI-server Playwright but exposed a first-deploy failure in pinned Wrangler 4.81.0 after asset upload and before workers.dev publication (Cloudflare API code 10007). PR Preview alone now pins current Wrangler 4.112.0, which includes newer `--name` target handling and workers.dev subdomain preflight; no retry or failure ignore was added.
- Production configuration, Worker code, authentication, billing, bindings, routes, domains, and the disabled payment/developer/demo/Apple flags are unchanged.

## Production Cloudflare Analytics CSP hotfix (2026-07-20)

- `fix/production-csp-cloudflare-analytics`를 main `99a2253f25b6bd741124a28064a44d830af656fd`에서 준비해 Production에서 차단된 versioned Cloudflare Web Analytics beacon을 다룬다.
- CSP 변경은 정확한 `/beacon.min.js` source와 trailing-slash version path prefix로 제한한다. Analytics host wildcard나 새 `connect-src` source는 허용하지 않는다.
- 인증·결제·UI·Production 설정·binding·route·custom domain은 변경하지 않았고 모든 Wrangler의 `PAYMENTS_ENABLED=false`를 유지한다.
- unit, syntax, CSP directive 파싱, 명시적 beacon 허용·차단 URL fixture 검증을 통과했다. Draft PR Preview CI를 전체 Playwright 완료의 최종 gate로 사용한다.
- 이 hotfix 병합과 Production 브라우저 검증이 성공할 때까지 3C 감사와 구현은 보류한다.

## 3C 올리·기록 모바일 UX 감사 (2026-07-20)

- PR #20은 squash merge됐고 main `4ba88dfd6319062f4635d100e1ceb45a4a97d324`의 Production workflow `29724706444`가 성공했다. 초기 및 120초 overwrite 감시, 이후 양 origin no-cache 3회 확인 모두 `environment=production`, `payments=false`였고 rollback과 Workers Builds 재발은 없었다.
- `feat/mobile-ux-stage3-ollie-memory`를 최신 main에서 별도 worktree로 만들고 제품 코드를 변경하지 않은 채 올리·기록 탭을 감사했다.
- 합성 데이터로 320×568, 360×800, 375×812, 390×844, 430×932, 768×1024, 1440×900 before 증적을 만들었다. 전 viewport 가로 overflow는 0px였고 기존 mate·records·responsive Playwright 13개가 통과했다.
- 올리 탭에는 현재 대화 CTA가 없어 정책상 주 진입점과 불일치한다. 기록 탭은 대화 카드가 회고보다 먼저 나오며 저장 CTA는 모든 감사 viewport의 첫 화면 밖이다.
- 권장 방향은 4탭을 유지하고, 올리 탭은 상태/인사 → 대화 primary → 관계 요약 → 성장 공개, 기록 탭은 감정 → 한 장면 → 선택 입력 → 저장 → 대화 요약 → 과거/인사이트 공개 순서로 정리하는 것이다.
- selector, `omwCompanionState`, `omwCompanionEvents`, `omwExecutionState.dailyMemories`, account scope와 서버 동기화 형식은 유지해야 한다. 실제 모바일 키보드·safe-area 동작은 실기기 QA 전까지 `Unknown`이다.
- 감사 문서: `docs/mobile-ux-stage3-ollie-memory-audit.md`. 3C 제품 구현과 구현 PR은 시작하지 않았다.
- 다음 단일 작업: 감사 문서의 정보 구조·초점 정책·실기기 QA 계획을 승인한 뒤 별도 구현 단계로 진행한다.

## 3C 올리·기록 모바일 UX 구현 (2026-07-20)

- 브랜치 `feat/mobile-ux-stage3-ollie-memory`에서 감사 커밋 `1174c20a00bbd83d6459555c453391362bd67221`을 유지한 채 제품 구현을 진행했다.
- 올리 탭은 상태/인사 → 대화 primary → 쓰다듬기 secondary → 관계 요약 → 성장/여정 점진 공개로 단순화했다. 기록 탭은 감정 → 한 장면 → 선택 입력 → 저장 → 조건부 실제 대화 요약 → 과거 기록 순서로 재구성했다.
- 기존 ID·selector와 저장 키/schema, 계정 격리, 서버 동기화, XP 중복 방지, Today/Plan 계약을 유지했다. 대화 sheet는 닫기 버튼 초기 초점과 실행 CTA 복원을 Chromium·iPhone WebKit에서 검증했다.
- 검증: unit 130 passed, JavaScript syntax 39개 통과, 3C 전용 24 passed, 전체 Playwright 223 passed / 0 failed / 0 did not run / 기존 의도적 1 skipped. 새 skip·assertion 약화·오류 ignore는 없다.
- 증적: `docs/artifacts/mobile-ux-stage3-ollie-memory/after`에 7개 viewport의 올리·기록 PNG 14개를 생성했다. after 총 4,547,170 bytes, 최대 694,930 bytes이며 합성 데이터만 포함한다.
- 원본 올리 PNG 4개 3,492,093 bytes의 WebP/fallback 최적화는 시각·캐시 회귀를 충분히 검증할 별도 성능 작업으로 보류했다.
- 실제 iPhone Safari·Galaxy Chrome의 키보드·safe-area·주소창 변화 검증은 `Unknown`이며 3D 실기기 QA 항목으로 남긴다.
- 인증·OAuth·결제·무료 체험·Worker/CSP·Production config/workflow·Secret·KV/D1·route·custom domain과 `PAYMENTS_ENABLED=false`는 변경하지 않았다. Production 배포, merge, 3D 시작은 수행하지 않는다.
- Draft PR #21을 생성했다. 구현 head `90b6bfbdeeb0b8b25722a40a7dfb46d7c82a59c6`의 PR Preview run `29735493908`은 unit, syntax, CI server Playwright, Preview deploy/readiness/Playwright와 config cleanup을 통과했으며 Preview는 `environment=preview`, `payments=false`다.

## 3D 실기기 beta blocker 수정 준비 (2026-07-21)

- iPhone 15와 Galaxy Chrome 수동 QA에서 AI 결과 헤더 overflow, Plan CTA의 검은 배경, 전체 계획 날짜 sheet/tabbar 중첩, 올리 성장 여정의 복귀 경로 부재, 로그아웃 잔류, 최초 로그인/회원가입 진입 불명확, 홈 방문 후 기본 계획으로 보이는 문제를 확인했다.
- 가장 큰 계획 무결성 원인은 첫 화면의 로컬 미리보기가 실제 생성 없이 `omwExecutionPlan`을 저장하던 동작과, 새 AI 계획이 이전 목표의 실행 상태 `planText`를 재사용하던 결합이었다. 미리보기는 더 이상 저장하지 않고, 실행 상태는 현재 목표의 schedule key가 일치할 때만 재사용한다.
- 목표 템플릿의 현재 상태·가용 시간·기존 루틴을 실제 AI 요청에 포함한다. 비시험 목표에 시험 전용 `오답 정리`·LC·RC 문구가 섞인 응답은 적용하지 않으며, 긴 planning style은 서버와 화면에서 짧은 유형명으로 제한한다.
- Plan sheet는 모바일에서 body에 장착해 실제 viewport와 tabbar를 기준으로 배치하고 초점·닫기 복원을 유지한다. 앱/올리 복귀, 회원의 저장 계획 CTA, 익명 목표 초안 보존 로그인/회원가입, 로그아웃 후 첫 화면 이동을 추가했다.
- Kakao iPhone 간편로그인 오류는 Kakao 계정 화면이 iCloud Private Relay/VPN 네트워크 정보를 거부한 외부 단계로 확인했다. 앱 callback·Secret·OAuth 설정은 변경하지 않았다.
- 검증: unit 142 passed, 전체 JavaScript syntax 41 files passed. 변경 관련 mobile Chromium 10 passed, iPhone WebKit 10 passed. 전체 Playwright 240개 동시 실행은 로컬 Windows의 10분 제한에서 135개까지 진행된 뒤 종료됐고, 그 과정의 desktop auth navigation/context teardown timeout 3건은 같은 테스트를 workers=1로 단독 실행해 3 passed를 확인했다. 제품 assertion 실패는 없었으며 PR CI가 전체 suite의 최종 gate다.
- Draft PR #24의 첫 CI run `29797572235`에서 768px tablet만 날짜 sheet가 tabbar 아래로 80px가량 내려가는 동일 회귀를 검출했다. sheet portal 범위를 768px까지 확장하고 tablet tabbar의 실제 78px clearance에 맞췄으며, 해당 테스트 1 passed와 mobile Chromium·iPhone WebKit·tablet Chromium Plan spec 12 passed를 확인했다. assertion·retry·ignore는 변경하지 않았다.
- 인증 제공자 설정, 결제·원장, Secret, KV/D1, route, custom domain, Production workflow/config와 `PAYMENTS_ENABLED=false`는 변경하지 않았다. Production 배포와 실제 AI 호출은 수행하지 않았다.

## 로그인 전 AI 계획 미리보기 전환 (2026-07-21)

- 첫 목표 설계 CTA를 `AI 계획 미리보기 만들기`로 바꾸고, 비회원에게 입력한 목표·현재 상태·가용 시간·루틴을 사용하는 실제 AI 결과 중 첫 행동, 첫 주 3개 항목, 오늘 일정 1개만 먼저 보여 주도록 준비했다.
- 전체 일정·저장·24시간 무료 체험은 미리보기를 확인한 뒤 `로그인·회원가입하고 전체 계획 보기`를 선택한 경우에만 이어진다. 로그인 복귀 시 입력과 미리보기를 복원하고, 명시적으로 무료 체험 전체 계획을 생성한 뒤에만 회원 계획을 저장한다.
- 비회원 API는 Cloudflare rate limiter, Staging/Production `OPENAI_API_KEY`, `USERS_KV`, 충분한 길이의 `SESSION_SECRET`, Cloudflare client identity가 모두 있어야 열리며, 비식별 HMAC key와 부분 미리보기만 24시간 보관한다. 같은 actor·같은 입력은 캐시를 재사용하고 다른 입력의 재호출은 24시간 차단한다.
- 기존 회원용 `/api/ai/goal-plan`의 인증, trial, credit reservation/commit, 계획 1개 제한 계약은 변경하지 않았다. 전체 계획을 비회원 응답이나 브라우저 저장소에 미리 저장하지 않는다.
- 검증: unit 144 passed, JavaScript syntax 42개 통과, mobile Chromium·iPhone WebKit 온보딩 4 passed. 실제 OpenAI 호출, Staging/Production 배포, 실기기 재검증은 이번 변경에서 `NOT RUN`이다.

## Pricing confirmation lifecycle 동기화 (2026-07-21)

- Preview desktop pricing 회귀에서 dialog가 닫힌 뒤 shared confirmation promise의 `finally` 정리가 끝나기 전에 재클릭되거나, dialog close 직후 billing-auth 완료 전에 테스트가 결과를 읽는 비동기 경쟁을 확인했다.
- dialog `close` handler가 resolve보다 먼저 shared promise를 해제하도록 하고, 테스트는 sleep 없이 billing-auth 호출 수가 정확히 1이 되는 완료 조건을 기다린 뒤 기존 method·success/fail URL assertion을 그대로 수행한다.
- 검증: 실패 테스트 desktop/mobile Chromium/iPhone WebKit 3 passed, mobile Chromium·iPhone WebKit pricing 전체 16 passed, unit 144 passed, JavaScript syntax 42개 통과. retry·sleep·skip·fixme·ignore와 결제 정책 변경은 없다.

## 온보딩 목표 확인·로그인 취소 복귀 (2026-07-21)

- 목표 카테고리는 더 이상 예시 목표·루틴을 자동 확정하거나 다음 단계로 자동 이동하지 않는다. 카테고리는 `aria-pressed` 선택 상태와 도움말·placeholder·최대 3개 추천만 바꾸며, 추천을 직접 고르거나 목표를 입력한 뒤 `다음 단계`를 명시적으로 눌러야 진행한다.
- 익명 AI 미리보기에서 시작한 전체 계획 로그인에만 10분 유효한 same-origin `sessionStorage` auth intent를 둔다. callback 취소·실패와 provider 화면의 browser back은 목표 초안·부분 미리보기를 유지한 로그인 공급자 chooser로 돌아오며, 다른 provider는 사용자가 직접 선택한다.
- chooser의 명시적 닫기는 기존 AI 미리보기로 복귀하고 intent를 정리한다. OAuth 성공은 초안·미리보기와 회원 UI만 복원하며, 전체 계획 API는 사용자가 후속 CTA를 눌렀을 때만 호출한다.
- OAuth 서버 state 검증·callback URL, 익명 rate/HMAC/24시간 정책, 회원 trial·credit·Free 계획 제한, 결제·Production workflow/config·Secret·KV/D1·route·domain과 `PAYMENTS_ENABLED=false`는 변경하지 않았다.
- 검증: unit 144 passed, JavaScript syntax 42개 통과, 온보딩은 desktop/mobile Chromium/iPhone WebKit/tablet Chromium 각 8 passed, 정확한 320×568·390×844·430×932·768×1024 responsive 4 passed다. 병렬 대형 묶음에서 발생한 기존 mobile 계정·pricing 및 WebKit 자원 timeout은 workers=1 관련 테스트 12 passed로 확인했으며 retry·sleep·skip·fixme·ignore는 추가하지 않았다.

## 앱 메뉴의 앱 구경 진입 정합성 (2026-07-22)

- 앱 메뉴의 `서비스 소개 보기`를 목적이 명확한 `앱 구경하기`로 바꾸고, 홈페이지 첫 화면이 아니라 기존 앱 기능 소개 화면 `index.html#appTour`로 직접 연결했다.
- desktop Chromium, mobile Chromium, iPhone WebKit, tablet Chromium에서 메뉴 클릭, URL, 앱 구경 화면 표시, 목표 설계 화면 비표시를 검증해 4/4 통과했다.
- 로그인·계획·AI·결제·Worker·Production 설정은 변경하지 않았다.

## 계획 생성·검토·실행 UX 통합 (2026-07-22)

- 목표 설계를 목표, 자료·일정, 계획 초안의 3단계로 정리하고 자료 유무·범위, 현재 진도, 가능한 요일·시간, 제외 일정, 선호 시간과 계획 성향을 AI 입력 및 초안 검증에 연결했다.
- AI 계획 항목을 `ACTION`, `REVIEW`, `TIP`, `SYSTEM_RULE`로 구분한다. 첫 7일은 요일별 행동과 근거를 먼저 검토하며, 휴식일 행동·가능 시간 초과·자료 미반영·목표 도메인 혼입은 활성화 전에 거부한다.
- 익명 응답은 부분 미리보기와 24시간 초안 ID만 반환한다. 전체 초안은 Worker 저장소에만 두며 로그인 후 같은 초안을 추가 AI 호출·크레딧 차감 없이 claim하고, 사용자가 명시적으로 저장한 뒤에만 회원 실행 계획으로 전환한다.
- Today는 첫 미완료 행동과 직접 수정을 우선하고 TIP·REVIEW를 별도 정보로 표시하며 SYSTEM_RULE은 일반 일정에서 숨긴다. Plan은 계획 기준, 주간·전체 일정 전환, 개별 일정 편집, AI 조정, 직접 편집, 적용 전 비교와 1회 실행 취소를 제공한다.
- TaskEditSheet는 내용·날짜·시간·예상 시간·분량·완료 기준과 이 일정만·같은 반복 일정의 남은 회차·남은 계획 전체 조정 진입을 구분한다. 날짜 이동과 오늘만 건너뛰기는 완료 기록을 보존하고, 반복 범위 편집은 영향 개수를 먼저 확인한 뒤에만 적용한다. PlanAdjustSheet는 오늘·이번 주·남은 계획 전체 범위를 AI 미리보기 또는 범위 내 개별 직접 편집에 연결한다.
- 기존 실행 계획과 진행 기록은 `appStateVersion=4`에서 보존하며, 새 항목 필드와 편집 이력이 없는 데이터는 읽을 때 안전한 기본값으로 보완한다. 완료 기록은 직접 편집과 AI 제안 생성만으로 변경하지 않는다.
- 인증·결제·Production workflow/config·Secret·KV/D1·route·domain은 변경하지 않았고 `PAYMENTS_ENABLED=false` 정책을 유지한다. 실제 AI 호출과 배포는 이 작업에서 수행하지 않는다.
- 검증: unit 146 passed, JavaScript syntax 42 files passed, 온보딩 desktop/mobile Chromium 16 passed와 iPhone WebKit 8 passed, 최신 Today·Plan 전체 관련 회귀는 desktop Chromium·mobile Chromium·iPhone WebKit 단일 워커에서 35 passed/기존 데스크톱의 모바일 sheet 조건 1 skipped다. 저장 복구 10 passed, 320×568·390×844·430×932·768×1024 responsive 4 passed다. 새 retry·sleep·skip·fixme·오류 ignore는 추가하지 않았다.

## 계획 경험 P0 인수 감사 (2026-07-22)

- 초기 15개 변경 파일의 전체 diff를 독립 검토하고 worktree 밖에 patch로 보존했다. 감사 중 typed plan 검증, 중복 stable task key, 완료 기록 보존, schema-on-read의 즉시 write-back, 동적 HTML 출력, 중복 submit, 익명 draft claim 경계를 P0 범위에서 보완했으며 P1 기능은 추가하지 않았다.
- 익명 전체 draft는 module-scope 메모리가 아니라 기존 `USERS_KV`에 절대 만료 시각 기준 24시간 저장한다. UUID draft ID와 원래 브라우저에만 주는 HttpOnly capability, 로그인 세션을 모두 요구하고, 동일 계정 재시도는 멱등 처리하며 다른 계정·만료·누락 draft를 거부한다.
- 다만 Workers KV에는 cross-isolate compare-and-set 또는 transaction이 없고 현재 draft 단위 잠금도 isolate 내부에서만 유효하다. 서로 다른 isolate의 동시 claim을 원자적으로 한 계정에 제한하려면 Durable Object 또는 D1 transactional table과 새 binding/config가 필요하므로 현재 상태는 배포 `NO-GO`다. 이번 감사에서는 Production binding·migration·config를 변경하지 않았다.
- 익명 미리보기 뒤 목표 입력을 수정해도 24시간 actor cache와 원본 서버 draft 때문에 수정 내용이 전체 draft schedule에 반영되지 않을 수 있다. claim은 추가 AI 호출·크레딧 차감 없이 원본 draft를 확정하므로, 명시적인 draft patch 계약 또는 새 draft 생성 정책이 정해질 때까지 이 흐름도 배포 차단 항목이다.
- 로컬 프로세스와 `.dev.vars`에 `OPENAI_API_KEY`가 없어 실제 OpenAI 호출은 `NOT RUN`이다. Production Secret을 조회하거나 키를 요청·기록하지 않았고, 구조화 입력·출력·timeout·잘못된 JSON·누락 필드·분야 혼입·시간/요일/자료/완료 기록 계약은 mock 기반 단위 테스트로 검증했다.
- 최종 검증은 unit 155/155, JavaScript syntax 42/42, responsive 320–1440px 12/12다. 관련 E2E의 desktop/mobile 구간은 최종 코드에서 모두 통과했고, 병렬 대형 묶음의 iPhone WebKit에서 서로 무관한 click·mock response·전체 test timeout 3건이 발생했다. 같은 3건은 단일 worker에서 3/3, iPhone 관련 전체는 33/33 통과해 로컬 WebKit 자원 경합으로 분류했다. 이후 정상 v3 상태의 원문 read·명시적 v4 write·완료/일기/진행률/확장 필드 보존 fixture도 세 엔진에서 3/3 통과했다. 엔진별 최종 합계는 101 passed와 기존 데스크톱 모바일-sheet 조건 1 skipped다. 대표 9개 화면은 desktop/mobile 각 1장씩 worktree 밖에 캡처했고, 가로 overflow·콘솔 오류·색상만으로 구분되는 상태·44px 닫기 버튼과 sheet 초점 복귀를 확인했다.
- Production workflow/config, OAuth·Secret·KV/D1·route·domain, 인증·결제 코드와 모든 Wrangler의 `PAYMENTS_ENABLED=false`, `ALLOW_DEV_LOGIN=false`, `ALLOW_DEMO_BILLING=false`, `APPLE_LOGIN_VISIBLE=false`는 변경하지 않았다. commit, push, PR, Staging/Production deploy는 수행하지 않았다.

## 계획 경험 P0.1 일관성 보완 (2026-07-23)

- P0 감사의 배포 차단 결함은 Workers KV와 module-scope 잠금만으로는 익명 초안 claim의 cross-isolate 원자성을 보장할 수 없고, 사용자가 초안 조건을 바꾼 뒤에도 수정된 metadata와 이전 AI schedule이 함께 저장될 수 있다는 점이었다.
- 익명 전체 초안의 단일 source of truth를 SQLite-backed `GuestPlanDraftObject`로 옮겼다. 각 UUID draft는 `GUEST_PLAN_DRAFTS.idFromName(draftId)`로 같은 객체에 라우팅되며, claim·revision begin/commit은 Durable Object storage transaction의 read-check-write로 직렬화된다. binding이 없으면 서버는 명시적으로 실패하고 KV나 module-scope 메모리로 fallback하지 않는다.
- claim은 capability, 만료, pending generation, expected revision/input hash, active plan/input hash를 함께 확인한다. 최초 성공자가 `claimedBy`와 stable `claimPlanId`를 확정하고, 같은 계정의 재시도는 같은 계획을 반환하며 다른 계정은 거부한다. 회원 저장 실패 시 초안을 삭제하지 않고 같은 계정이 같은 `claimPlanId`로 idempotent upsert를 재시도한다.
- revision은 `READY → GENERATING(pendingGeneration) → READY(next revision)`으로 진행한다. OpenAI 호출은 transaction 밖에서 수행하고, 검증된 전체 계획만 active input·input hash·plan·preview와 함께 원자적으로 교체한다. AI/JSON/validation 실패 시 pending만 정리하고 이전 active revision을 그대로 유지한다.
- 입력은 서버에서 canonical normalize한 뒤 input schema, prompt, output schema version을 포함해 SHA-256으로 식별한다. actor와 input hash는 서버 HMAC으로 122-bit UUIDv4 형태의 draft ID에 안정적으로 매핑되어 KV 전파 전의 동시 최초 요청도 같은 Durable Object로 모인다. KV actor cache는 전체 초안이나 schedule을 저장하지 않고 actor/input hash, UUID, 버전, 만료 시각만 보관하며 같은 actor의 다른 입력에는 이전 schedule을 반환하지 않는다.
- TTL은 최초 생성 시점부터 절대 24시간이며 조회·revision·claim으로 연장되지 않는다. 모든 요청에서 만료를 재검사하고 410을 반환하며 Durable Object alarm이 만료 데이터를 정리한다.
- 클라이언트는 `activeDraftInput`과 `pendingDraftInput`을 분리한다. 입력 변경은 명시적인 “수정한 조건으로 계획 다시 만들기” 전에는 active plan을 바꾸지 않으며 저장/claim을 막는다. 성공 시 서버 revision을 함께 교체하고, 실패 시 기존 계획을 보존하며, 사용자는 수정 내용을 버릴 수 있다.
- `wrangler.jsonc`, Preview, Staging, Production config에 `GUEST_PLAN_DRAFTS` binding과 `guest-plan-drafts-v1`의 `new_sqlite_classes` migration을 추가했다. 기존 KV, rate limiter, cron, route/domain, 인증·결제 설정과 모든 안전 플래그는 유지했다. 실제 resource 생성과 deploy는 수행하지 않았다.
- Staging 인수에는 Durable Object migration/binding 적용, `USERS_KV`, `AI_RATE_LIMITER`, Staging 전용 `OPENAI_API_KEY`·`SESSION_SECRET`, OAuth provider secret이 필요하다. 자료 없는 운동, 교재/진도 영어, 불가능한 시간 조건, 제외 요일/휴식, AI revision, 실제 OAuth claim, 새로고침 복원, AI 호출·크레딧 무증가를 확인해야 한다.
- 로컬 환경에는 `OPENAI_API_KEY`가 없어 실제 OpenAI 호출은 `NOT RUN`이다. 실제 OAuth 로그인·claim과 Cloudflare SQLite Durable Object runtime 검증도 `NOT RUN`이며 mock/fixture 검증 결과를 실제 Staging 인수 완료로 기록하지 않는다.

## 계획 경험 P0.1 Git 고정 및 로컬 인수 결과 (2026-07-23)

- 작업 전 HEAD `dadd9b3ad738250ab195ce827761004b5545ae7e`의 tracked 21개와 untracked 4개 변경을 검토하고, untracked를 포함한 전체 상태를 worktree 밖 patch로 추가 보존했다. 네 신규 파일은 누락 없이 backend 커밋에 포함됐다.
- 최종 코드 리뷰에서 Worker 종료 뒤 `GENERATING` 상태가 절대 TTL까지 고착될 수 있는 결함을 발견해 90초 generation lease와 transaction 기반 stale recovery를 추가했다. 최초 생성 중단은 안전하게 재시작하고, revision 중단은 기존 active plan/input을 복원한다. revision commit은 generation token·input hash와 함께 idempotency key도 일치해야 한다.
- 로컬 커밋은 backend/typed plan·Durable Object 묶음과 app/onboarding·Today·Plan 묶음으로 분리했다. 각 커밋 뒤 관련 unit·syntax를 확인했고, 테스트 fixture가 production 모듈에 포함되거나 신규 파일이 누락되지 않았다.
- 캐시된 workflow 고정 버전 Wrangler 4.112.0(default/Preview)과 4.81.0(Staging/Production)의 `deploy --dry-run`을 사용했다. 네 config 모두 bundle을 만들고 `GuestPlanDraftObject`, `GUEST_PLAN_DRAFTS`, SQLite migration과 `PAYMENTS_ENABLED=false`를 인식했으며 실제 upload/deploy는 없었다.
- 실제 Miniflare/workerd SQLite Durable Object smoke는 로컬 runtime이 첫 요청 전에 시작되지 않아 `BLOCKED / NOT RUN`이다. 메모리 fixture와 bundle 성공을 실제 SQLite 재시작 복원 성공으로 대체하지 않는다.
- detached clean worktree에서 기존 `node_modules`를 공유하지 않고 `npm ci`를 실행했다. unit은 174/174, tracked JavaScript syntax는 46/46, `git diff --check`와 Wrangler 네 config dry-run은 통과했다. responsive는 12/12 통과했다.
- Playwright 내장 `webServer`는 Windows 종료 단계에서 마지막 테스트 뒤 프로세스가 정체됐다. 별도 PID의 local server와 `E2E_BASE_URL`로 분리하자 단일 mobile 회귀가 1/1 통과하고 서버도 정상 종료됐다. P0 관련 desktop/mobile/iPhone 묶음은 106 passed, 기존 desktop 모바일-sheet 조건 1 skipped, desktop OAuth chooser bootstrap 환경 timeout 1 failed였다. 같은 시나리오는 앞선 desktop run과 이번 mobile/iPhone에서 통과했고 제품 assertion·console 오류는 없었으나 실패를 재실행으로 덮지 않았으므로 clean 전체 E2E는 완전 PASS로 기록하지 않는다.
- 저장소 workflow 감사 결과 feature branch push 자체는 deploy workflow를 시작하지 않지만 Draft PR의 `pull_request` 이벤트는 Preview Worker를 실제 배포하고 SQLite migration config를 적용한다. 외부 Cloudflare Workers Git integration 활성 여부는 저장소만으로 확인할 수 없다. 따라서 push와 Draft PR은 모두 보류하고 로컬 커밋까지만 고정했다.
- 실제 OpenAI 호출, 실제 OAuth 로그인/claim, remote Durable Object migration, Staging/Production 배포는 모두 `NOT RUN`이다. Staging과 Production은 계속 `NO-GO`이며, Staging에서 SQLite binding/migration·실제 AI·OAuth claim·새로고침 복원을 인수하고 clean E2E 환경 timeout을 해소하기 전에는 merge 또는 배포하지 않는다.

## P0.2 Staging guest AI readiness hotfix (2026-07-23)

- Phase A 감사에서 Staging raw config와 generated config에 `AI_RATE_LIMITER`가 없다는 배포 차단 결함을 확인했다. 당시 `/api/health`는 `OPENAI_API_KEY`만 있으면 `ai=true`가 될 수 있었지만 실제 guest preview와 revision API는 limiter 누락으로 503을 반환할 수 있었다.
- `wrangler.staging.jsonc`에 기존 Preview·Production과 같은 5회/60초 정책의 `AI_RATE_LIMITER` 구조와 원격 배포가 불가능한 `0` namespace placeholder를 추가했다. 실제 Staging namespace는 기존 KV/D1 resource identifier convention에 맞춰 GitHub Environment `staging`의 `CLOUDFLARE_STAGING_AI_RATE_LIMITER_NAMESPACE_ID` Secret으로만 주입한다.
- config generator는 Staging namespace가 양의 정수이고 repository에 기록된 Preview·Production namespace와 다를 때만 generated config를 만든다. 원격 리소스가 실제로 격리됐는지는 관리자 확인 전까지 `NOT VERIFIED`다.
- Staging workflow는 generated config의 필수 bindings, 안전 flag, Durable Object migration과 canonical rate-limit 계약을 구조적으로 검증하고 Wrangler 4.81.0 dry-run을 통과한 뒤에만 remote D1 migration과 Worker deploy 단계로 진행한다.
- health와 guest preview/revision은 `OPENAI_API_KEY`, 유효한 `SESSION_SECRET`, `USERS_KV`, `AI_RATE_LIMITER`, `GUEST_PLAN_DRAFTS`를 확인하는 같은 readiness helper를 사용한다. 공개 health 응답은 기존 service boolean만 반환하며 provider 호출이나 limiter token 소비를 하지 않는다.
- raw/generated config, namespace 입력 실패, required binding 누락·중복, preflight 순서, health readiness 및 API fail-closed 일관성 회귀 테스트를 추가했다. 신규 release candidate SHA는 이 hotfix 커밋 후 별도로 기록한다.
- 실제 Staging binding/migration, OpenAI 호출, OAuth 로그인·claim은 모두 `NOT RUN`이다. 외부 Git integration, GitHub Environment Secret 준비, OAuth callback, 원격 리소스 격리와 rollback version은 관리자 확인이 필요하며 Production readiness는 계속 `NO-GO`다.

## P0.3 AI Contract Hardening (2026-07-23)

- Staging deployment `36ce1c0a-f9c0-489d-ab15-45aff707c47c`에서 SQLite Durable Object 배포와 익명 draft 생성·claim·reload 복원은 성공했다. 실제 OpenAI 인수 5회 중 자료 없는 운동 목표, 달성 시간이 부족한 목표, 영어 초안 revision의 3회가 응답 해석 실패했고 나머지 2회만 성공했다.
- 기존 generation과 revision은 이미 Responses API의 strict `json_schema`를 요청했지만, 각각 별도 parser가 `response.status`, `incomplete_details`, refusal, parsed output을 확인하지 않고 `output_text`를 바로 `JSON.parse`했다. 따라서 max token으로 잘린 부분 JSON, refusal, message 누락, schema/domain 거부가 일반 해석 실패로 합쳐질 수 있었다.
- generation과 revision을 하나의 Structured Outputs envelope parser로 통합했다. HTTP → response status → incomplete reason → output/message/content type → refusal → parsed output 또는 정확한 JSON text → local schema → domain 순서로 검증하며, output 배열의 첫 항목을 message로 가정하지 않는다. parsed output이 있으면 text를 다시 파싱하지 않고 markdown fence나 JSON substring 추출 fallback도 사용하지 않는다.
- 오류는 `AI_PROVIDER_TIMEOUT`, `AI_PROVIDER_RATE_LIMITED`, `AI_PROVIDER_UNAVAILABLE`, `AI_OUTPUT_INCOMPLETE_MAX_TOKENS`, `AI_OUTPUT_INCOMPLETE_FILTER`, `AI_OUTPUT_REFUSED`, `AI_OUTPUT_MESSAGE_MISSING`, `AI_OUTPUT_PARSE_FAILED`, `AI_OUTPUT_SCHEMA_INVALID`, `AI_OUTPUT_DOMAIN_INVALID`로 분리했다. 공개 응답은 안전한 code·retryable만 제공하고, 로그에는 correlation/provider request ID, model, status/reason, output/content type, output token·문자 수, schema path/rule, domain code, latency, retry count만 기록한다.
- generation 3,000과 revision 2,800의 `max_output_tokens`는 과거 실패 응답의 status·usage 근거가 없어 임의로 올리지 않았다. 새 안전 로그로 실제 truncation 여부를 먼저 확인하며, 자동 retry도 추가하지 않았다. 기존 credit reservation은 성공 시에만 commit되고 실패 시 release되며, 같은 request ID의 성공·진행 중·release 후 재요청은 추가 provider 호출과 credit을 만들지 않는다.
- revision 실패는 Durable Object의 pending generation만 정리하고 이전 active input·plan·revision·input hash를 유지한다. 클라이언트는 pending input과 저장 CTA를 유지하며 “수정한 조건으로 계획을 다시 만들지 못했어요. 기존 계획은 그대로 유지했어요.”를 표시한다.
- Staging workflow는 exact 40자리 입력 SHA와 checkout 결과를 비교한다. generated config 검증 뒤 Wrangler `4.81.0 deploy --dry-run`으로 bundle을 만들고 `GUEST_PLAN_DRAFTS`와 `AI_RATE_LIMITER` 인식을 확인한 뒤에만 원격 D1 migration과 Worker deploy로 진행한다. 로컬 fixture generated config dry-run은 두 binding과 안전 flag를 인식해 성공했으며 실제 원격 mutation은 없었다.
- 로컬 검증은 전체 unit 198/198, 현재 변경을 포함한 JavaScript syntax 49/49, Structured Outputs·credit/idempotency·Durable Object·workflow fixture와 desktop/mobile Chromium·iPhone WebKit의 revision 실패 보존 시나리오 3/3을 통과했다. Playwright 내장 webServer 종료 정체는 별도 PID server와 `E2E_BASE_URL`로 분리해 테스트 결과와 구분했다. retry·sleep·skip·fixme·오류 ignore는 추가하지 않았다.
- 이번 단계에서 실제 OpenAI 재호출, OAuth A/B, 64개 원격 동시 claim, Staging 재배포, Preview/Production 배포는 모두 `NOT RUN`이다. OAuth·원격 동시성·실기기 mobile은 미완료이며 새 release candidate의 Staging 재인수가 성공할 때까지 Production은 `NO-GO`다.

## P0.3 Staging revalidation (2026-07-23)

- Release candidate `a1fe5c50ffba70236fe49fd3e0d5de4f5d365354`를 feature branch에 일반 fast-forward push하고 새 `Staging Deploy` run `30003740625`로 배포했다. exact checkout, generated config 검증, Wrangler 4.81.0 dry-run과 필수 Durable Object/rate-limit binding 확인이 원격 D1 migration과 Worker deploy보다 먼저 성공했다.
- 배포 후 health는 `environment=staging`, `payments=false`, `accountStorage=true`, `ai=true`였고 Google은 configured, developer login은 disabled, Apple은 hidden 상태였다. Production workflow/config와 Production resource는 변경하거나 조회하지 않았다.
- 첫 실제 provider generation은 1회만 실행했으며 HTTP 502와 `AI_OUTPUT_INCOMPLETE_MAX_TOKENS`로 종료됐다. 일반 parse failure로 합쳐지지 않고 `incomplete_details.reason=max_output_tokens` taxonomy로 분리됐지만 실제 generation 성공 조건을 충족하지 못했으므로 Staging은 `NO-GO`다.
- 실패를 재시도나 다른 시나리오로 덮지 않았다. 나머지 OpenAI 시나리오, OAuth A/B, 403/409/412, 64개 동시 claim, desktop/mobile 인수는 `NOT RUN`이다. 공개 API는 성공 응답의 provider request ID·output token 수를 노출하지 않으므로 해당 성공 telemetry도 이번 실행에서 확인하지 않았다.
- 오류 후 Worker health는 계속 정상이고 `payments=false`가 유지됐다. rollback은 수행하지 않았으며, Preview·Production 배포와 PR 생성도 수행하지 않았다. 다음 RC는 실제 schema를 완결할 수 있는 출력 예산 또는 더 작은 structured contract를 근거 기반으로 조정한 뒤 같은 단일-call 정책으로 재검증해야 한다.

## P0.4 Output Budget and Contract Compaction (2026-07-23)

- P0.3 Staging의 실제 실패는 generation `max_output_tokens=3000`에서 응답이 `incomplete`와 `reason=max_output_tokens`로 끝난 것이었다. 당시 계약은 AI가 첫 7일을 만들면서도 `firstAction`, `weekPlan`, `dashboard`, `todaySchedule`, `firstWeekSchedule`을 중복 반환하고, 각 일정마다 서버 소유 `planId`, task ID, `status`, `scheduledAt`, `recurrenceGroupId`까지 반복 생성하도록 해 출력 예산을 소모했다.
- 실제 제품 구조는 Architecture A다. AI는 요약·실현 가능성·단계·최대 14개 task template·정확히 7일의 template 참조·점검 규칙만 반환한다. 서버가 stable task ID, plan ID, 상태, 반복 그룹을 결정적으로 보강하고, 기존 클라이언트 scheduler가 첫 7일 패턴을 목표 전체 기간으로 확장한다. AI가 전체 30~90일 일정을 직접 반환하거나 제품 일정 수를 줄이지 않는다.
- generation schema는 `goal-plan-blueprint.v2`, prompt는 `goal-plan.prompt.v2`, revision schema는 `plan-revision-blueprint.v2`, prompt는 `plan-revision.prompt.v2`, budget은 `ai-output-budget.v2`로 올렸다. guest input hash와 cache record에 schema·prompt·budget version을 모두 포함해 이전 actor cache를 재사용하지 않는다.
- generation은 6,000 tokens, revision은 4,500 tokens로 분리했고 모델은 `gpt-5.4-mini`로 유지했다. 두 요청 모두 구조 변환에 불필요한 reasoning token을 줄이기 위해 `reasoning.effort=none`, `verbosity=low`를 명시했다. 자동 retry, 부분 JSON 복구, markdown fence 복구, partial plan 저장은 추가하지 않았다.
- 최대 fixture는 generation 4,624 bytes·3,360 characters·35 day-item references, revision 2,783 bytes·1,977 characters·35 references다. 저장소에 tokenizer dependency가 없어 문자 수를 정확한 token 수로 표현하지 않는다. 대신 schema/domain의 item 상한과 generation 48,000 bytes·revision 40,000 bytes의 parsed payload 상한을 독립적으로 강제한다. 실제 token headroom은 다음 Staging 단일 진단 호출의 `usage.output_tokens`로만 판정한다.
- generation과 revision은 각각 bounded output 계약을 가지며 `maxItems`와 동일한 domain 상한을 함께 검증한다. 서버 소유 필드는 AI schema에서 제거했고, 최종 호환 필드는 순수 enrichment 함수가 생성한다. 회원 계획에는 서버가 요청별 UUID plan ID를 부여해 같은 목표 문자열을 사용하는 서로 다른 계정의 stable task key가 충돌하지 않게 했다.
- 안전 로그에는 correlation/provider request ID, model, configured max output, response/incomplete 상태, output/reasoning tokens, output 문자 수, parsed payload bytes, parsed item count, latency, error category만 포함한다. usage가 없으면 `unknown`이며 prompt·목표·자료명·원문 응답·계정·capability·Secret은 기록하지 않는다. 공개 응답에서는 usage·request ID·diagnostics를 제거한다.
- 기존 incomplete/refusal/parse/schema/domain taxonomy와 credit reservation·idempotency·revision 원본 보존 계약은 유지했다. generation 실패는 입력을, revision 실패는 기존 계획을 그대로 보존하며, 실패 응답을 성공 계획과 병합하거나 commit하지 않는다.
- 로컬 fixture·unit·syntax·Playwright·workflow·Wrangler dry-run 검증만 수행했다. 실제 OpenAI 호출, OAuth, remote migration, Staging/Preview/Production 배포는 모두 `NOT RUN`이다. 새 RC를 Staging에 재배포한 뒤 Worker tail을 먼저 연결하고, 자료 없는 운동 목표를 정확히 한 번 생성해 `completed`, validation 성공, provider 1회, parse/schema 오류 0, 실제 output token headroom을 확인하기 전까지 Staging과 Production은 `NO-GO`다.
