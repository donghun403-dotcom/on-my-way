# 수동 온보딩 재적용 계획 — main 구조 조사 보고서

작성일: 2026-07-27
대상 브랜치: `feature/manual-onboarding-on-main` (베이스 `75822e7` = `origin/main`)
참조 구현: `feature/manual-onboarding` (핵심 커밋 `cf3e4b9`)
공통 조상: `825321f`

이 문서는 **조사 결과만** 담는다. 온보딩 코드 수정은 다음 단계에서 한다.
모든 행 번호는 이 브랜치(=main) 기준이며, 참조 브랜치 쪽은 `ref:`로 표기한다.

---

## 0. 요약

가장 중요한 발견 세 가지.

1. **참조 브랜치가 만든 가입 게이트의 서버 쪽 요구사항은 main에 이미 다 있다.**
   체험 시작은 `/api/ai/trial/start`(worker.mjs:1322)로 이미 서버 권한이고 로그인을
   요구한다. 첫 로그인 시 게스트 데이터 승계도 `switchAccountStorageScope`의
   `allowAnonymousMerge`(script.js:611)로 이미 구현돼 있다. 새로 만들 게 아니라
   **UX만 바꾸면 된다**(현재 `window.confirm()` 사용).

2. **디자인 토큰 충돌은 거의 없다.** 참조 `styles.css`가 쓰는 CSS 커스텀 속성 61개 중
   main에 없는 것은 `--font-title`, `--font-card-title` 두 개뿐이다. main의 토큰
   레이어(188개)가 사실상 상위집합이라, 우려했던 스타일 전면 재작업은 불필요하다.

3. **진짜 위험은 동명이인 함수다.** 두 브랜치 모두 정의하는 함수 이름이 181개이고,
   그중 최소 12개는 시그니처가 다르다. 특히 `switchAccountStorageScope`는 양쪽 의미가
   정반대다(참조판은 대상 스코프를 비우고, main판은 익명 데이터를 병합한다).
   이름이 같아 조용히 덮어쓰면 로그인 시 데이터가 사라진다.

---

## a. 온보딩 진입 → 계획 생성 → 앱 실행 데이터 흐름

### 저장 계층

계획은 `localStorage`의 `omwExecutionPlan` 한 키에 **압축 코덱**으로 저장된다.

| 함수 | 위치 | 역할 |
| --- | --- | --- |
| `readExecutionPlan()` | script.js:4944 | 저장분 디코드 |
| `writeExecutionPlan(plan)` | script.js:4974 | 인코드 + 왕복 검증 + 용량 검사 후 저장 |
| `encodeExecutionPlanForStorage` | script.js:4866 | 문자열 풀 + 정의 테이블로 압축 |
| `decodeExecutionPlanFromStorage` | script.js:4913 | 역변환 |

`writeExecutionPlan`은 저장 전에 **왕복 검증**을 한다(script.js:4978-4992).
`scheduleOccurrences`, `firstWeekSchedule`, `aiPreview.scheduleOccurrences`,
`aiPreview.firstWeekSchedule` 네 필드를 인코드→디코드한 결과가 원본과 정확히
일치하지 않으면 `Execution plan schedule codec round-trip failed`로 던진다.
용량이 `accountStateByteLimit`을 넘어도 던진다(4993-4994).

> **포팅 제약**: 수동 빌더가 만드는 일정 구조는 이 코덱이 왕복 가능한 형태여야 한다.
> 임의 필드를 넣으면 `extra`로 빠지긴 하지만(4763), 필드 순서·타입이 어긋나면 즉시 예외다.

### 일정 항목 계약

`encodeScheduleItem`(script.js:4749-4779)이 인식하는 필드:

```
id, scheduledAt, planId, type, title, sourceReference, quantityOrRange,
completionRule, time, status, recurrenceGroupId, durationMinutes
```

그 외 키는 `extra` 객체로 보존된다. `type`은 `"ACTION"` 값을 쓴다(script.js:795 참조).

