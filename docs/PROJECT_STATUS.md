# On My Way 프로젝트 상태

## 기준

- 기준일: 2026-07-16 (KST)
- 판단 기준: 현재 소스와 작업 트리 → 테스트/CI → Git 커밋·PR → 배포 근거 → 기존 문서
- 이번 조사에서는 소스·테스트·설정 파일을 수정하거나 테스트를 실행하지 않았다.

## 최신 검증

- PR #7은 `d09e508d8a1f34e7af52adda5645eb5b40a3bc68`로 `main`에 병합되었다.
- Preview 정적 자산 수정 PR #8은 unit test, 문법 검사, CI 서버 Playwright, Preview 배포, `plan-policy.mjs` 직접 응답까지 성공했지만, 최신 Preview Playwright 재실행은 iPhone WebKit의 모듈 import 오류와 account state access-control 오류로 실패했다.
- Preview의 `/plan-policy.mjs`는 `200 OK`와 `text/javascript`를 반환하며, 존재하지 않는 `.mjs` 요청은 HTML fallback 없이 `404`를 반환한다.

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
| A1 | 1단계 — 인증 안정화 | Kakao·Naver·Google 가입/로그인, 세션 유지, 로그아웃 | 진행 중 | `auth-service.mjs`에 3개 Provider·세션 쿠키·계정 API가 있고 PR #2/#3에 테스트 근거가 있으나 실제 Provider 계정 검증과 현재 HEAD CI는 없음 | `auth-service.mjs`, `auth-service.test.mjs`, PR #2/#3/#6 | 최신 `main` 기준으로 실제 계정·세션 수동 검증 범위 확정 |
| A2 | 1단계 — 인증 안정화 | Apple 로그인 | 진행 중 | 현재 `PROVIDERS`에는 Kakao·Naver·Google만 존재하며 Apple Provider 구현·검증 근거를 찾지 못함 | `auth-service.mjs`, `app.html` | Apple 콘솔 설정과 구현 여부를 별도 목표로 확인 |
| A3 | 1단계 — 인증 안정화 | 계정 격리, 탈퇴, 재로그인 정책, 인증 실패 처리와 테스트 | 진행 중 | 서버 계정·탈퇴 흐름과 테스트가 존재하고, 작업 트리에는 계정별 localStorage 격리 및 AI 인증 테스트가 미커밋 상태임. PR #5가 Provider 재인증·Apple revoke·동의 증적을 잔여 차단으로 기록 | `auth-service.mjs`, `worker.mjs`, `auth-service.test.mjs`, `tests/e2e/storage-recovery.spec.js`, PR #5/#6 | 미커밋 변경을 최신 `main`과 대조한 뒤 실제 계정 정책 검증 |
| B1 | 2단계 — 결제·구독 | Pricing, 무료 체험, Pro 권한, AI 크레딧 정책 | 진행 중 | PR #5가 `origin/main`에 병합되었고 PR 설명에 85/85 단위·34/34 문법·브라우저 회귀 근거가 있으나 독립적인 최신 CI/Preview status는 없음 | PR #5, `index.html`, `app.html`, `auth-service.mjs` | 병합된 `main` 기준 정책과 현재 PR #6의 중복 범위 비교 |
| B2 | 2단계 — 결제·구독 | 결제 성공·실패, webhook, 환불, 해지·갱신, 중복 결제 방지 | 차단 | 코드에 Toss billing·해지·갱신 경로는 있으나 `PAYMENTS_ENABLED=false`이고 Toss 승인·sandbox 실패/환불·webhook·실결제 검증 근거가 없음 | `auth-service.mjs`, `worker.mjs`, PR #5 | 외부 결제 콘솔·sandbox 검증 전에는 결제 활성화나 재구현을 하지 않음 |
| C1 | 3단계 — 모바일 UX | 오늘·계획·올리·기록 탭과 주요 실행 흐름 | 진행 중 | `app.html`과 `script.js`에 탭·계획·기록·올리 흐름 및 E2E가 존재하고, 현재 작업 트리에 모바일 이미지·스크롤 관련 변경이 미커밋 상태임 | `app.html`, `script.js`, `styles.css`, `tests/e2e/*`, PR #3/#6 | 최신 기준으로 최소 모바일 회귀 범위만 확인 |
| C2 | 3단계 — 모바일 UX | 반응형·접근성·로딩/빈 상태/오류 상태·실기기 UX 검증 | 미확인 | Playwright 회귀 근거는 있으나 기존 Preview 수동 QA 문서의 항목은 모두 `미검증`이며 실제 iPhone/Galaxy/iPad 검증 결과가 없음 | `docs/pr-preview-manual-qa.md`, `tests/e2e/responsive.spec.js`, PR #3 댓글 | 실기기 수동 QA 한 번만 수행하고 결과를 기록 |
| D1 | 4단계 — 출시 준비 | 개인정보처리방침·이용약관·고객지원·계정 탈퇴 라우트 구현 | 완료 | PR #3 검증 댓글에 양 도메인의 `/privacy`, `/terms`, `/support`, `/delete-account` 200 응답과 Preview/Production 회귀 결과가 기록됨 | `privacy.html`, `terms.html`, `support.html`, `delete-account.html`, PR #3 | 법무·사업자 문구의 최종 수동 승인만 별도 확인 |
| D2 | 4단계 — 출시 준비 | 도메인·HTTPS·Preview/Production 배포 경로와 운영 health 검증 | 진행 중 | `origin/main`에 Preview/Production workflow와 production Wrangler 설정이 존재하고, PR #3의 과거 production 성공·도메인 200 근거는 있으나 PR #5 병합 이후 최신 배포 증거는 없음 | `.github/workflows/*`, `wrangler*.jsonc`, PR #3/#6 | `origin/main` 최신 커밋의 CI·Preview·Production 결과를 한 번에 확인 |
| D3 | 4단계 — 출시 준비 | 환경변수 분리, 보안 헤더, 전체 회귀 CI, 앱 아이콘·스토어 자료·롤백 절차 | 진행 중 | 환경변수 이름과 보안 헤더 구현 일부는 존재하지만 현재 보안 헤더 변경·Preview 설정은 미커밋이고, 관련 status 조회가 비어 있음. 스토어 자료·롤백 실행 기록은 확인하지 못함 | `worker.mjs`, `wrangler*.jsonc`, `.assetsignore`, PR #6 | 출시 체크리스트에서 코드 근거와 외부 운영 근거를 분리 |

