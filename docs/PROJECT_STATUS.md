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