### 계획 활성화 seam

**`buildActivatedExecutionPlan(draftPlan, draftInput, scheduleStartPreference)`
(script.js:791)이 온보딩 산출물이 앱 실행 계획으로 바뀌는 단일 지점이다.**
여기가 수동 빌더를 붙일 곳이다.

입력으로 `draftPlan.firstWeekSchedule`(요일별 `items` 배열, `type === "ACTION"`인
항목에서 `planId`와 `title`을 추출)과 `draftInput`을 받아 아래 형태를 만든다.

```js
{
  ...plan,
  planId, goal, period, currentState, routineReadiness, routineTime,
  currentRoutine, mbti, firstAction, coachMessage, material, availability,
  planningPreferences, scheduleStartPreference,
  aiPreview: plan,                 // 원본 초안 보관
  planSource: "ai-reviewed-draft", // ← 수동 빌더는 다른 값을 써야 한다
  createdAt: new Date().toISOString(),
}
```

호출자는 `activateReviewedGoalDraft()`(script.js:819)이고, `sessionStorage`의
`onmyway:pending-goal-draft` / `onmyway:pending-goal-preview`를 읽어 검증한 뒤
활성화한다. 수동 빌더는 이 두 세션 키를 채우거나, `activateReviewedGoalDraft`를
대체하는 경로를 새로 만들어야 한다.

### P0.6 로드맵 도메인과 v5 완료 원장

`c842e6c` "feat(ai): land P0.6 roadmap domain and v5 completion ledger" 한 커밋이
4,576줄을 추가했다(script.js에만 +2,324). 관련 모듈:
`ai-material-contract.mjs`(409), `ai-output-contract.mjs`(466),
`ai-plan-output-policy.mjs`(1,087), `guest-plan-draft-object.mjs`(498).

완료 원장 코덱은 `encodeExecutionCompletionLedger`(script.js:5441) /
`decodeExecutionCompletionLedger`(script.js:5642)이고, 실행 상태는 별도 키
`omwExecutionState`에 저장된다(script.js:5968). 원장이 참조한 계획의 사본을
`omwExecutionLedgerPlan`에 따로 두는데, 계획이 교체돼도 기존 기록을 복원하기
위한 로컬 전용 키다(주석 script.js:315).

> **미확인**: 원장의 v4→v5 마이그레이션 세부와 Today 탭 렌더 체인 끝단은 이번
> 조사에서 코드를 끝까지 읽지 못했다. `migrateExecutionState`(시그니처가 main에서
> `(rawState, plan)`으로 바뀜)와 `buildSchedule`(script.js:6233)이 진입점이다.

### weeklySchedule

main에도 `weeklySchedule` 개념이 살아 있다. `buildSchedule(plan, planText,
revisionRequest = "", weeklySchedule = [])`(script.js:6233)의 네 번째 인자이고,
`ai-plan-revision.mjs`와 `ai-plan-output-policy.mjs`도 이 이름을 쓴다.
다만 **저장 계약의 주인공은 `firstWeekSchedule`과 `scheduleOccurrences`**이며
`weeklySchedule`은 일정 생성 입력으로 쓰인다. 참조 브랜치가 "기존 `weeklySchedule`
스키마에 저장한다"고 적은 부분은 main 기준으로 다시 매핑해야 한다.

---

## b. 제거 대상 분류 — 온보딩 전용 vs 공용 인프라

### worker.mjs 라우트 지도

`handleFetch`(worker.mjs:1239)의 분기 순서:

