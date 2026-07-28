# 온보딩 전면 개편 설계 — "유저가 만드는 계획 + 올리는 치어링" 전환

- 작성일: 2026-07-27 (KST)
- 근거: 현재 작업 트리(`codex/detailed-plan-editor`, 미커밋 변경 포함)의 소스 직접 분석
- 목적: ① 수동 계획 수립에 재사용할 수 있는 기존 자산 목록화 ② 새 온보딩 구조 설계 ③ 수정해야 할 계약(코드·문서·카피) 전체 목록

---

## 0. 결론 요약

**새 온보딩에 필요한 "수동 계획 빌더"의 부품은 이미 90% 만들어져 있다. 위치가 잘못되어 있을 뿐이다.**

지금 구조는 "온보딩에서 간단 입력 → AI가 계획 생성"인데, 유저가 원하는 1(목표)·2(해야 할 일)·3(리소스)·4(기간)를 **직접 입력받는 폼이 이미 앱 안의 '계획 수정' 화면에 전부 존재한다** (`app.html`의 세부 조건 설정 폼). 또한 유저가 만든 주간 계획을 전체 기간 스케줄로 펼치는 엔진(`buildSchedule`)은 **AI 없이 100% 로컬로 동작한다**. 따라서 개편의 본질은 새 기능 개발이 아니라:

1. 계획 수정 화면의 상세 입력 폼을 **온보딩으로 이동**시키고,
2. AI 계획 생성(`/api/ai/goal-plan`)을 **온보딩에서 제거**하고,
3. AI 예산 전부를 **올리 소통(치어링)**으로 돌리는 **재배치 작업**이다.

---

## 1. 찾았다: 수동 계획 수립에 재사용 가능한 기존 자산

### A. 온보딩 3단계 위저드 (index.html `#designFlow` + script.js 1104~1333행) — 보존·확장

| 요소 | 현재 상태 | 재사용 판단 |
| --- | --- | --- |
| 스텝퍼 UI (`diagnosis-stepper`, 진행바, 단계 타이틀, 자동 진행) | 3단계: 목표 → 루틴 → 성향 | **그대로 보존.** 단계 수만 4로 확장 |
| 목표 입력 (`#designGoal`) + 카테고리 칩 6종 (시험/운동/영어/독서/창업/습관) | 칩 클릭 시 목표·기간·시간대·실행성향 자동 채움 | **그대로 보존.** 새 구조의 1단계(목표) 완성형 |
| `goalTemplates` (script.js 1108행) | 카테고리별 목표문장·기간·시간·현재상태·기존루틴 프리셋 | **보존 + 확장.** 할 일 프리셋까지 추가하면 수동 빌더의 스타터가 됨 |
| 기간 선택 (`#goalPeriod`: 7/14/30/90/100/180일) + 시간대 (`#routineTime`) + 실행 스타일 (`#routineReadiness`) | 2단계에 존재 | **그대로 보존.** 새 구조의 "4. 목표 달성 기간" |
| 성향 입력 (생년월일/출생시간/출생지/MBTI) | 3단계 (선택) | **온보딩에서 제거.** 앱 안에 이미 동일 기능(`#personalitySheet`, 좌측 메뉴 "성향 설정")이 있으므로 중복. 온보딩은 계획 완성에만 집중 |
| Live Preview 패널 (`#firstStep`) | 입력할수록 요약 갱신 → AI 결과 표시 | **골격 보존.** "AI 결과 미리보기"에서 "내가 만든 계획 요약"으로 역할 변경 |
| 자동 진행 로직 (`queueDiagnosisAutoAdvance`), 유효성 검사, 퍼널 이벤트(`sendFunnelEvent`) | 동작 중 | **그대로 보존** (퍼널 스텝 정의만 갱신) |

### B. ★ 핵심 발견 — 계획 수정 화면의 "세부 조건 설정" 폼 (app.html 431~563행)