### 1단계 완료 조건

Apple을 포함한 필요한 Provider의 실제 가입·재로그인·세션 유지·로그아웃을 검증하고, 계정 A/B 격리·탈퇴·재로그인 정책과 인증 실패를 실제 Preview에서 확인하며 관련 CI가 최신 기준으로 통과해야 한다.

필요한 수동 검증: Kakao·Naver·Google·Apple 실제 계정, 세션 만료·로그아웃, 탈퇴 후 재로그인, 최근 Provider 재인증과 Apple token revoke 정책.

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

1. Apple 로그인 구현·Provider 검증 근거가 없다.
2. Kakao·Naver·Google·Apple 실제 계정, 세션, 계정 격리, 탈퇴 후 재로그인 검증이 없다.
3. 결제는 `PAYMENTS_ENABLED=false`이며 Toss sandbox/live 승인·실패·webhook·환불·중복 결제·탈퇴 연계 검증이 남아 있다.
4. PR #6 현재 HEAD와 `origin/main` 최신 커밋에 대해 GitHub status/workflow 조회가 비어 있어 최신 CI·Preview 결과를 완료 근거로 삼을 수 없다.
5. PR #5 병합 이후의 Production 배포 상태와 최신 Preview URL을 확인할 근거가 없다.
6. 실기기 모바일 QA, 법무·사업자 문구 최종 승인, 운영 Secret/KV/AI 상태, SPF/DKIM/DMARC, 스토어 자료와 롤백 기록이 없다.

## 미확인 항목

- Apple OAuth 콘솔·callback·token revoke 설정
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

최신 `origin/main` `6245a77`을 기준으로 백업된 변경의 인증 관련 hunk만 새 인증 브랜치로 분리할 계획과 최소 파일 목록을 확정한다.

## 다시 수행하면 안 되는 작업

- PR #2/#3/#5에 이미 병합된 소셜 로그인, 배포 경계, SPA 라우팅, 가격·체험·크레딧 정책을 근거 없이 재구현하지 않는다.
- 최신 `main`을 포함하지 않은 PR #6을 기준으로 새 기능이나 새 브랜치를 계속 쌓지 않는다.
- 현재 상태에서 결제 활성화, Production 재배포, 브랜치 병합·삭제, worktree 삭제를 하지 않는다.
- 실제 Secret·토큰·비밀번호를 코드·로그·문서에 기록하지 않는다.
- 문서 정리 이후에는 위의 단일 다음 작업을 자동으로 시작하지 않는다.