| 경로 | 위치 | 분류 |
| --- | --- | --- |
| `/api/health` | 1264 | 공용 |
| `/admin.html`, `/admin` | 1278 | 공용 |
| `/api/auth/*`, `/api/account/*`, `/api/billing/*`, `/api/admin/*` | 1293 | 공용 |
| `/api/ai/usage` | 1310 | 공용 (크레딧 잔량) |
| `/api/ai/trial/start` | 1322 | 공용 (가입 게이트가 그대로 쓴다) |
| `/api/ai/goal-analyze` | 1352 | **온보딩 전용** |
| `/api/ai/goal-preview` | 1356 | **온보딩 전용** |
| `/api/ai/goal-draft/revise` | 1360 | **온보딩 전용** |
| `/api/ai/goal-draft/claim` | 1364 | **온보딩 전용** |
| `/api/ai/*` 생성 라우트 | 1370 | 혼재 (아래 표) |
| `/api/funnel` | 1373 | 공용 |
| **catch-all → `fetchStaticAsset`** | **1402** | **공용 · 절대 제거 불가** |

`AI_GENERATION_ROUTES` 테이블(worker.mjs:161-166):

| 라우트 | action | 분류 |
| --- | --- | --- |
| `/api/ai/goal-analyze` | analyze_goal | **온보딩 전용** |
| `/api/ai/goal-plan` | create_plan | **온보딩 전용** |
| `/api/ai/companion-chat` | companion_chat | 공용 (인앱 올리) |
| `/api/ai/plan-revision` | revise_plan | 공용 (인앱 계획 수정) |
| `/api/ai/recovery-plan` | recovery_plan | 공용 |
| `/api/ai/reschedule-plan` | reschedule_plan | 공용 |

### 함수 분류

**온보딩 전용 (제거 후보)**

`handleGuestGoalAnalysis`(463), `handleGuestGoalPreview`(522),
`handleGuestGoalDraftRevision`(749), `handleGuestGoalDraftClaim`(967),
`guestDraftCapability`(194), `legacyGuestDraftCapability`(198),
`guestDraftCapabilityHash`(202), `guestDraftId`(206), `guestDraftPreviewResponse`,
`guestGoalPreview`, `guestDraftStub`, `validGuestDraftId`, `guestDraftCommand`,
`guestDraftApiError`, `guestGenerationOutcome`, `guestGenerationFailureResponse`,
`recordGuestGenerationFailure`, `guestGenerationPersistenceError`,
`activatedGuestPlan`, `upsertClaimedPlanForUser`, `guestPreviewIdentity`,
`normalizedScheduleStartPreference`

관련 모듈: `ai-goal-analysis.mjs`(292), `ai-goal-plan.mjs`(368),
`guest-plan-draft-object.mjs`(498) 및 각 테스트.

**공용 인프라 (반드시 보존)**

| 항목 | 근거 |
| --- | --- |
| `fetchStaticAsset`(1226) | worker.mjs:1402의 catch-all. **사이트 전체를 이걸로 서빙한다.** 제거하면 배포가 통째로 죽는다 |
| `hmacHex`, `sha256Hex`, `canonicalJson` | 게스트 초안 capability에 쓰이지만 범용 암호 유틸. 다른 사용처 확인 후 판단 |
| `env.AI_RATE_LIMITER` | 게스트 온보딩(486, 665, 856)뿐 아니라 **관리자 로그인**(1296-1299)도 사용 |
| `currentKstDateKey` | 일자 단위 집계용. 크레딧 회계와 공유 가능성 있음 |
| `aiErrorBody`, `publicAiResult`, `providerMetadata`, `readBoundedJson` | 모든 AI 라우트의 공통 응답/에러 헬퍼 |
| `handleAiGenerationRequest`(1112) | companion-chat·plan-revision 등 공용 라우트가 통과하는 단일 진입점 |
| `ai-credits-service.mjs`(993) | `/api/ai/usage`와 인앱 AI 모두 사용 |

**제거 순서 주의**: `handleAiGenerationRequest`는 온보딩 전용 라우트와 공용 라우트를
같은 테이블로 처리한다. 라우트 테이블에서 `goal-analyze`·`goal-plan` 항목만 지우고
핸들러 자체는 남겨야 한다.