유저가 요청한 **1. 목표 / 2. 해야 할 일 / 3. 리소스 / 4. 기간** 구조가 여기 이미 전부 구현되어 있다. 지금은 "AI 변경안 요청"의 입력으로만 쓰이는데, 이걸 온보딩의 수동 계획 빌더로 옮기면 된다.

| 이미 있는 입력 필드 | 새 온보딩에서의 역할 |
| --- | --- |
| `#revisionGoalType` — 목표 유형 9종 (시험·학습/창업/커리어/운동/습관/콘텐츠/재무/기타 + 자동 판단) | 1단계: 목표 유형 |
| `#revisionResources` — "활용할 자료·도구·사람·예산" textarea | 3단계: 가지고 있는 리소스 |
| `#revisionOutcome` — "언제까지 어떤 상태가 되면 완료인가요?" | 목표 완료 기준 (측정 가능한 목표) |
| `#revisionWeekdayMinutes` / `#revisionWeekendMinutes` — 평일/주말 하루 실행 가능 시간 | 2단계: 하루 가용 시간 |
| `#revisionPreferredTime` — 집중하기 좋은 시간 | 2단계: 실행 시간대 |
| 요일 체크박스 7개 (`data-revision-day`) | 2단계: 실행 요일 선택 |
| `#revisionIncreaseFocus` / `#revisionDecreaseFocus` / `#revisionKeepRules` / `#revisionConstraints` | 선택 입력: 우선순위·제약 |

관련 로직도 재사용 가능: `collectRevisionDetails()`, `applyRevisionGoalProfile()`(목표 유형별 라벨·힌트 자동 변경, script.js 3056행), `detectRevisionGoalType()`(목표 문장에서 유형 자동 감지, 3040행).

### C. 새 일정 추가 시트 (app.html `#addScheduleSheet`, 831~848행)

제목 / 시간 / 예상 시간(10·20·30·60분) / 완료 기준 — **유저가 할 일 하나를 수동으로 정의하는 폼이 이미 완성**되어 있다. 새 온보딩의 "해야 할 일 목록 빌더"는 이 폼을 반복 사용하는 것으로 충분하다.

### D. ★ 로컬 스케줄 엔진 — AI 없이 완전 동작 (script.js 2428~2674행)

- `buildSchedule()`은 **요일별 주간 템플릿(`weeklySchedule`)을 받으면 전체 기간(7~100일)의 날짜별 스케줄로 자동 전개**한다 (2439~2459행, `structuredByDay` 경로). 휴식일 처리, 요일 매칭까지 포함.
- `weeklySchedule`의 항목 형식은 `{ day: "월", isRestDay: false, tasks: [{ time, durationMinutes, task, completionRule }] }` — **ai-plan-revision이 출력하던 것과 동일한 스키마**다. 즉 이 계약(스키마)을 그대로 두고 **생산 주체만 AI → 유저로 바꾸면 엔진 수정이 거의 필요 없다.**
- `getPlanBundle()` / `applySchedulePreferences()` / `prepareScheduleTasks()`: 체크 상태 보존, 시간 오버라이드, 우선순위 드래그 정렬, 커스텀 태스크 병합 — 전부 로컬.
- `remapCompletedChecks()`: 계획을 바꿔도 완료 기록을 보호 — 유저가 계획을 수시로 고치는 새 구조에서 그대로 가치 있음.

### E. 로컬 계획 템플릿 (script.js `getGoalPlanTemplates` 1588행 + `buildLocalAiPreview` 1631행)

목표 유형 6종별 첫 행동·주간 계획·페이스 문구가 이미 있고, 현재 "AI 실패 시 폴백"으로만 쓰인다. 새 구조에서는 **폴백이 아니라 스타터 템플릿**으로 승격: 유저가 목표 유형을 고르면 요일별 할 일 초안을 자동으로 채워주고, 유저가 그걸 수정·추가·삭제하며 자기 계획으로 만든다. "빈 화면 공포"를 없애면서도 AI 비용은 0원.