> **미확인**: `hmacHex`/`sha256Hex`/`canonicalJson`과 `currentKstDateKey`가 게스트 초안
> 외에 실제로 어디서 쓰이는지 호출부를 전수 확인하지 못했다. 제거 전 grep 필수.

---

## c. main의 로그인 핸드오프를 가입 게이트로 쓸 수 있는가

**판정: 재사용 가능 (UX 조정만 필요).** 서버 계약은 손댈 필요가 없다.

### 이미 있는 것

**1) 체험 시작 — 서버 권한 확인됨**
`/api/ai/trial/start`(worker.mjs:1322)는 POST 전용이고 세션 사용자가 없으면
`AUTH_REQUIRED`(401)로 거절한다(1326). `startAiTrial({ store, userId })`를 호출하고
갱신된 사용자에서 `trialStartedAt`, `trialExpiresAt`, `trialUsedAt`, `trialEndedAt`을
돌려준다(1338-1341). 즉 **체험 시작 시각이 가입 계정 기준으로 서버에서 정해진다** —
참조 브랜치가 요구한 그대로다. 클라이언트 진입점은 `startTrialAccess()`(script.js:697).

**2) 게스트 데이터 승계 — 이미 구현됨**
`switchAccountStorageScope(targetScope, { allowAnonymousMerge })`(script.js:611)가
스코프 전환을 담당한다. 로그인 시 호출부는 script.js:1732:

```js
switchAccountStorageScope(getAccountStorageScope(authUiState.user),
                          { allowAnonymousMerge: Boolean(authUiState.user) })
```

승계 조건은 script.js:628 — `allowAnonymousMerge && 대상이 user: && 익명 데이터 있음
&& 대상 스코프가 비어 있음`. 조건이 맞으면 익명 스냅샷을 계정 스냅샷으로 복사한다.

스코프 대상 키는 `ACCOUNT_SCOPED_STORAGE_KEYS`(script.js:317-329):
`omwTrialAccess`, `omwFreePlanGenerated`, `omwPersonalityProfile`,
`omwPersonalityNudgeDismissed`, `omwExecutionPlan`, `omwExecutionState`,
`omwCompanionState`, `omwCompanionEvents`, `omwFocusSession`, `omwExecutionTheme`,
`omwExecutionLedgerPlan`. 계획과 기록이 모두 포함되므로 승계 범위는 충분하다.

**3) 로그인 의도 보존 — 이미 구현됨**
`PENDING_AUTH_INTENT_KEY = "onmyway:pending-auth-intent"`(script.js:307)를
**sessionStorage**에 저장한다(2557, 2569 기록 / 2521 복원 / 2536, 2578 정리).
전용 상수도 있다: `FULL_PLAN_AUTH_INTENT_SOURCE = "anonymous-plan-preview"`,
`FULL_PLAN_AUTH_INTENT_PURPOSE = "unlock-full-plan"`, TTL 10분(308-310).
"계획 완성 → 로그인 → 원래 자리로 복귀" 흐름이 이미 이 키로 돈다.

### 바꿔야 하는 것

| 항목 | 현재 main | 가입 게이트 요구 |
| --- | --- | --- |
| 승계 확인 UI | `window.confirm()`(script.js:629) — 네이티브 차단 대화상자 | 게이트 흐름에 맞는 UI. 또는 게이트 경유 시 무조건 승계 |
| 승계 조건 | 대상 계정이 **비어 있을 때만**(628) | 가입 직후엔 항상 비어 있어 실질 문제 없음. 단 재로그인 시 게스트 계획은 승계 안 됨 — 의도된 동작인지 확인 필요 |
| `openAuthSheet` | main은 `({ message, focusStatus })` 인자를 받는다 | 참조판은 무인자 호출 — 호출부 수정 필요 |
| `app.html?auth=start` | main의 진입 파라미터 처리 확인 필요 | 게이트가 이 URL로 넘긴다 |

> **미확인**: `app.html?auth=start` 쿼리를 main이 어떻게 해석하는지, 그리고
> `?auth=login&redirect=admin`(worker.mjs:1283)과 같은 파라미터 체계와 어떻게
> 맞물리는지 확인하지 못했다.

---

## d. ai-plan-revision.mjs — 두 판본의 의도 차이와 병합 방침

### 내보내는 API

| | 공통 조상 `825321f` | 참조 브랜치 | main |
| --- | --- | --- | --- |
| `createAiPlanRevision` | `(input, { apiKey, model, fetchImpl })` | 동일 | `(input, { apiKey, model, fetchImpl, timeoutMs })` |
| `PLAN_REVISION_SCHEMA` | — | — | 있음 |
| `validateRevisionOutput` | — | — | `(input, revision)` |
| 파일 크기 | 46행에 export | 131행에 export | 454행 (28/257/340행에 export) |

### 각 판본의 의도

**참조 브랜치 — 프롬프트(입력) 쪽을 키웠다.**
커밋은 `6b0077e` "Build detailed AI plan revisions", `402ffc4` "Adapt plan revisions
to each goal type" 둘뿐이다. export 위치가 46행→131행으로 밀린 것은 그 위에
프롬프트 구성 로직을 85행 추가했다는 뜻이다. API 표면은 조상과 동일하다.

**main — 출력 검증과 안전장치를 키웠다.**
`2e0e3b4` "enforce structured plan response contracts",
`0e6f7d3` "bound plan output size and token budgets",
`c842e6c` P0.6 로드맵 도메인, `2f515dc` 타입 게스트 초안, `6245a77` 가격·크레딧.
스키마(`PLAN_REVISION_SCHEMA`)와 출력 검증(`validateRevisionOutput`), 타임아웃을
추가했다.

### 병합 방침 제안

**두 방향이 대체로 직교한다.** 참조판은 입력/프롬프트, main판은 출력/검증을 건드렸다.
따라서:

1. **main을 베이스로 삼는다.** 스키마·출력 검증·토큰 예산·타임아웃은 운영 안전장치라
   포기할 수 없고, 참조판에는 대응물이 없다.
2. **참조판에서 프롬프트 구성 로직만 이식한다.** 목표 유형별 적응(`402ffc4`)과
   상세 수정 프롬프트(`6b0077e`)를 main의 프롬프트 빌드 구간에 얹는다.
3. **검증 통과 여부를 반드시 재확인한다.** 참조판 프롬프트가 유도하는 출력이 main의
   `validateRevisionOutput`과 `PLAN_REVISION_SCHEMA`를 통과하는지 실제로 돌려봐야 한다.
   여기가 유일한 실질 위험이다.

**제품 결정이 필요한 지점**: 온보딩에서 AI를 걷어내도 이 모듈은 **인앱 계획 수정**에서
계속 쓰인다(`/api/ai/plan-revision`, `/api/ai/recovery-plan`,
`/api/ai/reschedule-plan`). 즉 이 파일은 온보딩 개편의 제거 대상이 아니다.
참조 브랜치가 이 파일에 넣은 변경이 온보딩용이었다면 이식 자체가 불필요할 수 있다 —
이식 전에 참조판 변경의 사용처를 먼저 확인할 것.

---

## e. 4단계 수동 빌더를 main에 붙일 때 바꿔야 할 접점

### e-1. 마크업 — 골격은 호환된다 (난이도: 보통)

양쪽 모두 `.diagnosis-step[data-step-title]` 섹션 + `#diagnosisBackButton` +
`#goalPeriod`를 쓴다. main이 추가한 것은 위저드 크롬이다:
`.wizard-step`, `.wizard-header`, `.wizard-back`, `.wizard-step-badge`
(`#diagnosisStepCount` "1/3"), `.wizard-actions`, 그리고 우측 요약 레일
(`#wizardStepLabel`, `#wizardLiveGoal`, `#wizardLiveTiming`, `#wizardProgressValue`).