### F. 그 외 보존 자산

- 소셜 로그인 시트(`#authSheet`, 카카오/네이버/구글) — 새 구조의 "계획 완성 → 가입" 게이트로 위치만 이동.
- 24시간 체험 로직(`startTrialAccess`, `lockTrialExperience`, 페이월) — 트리거 시점만 변경.
- 올리 관계 시스템(XP·레벨·장소·여정 지도), 집중 타이머, 감정 다이어리, 달력 — 전부 로컬 동작이며 새 방향(계획 이행의 즐거움)의 핵심 자산. **손대지 않는다.**

---

## 2. 현재 AI 호출 지점과 비용 문제

| 엔드포인트 | 용도 | 토큰 상한 | 새 구조에서의 운명 |
| --- | --- | --- | --- |
| `POST /api/ai/goal-plan` (ai-goal-plan.mjs) | 온보딩 계획 생성 | 출력 3,000 | **제거.** 오류·비용의 주범. 무료 1회 제한(`GOAL_PLAN_LIMIT_REACHED`, `goalPlanGeneratedAt`)도 함께 제거 |
| `POST /api/ai/plan-revision` (ai-plan-revision.mjs) | 계획 변경안 | 출력 2,800 | **유지 (유료 보조).** "유저가 만든 계획을 올리가 다듬어주기" — 에너지 3~5 소비처로 적합. 스키마 그대로 |
| `POST /api/ai/companion-chat` (ai-companion-chat.mjs) | 올리 대화 | 출력 700 | **주인공으로 승격.** 컨텍스트 확장 필요 (아래 4장) |

참고: 현재도 AI 3종 모두 로그인 필수(401)라서, "온보딩(비로그인·로컬) → 가입 후 AI 소통"이라는 새 흐름과 서버 계약이 자연스럽게 맞는다.

---

## 3. 새 온보딩 설계 — 수동 계획 빌더 4단계

> 원칙: 온보딩에서 AI 호출 0회. 모든 단계 로컬 저장(localStorage). 가입은 계획 완성 후에만 요구.

**STEP 1 · 목표** (기존 1단계 그대로 + 유형)
- 목표 문장 입력 + 카테고리 칩 (기존 `#designGoal` + `goalTemplates`)
- 목표 유형은 `detectRevisionGoalType()`으로 자동 감지, 수정 가능
- 선택: 완료 기준 한 줄 (`#revisionOutcome` 이동 — "언제까지 어떤 상태면 성공인가요?")

**STEP 2 · 기간과 리듬** (기존 2단계 + 수정폼 필드 이동)
- 기간(`#goalPeriod`) / 시간대(`#routineTime`) / 실행 요일 체크 7개 / 평일·주말 가용 시간(분)
- 실행 스타일(`#routineReadiness`)은 "조금 더 맞춤 설정" 접힘 유지

**STEP 3 · 해야 할 일** ← 새로 조립하는 유일한 화면 (부품은 기존 것)
- 목표 유형 기준으로 `getGoalPlanTemplates` 확장판이 **요일별 할 일 초안 2~3개를 자동 채움**
- 유저는 `#addScheduleSheet` 폼(제목/시간/예상시간/완료기준)으로 추가·수정·삭제
- 요일 탭(월~일)으로 주간 템플릿을 편집 → 저장 형식은 기존 `weeklySchedule` 스키마 그대로
- 하루 합계가 STEP 2의 가용 시간을 넘으면 경고 배지 (로컬 계산)
- "일단 최소로 시작" 버튼: 하루 1개 10분 버전으로 축소 (기존 `needsLowFrictionStart` 사고방식 재사용)

**STEP 4 · 리소스와 다짐** (선택, 짧게)
- 가진 리소스(`#revisionResources` 이동), 피해야 할 제약(`#revisionConstraints` 이동)
- 지금은 계획에 직접 반영 안 되어도 저장 → 이후 올리 대화와 plan-revision의 컨텍스트로 사용