| | main (index.html) | 참조 (ref:index.html) |
| --- | --- | --- |
| 1단계 | 92-126 목표 이야기하기 (1000자, 카테고리, 예시) | 110-135 무엇을 시작해볼까요 |
| 2단계 | 129-163 올리가 정리했어요 (**AI 검토**) | 136-196 언제·얼마나 (기간/시간대/요일/분) |
| 3단계 | 164-214 자료·일정 (`data-advanced`) | 197-216 어떤 일 (`#taskBuilder`) |
| 4단계 | 215-251 초안 준비 (`data-advanced`) | 217-232 이대로 시작해볼까요 |
| 진행 CTA | `#goalAnalyzeButton` "올리에게 계획 부탁하기" (**AI 호출**) | `#diagnosisNextButton` "다음 단계" |
| 진행 표시 | `#diagnosisStepCount` 배지 | `#diagnosisProgressBar` 바 |

작업: main의 4개 `.diagnosis-step` 내용을 참조판 4단계로 교체, `#goalAnalyzeButton`
경로를 `#diagnosisNextButton` 진행으로 대체, 요약 레일은 수동 입력값에 맞게 재배선
또는 제거.

### e-2. 계획 저장 seam (난이도: 상당)

**단일 접점: `buildActivatedExecutionPlan`(script.js:791) → `writeExecutionPlan`(4974).**

- 수동 빌더 산출물을 `firstWeekSchedule` 형태로 만들어야 한다
  (요일별 `items[]`, 각 항목은 a절의 12개 필드 계약을 따른다).
- `planSource`를 `"ai-reviewed-draft"`가 아닌 값(예: `"manual-builder"`)으로 둘 것.
  이 값을 분기에 쓰는 곳이 있는지 확인 필요.
- `writeExecutionPlan`의 왕복 검증(4978-4992)을 통과해야 한다. **여기가 가장 깨지기
  쉬운 지점이다.**
- `activateReviewedGoalDraft`(819)는 AI 초안 전용 검증(미리보기 서명, 리비전 일치)을
  하므로 수동 경로는 이를 우회하는 별도 함수가 필요하다.

### e-3. 디자인 토큰 (난이도: 사소)

참조 `styles.css`의 CSS 커스텀 속성 61개 중 main에 없는 것은 **2개뿐**:
`--font-title`, `--font-card-title`. main의 188개 토큰이 상위집합이다.
두 토큰을 main의 대응 토큰으로 매핑하거나 추가하면 된다.

### e-4. 함수 충돌 — 최대 위험 (난이도: 상당)

참조 script.js 211개 / main 373개 함수 중 **이름이 겹치는 것이 181개**다.
그중 시그니처가 실제로 다른 것 12개 (이름만 보고 덮어쓰면 조용히 깨진다):

| 함수 | 참조 | main | 위험 |
| --- | --- | --- | --- |
| `switchAccountStorageScope` | `{ clearTarget }` | `{ allowAnonymousMerge }` | **의미가 정반대. 덮어쓰면 로그인 시 게스트 데이터 소실** |
| `migrateExecutionState` | `(rawState)` | `(rawState, plan)` | v5 원장 복원 실패 |
| `remapCompletedChecks` | `(prev, next, checkedByDay)` | `+ (completedLog, completedOccurrences)` | 완료 기록 유실 |
| `recordTaskCompletion` | `(state, dayPlan, taskIndex)` | `+ ({ actualMinutes })` | 실제 소요시간 유실 |
| `prepareScheduleTasks` | `(schedule, customTasksByDay)` | `+ (taskEditsByDay, hiddenTaskKeysByDay)` | 편집·숨김 상태 유실 |
| `openAuthSheet` | `()` | `({ message, focusStatus })` | 로그인 시트 메시지 |
| `requestAiPlanRevision` | `(payload)` | `(payload, action)` | 라우트 분기 |
| `requestCompanionReply` | `(message, { eventType })` | `(message)` | **치어링 이벤트 타입이 main에 없음 — 이식 필요** |
| `openCompanionChat` | `()` | `(event)` | 이벤트 인자 |
| `parsePlanText` | `(planText, fallbackAction)` | `+ (goal)` | 파싱 정확도 |
| `appendRevisionRequest` | `(text, response)` | `+ (action)` | 액션 분기 |
| `getPlanBundle` | `({ reset, customText, ... })` | 시그니처 추출 실패 | **정의 형태가 달라 별도 확인 필요** |