**완성 화면** (기존 `#firstStep` Live Preview 개조)
- "OO님이 직접 만든 N일 계획" — 오늘의 일정 / 주간 리듬 / 목표까지 로드맵 표시 (렌더러 재사용)
- CTA: **"올리와 함께 시작하기"** → `#authSheet`(소셜 로그인) → 가입 완료 → 체험 시작(`startTrialAccess`) → app.html
- 데이터는 기존 `omwExecutionPlan` + `weeklySchedule` 키에 `planSource: "manual"`로 저장 → 앱의 스케줄 엔진이 무수정으로 소화

**제거되는 것**: 성향(사주/MBTI) 단계 전체(앱 내 성향 시트로 일원화), AI 로딩 연출(`playAnalysisLoading`), "AI가 목표 설계 중" 카피, 무료 계획 1회 제한 로직.

---

## 4. AI 재배치 — 올리 = 치어링 메이트

올리 에너지는 이제 "계획 생성"이 아니라 "올리와의 소통"에 쓰인다.

| 소통 종류 | 구현 방식 | 에너지 | 비고 |
| --- | --- | --- | --- |
| 오늘 전부 완료 → 축하 | 로컬 연출(별 샤워·레벨업, 이미 존재) + **AI 축하 한마디** | 0 (하루 1회 자동) | companion-chat 재사용, 컨텍스트에 "오늘 완료율 100%" 전달 |
| 미완료/놓친 날 → 위로·재시작 제안 | 로컬 recovery 카드(이미 존재) + AI 위로 | 0 (하루 1회 자동) | 컨텍스트에 놓친 일정·연속일수 전달 |
| 유저가 먼저 말 걸기 (자유 대화) | companion-chat | **1** | 현재와 동일 |
| 내 계획 다듬어달라기 | plan-revision | **3** | "AI가 만든 계획 수정" → "내 계획을 올리가 다듬기"로 의미 변경 |
| 주간 회고 + 다음 주 조언 | plan-revision 경량 호출 또는 chat | **5** | PRO 셀링 포인트 |

**companion-chat 계약 확장 (ai-companion-chat.mjs의 `context`)**: 현재 `{ goal, energy, todayFocus }` → `{ goal, energy, todayFocus, todayCompletion, missedTasks, streakDays, mood(다이어리 최근 감정), eventType: "celebrate" | "comfort" | "chat" }`. 출력 스키마(`headline`/`reply`)와 토큰 상한 700은 그대로 → 건당 비용 유지.

**비용 통제**: 자동 치어링(축하·위로)은 하루 각 1회로 제한하고 그 외에는 기존 로컬 카피 풀(`getCompanionCopy`, 이미 상황별 문구 존재)을 사용. 무료 체험 에너지 10 = 사실상 "올리와 대화 10번"으로 단순하게 소구.

**전환 흐름**: 체험 24시간 동안 올리 소통을 경험 → 만료 시 기존 페이월(`lockTrialExperience`)의 카피를 "올리와의 대화를 이어가려면"으로 변경 → PRO 월 2,900원 (매월 에너지 300 = 대화 중심으로 재소구).

---

## 5. 수정해야 할 계약 전체 목록

### 코드 계약
| 파일 | 수정 내용 |
| --- | --- |
| `worker.mjs` | `/api/ai/goal-plan` 라우트 및 `createGoalPlanForUser`(무료 1회 제한 포함) 제거. funnel 스텝 정의(`FUNNEL_STEPS`) 재설계: `goal → rhythm → tasks → resources → signup → trial_start` |
| `auth-service.mjs` | `user.goalPlanGeneratedAt` 필드·관련 응답 제거. 체험 시작 시점을 "가입 직후"로 서버 권위화 검토 |
| `ai-goal-plan.mjs` | 파일 제거(또는 보관용 이동). 테스트 함께 정리 |
| `ai-companion-chat.mjs` | context 확장 + eventType별 instructions 분기(축하/위로/조언) |
| `ai-plan-revision.mjs` | 스키마 유지. "현재 계획은 유저가 직접 만든 것"임을 instructions에 반영 |
| `script.js` | 온보딩: `runPersonalityAnalysis` → `saveManualPlan`으로 교체, `requestAiPlan`·`playAnalysisLoading`·`FREE_PLAN_GENERATED_KEY` 제거, 위저드 4단계 재구성, STEP 3 빌더 추가. 앱: 치어링 자동 호출 2종 추가 |
| `index.html` | `#designFlow` 4단계 개편, 성향 스텝 제거, Live Preview → 내 계획 요약 |
| `app.html` | 계획 수정 화면은 유지하되 온보딩과 필드 컴포넌트 공유. 에너지 안내 시트 문구 갱신 |

### 카피(화면 문구) 계약 — "AI가 만들어줘요" 약속 전면 제거
- index.html 히어로/앱 투어 슬라이드 01 "AI가 목표를 쪼개 오늘의 스케줄로 만들어요" → "내가 세운 계획을 올리와 함께 해내요"
- 전환 경로 4단계 카피(`trial-conversion-path`) "02 내 목표 입력 — 올리가 계획을 만들어요" → "02 내 계획 만들기 — 3분이면 충분해요"
- 프라이싱: 무료 체험 혜택 "AI 목표 계획 1개 생성" 제거 → "올리와 대화 10회" 등 소통 중심으로
- 에너지 요금표(간단 수정 1 / 오늘 재생성 3 / 주간 최적화 5 / 전체 재설계 10) → 대화 1 / 계획 다듬기 3 / 주간 회고 5로 재정의

### 문서·정책 계약
- `docs/pricing-system-v1.md`: 플랜 혜택·에너지 비용표·단위경제 가드레일 재산정 (goal-plan 3,000토큰 호출이 사라지므로 마진 개선 — 700토큰 대화 중심으로 재계산)
- `docs/spec.md` / `docs/wireframe.md` / `docs/plan.md`: 온보딩 플로우 전면 갱신 (특히 spec.md 미해결 질문 3번 "AI 생성이 핵심인가, 템플릿 기반인가"에 대한 답이 이번 결정)
- 이용약관·개인정보처리방침: "AI 생성 계획" 관련 서술이 있다면 소통 기능 중심으로 점검 (법률 문구 최종 판단은 별도 검토)
- 관리자 대시보드 퍼널 지표 정의 갱신
- 작업 종료 시 `docs/PROJECT_STATUS.md` 갱신 (AGENTS.md 규칙)

---

## 6. 실행 순서 제안 (AGENTS.md: 한 대화 = 한 단계)

1. **이 설계 확정** — 문서를 docs/에 저장하고 방향 승인
2. **온보딩 개편 1차 (프론트 로컬만)** — 위저드 4단계 + STEP 3 빌더, AI 호출 없이 `weeklySchedule` 생성·저장까지. 기존 앱 화면은 무수정으로 호환 확인
3. **가입 게이트 이동** — 계획 완성 → authSheet → 체험 시작. 퍼널 스텝 교체
4. **서버 계약 정리** — goal-plan 제거, auth-service 필드 정리, 문서 갱신
5. **올리 치어링 강화** — companion-chat 컨텍스트 확장 + 축하/위로 자동 1회 호출
6. **카피·프라이싱·약관 일괄 정비** 후 PROJECT_STATUS.md 갱신

리스크 메모: 현재 작업 트리에 미커밋 변경이 섞여 있고 PR #6이 최신 main과 어긋나 있으므로(PROJECT_STATUS.md), 온보딩 개편은 **최신 main 기준 새 브랜치**에서 시작하는 것을 권장한다. styles.css(337KB)는 기존 클래스(`builder-field`, `revision-field`, `add-schedule-form` 등)를 재사용해 신규 CSS를 최소화한다.