원칙: **이 12개는 main판을 유지하고, 참조판 호출부를 main 시그니처에 맞춘다.**
`switchAccountStorageScope`와 `requestCompanionReply`만 예외적으로 검토가 필요하다
(전자는 main이 우월, 후자는 참조판의 `eventType`을 main에 얹어야 치어링이 산다).

### e-5. 이식해야 할 참조 전용 함수 30개

참조에만 있는 함수. 성격별로:

- **수동 빌더 코어(11)**: `collectManualPlanInput`, `buildManualWeeklySchedule`,
  `buildManualPreview`, `updateManualPreview`, `saveManualPlan`, `getManualPlanStyle`,
  `buildStarterTasks`, `ensureBuilderTasks`, `renderTaskBuilder`,
  `getBuilderTaskMinutesTotal`, `updateTaskBudgetHint`
- **빌더 입력 보조(4)**: `getSelectedDesignDays`, `getDesignTimes`,
  `getTaskBuilderError`, `getEffectiveWeeklySchedule`
- **올리 치어링(10)**: `triggerOllieCheer`, `displayCheer`, `readCheerState`,
  `saveCheerState`, `consumeOllieEnergy`, `refundOllieEnergy`, `readOllieEnergyState`,
  `saveOllieEnergyState`, `getOllieEnergyPlan`, `getMonthlyEnergyReset`
- **체험 리드(3)**: `readTrialLead`, `saveTrialLead`, `initializeTrialReminderCard`
- **기타(2)**: `buildCompanionContext`, `getConsecutiveCompletedDays`

`buildManualWeeklySchedule`이 만드는 구조가 a절의 `firstWeekSchedule` 계약과
맞는지가 이식의 성패를 가른다.

### e-6. 내비게이션 (난이도: 미확인)

main은 `75822e7`로 스와이프 탭과 로그인 핸드오프를 바꿨다. 참조 빌더의 완료 경로
`app.html?auth=start`가 main의 현재 파라미터 체계와 맞는지 확인이 필요하다.
main은 `?auth=login&redirect=admin` 형태도 쓴다(worker.mjs:1283).

### e-7. 테스트 (난이도: 미확인)

참조 브랜치의 `tests/e2e/onboarding.spec.js`(1,137행 규모)와 `cheer.spec.js`는
참조 DOM 기준이다. main의 위저드 마크업에 맞춰 셀렉터를 다시 잡아야 한다.
이번 조사에서 내용을 확인하지 못했다.

---

## 미확인 항목 (다음 단계에서 확인할 것)

1. v5 완료 원장의 v4→v5 마이그레이션 세부와 Today 탭 렌더 체인 끝단
2. `hmacHex`/`sha256Hex`/`canonicalJson`/`currentKstDateKey`의 게스트 초안 외 호출부
3. `app.html?auth=start`의 main 측 처리
4. `getPlanBundle`의 main 정의 형태
5. 이름·시그니처가 모두 같은 169개 함수 중 **본문이 다른 것** — 이번 조사는 시그니처만
   비교했다. 실제 이식 시 본문 diff 필요
6. 참조 브랜치가 `ai-plan-revision.mjs`에 넣은 변경의 사용처 (온보딩용이면 이식 불필요)
7. `tests/e2e/*` 전반
