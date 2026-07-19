# 3B 계획 탭 모바일 UX 감사 및 구현 계획

기준: Production `9ab5cd207f46c00f45231a1af00b06d9db5b324e`, 2026-07-20 KST

## 읽기 전용 감사 결과

- 첫 화면은 목표, 상태, 지표 3개, 다가오는 일정 3개, `전체 계획 보기`, `계획 수정하기`를 한 카드에 담아 정보량이 많다.
- 320×568에서는 두 주요 진입 CTA가 모두 첫 viewport 아래에 있다. 375×812 이상에서는 두 CTA가 보이지만 같은 시각적 무게로 경쟁한다.
- 320·375·390·430px에서 가로 overflow는 없지만 계획 홈의 전체 문서 높이는 약 1,150~1,270px다.
- `전체 계획 보기`는 별도 detail 화면으로 전환되고, 월 이동과 날짜 선택 구조는 명확하다. 다만 375px에서 달력 카드 높이가 약 1,021px이며 날짜 상세가 달력 아래에 열려 긴 이동이 필요하다.
- 계획 수정은 별도 editor 화면으로 전환되며 현재 계획 → 요청 입력 → 제안 적용의 3단계 의미는 명확하다.
- 모바일 editor 높이는 약 1,230~1,308px, 전체 문서 높이는 약 1,752~1,873px다. 자유 입력은 화면 아래쪽에 있어 진입 후 긴 스크롤이 필요하다.
- `전체 일정 재조정`, `계획 수정 제안받기`, `적용하기`, `취소하고 기존 유지`가 같은 화면에 있어 상태가 비활성이어도 CTA 계층이 복잡하다.
- 세부 조건은 `details` 하나로 묶여 있지만 내부 필드가 많다. 중첩 카드는 심하지 않으나 editor 자체가 하나의 큰 카드라 단계 경계가 약하다.
- 가상 키보드 실기기 검증 근거는 없다. 입력창이 페이지 하단에 있고 고정 탭바가 있으므로 iPhone Safari/Galaxy Chrome에서 키보드·탭바 충돌 검증이 필요하다.

## 보존해야 할 계약

- 화면: `[data-plan-screen]`, `[data-plan-back]`, `planOpenDetailButton`, `planOpenEditorButton`
- 개요: `planOverviewGoal`, `planOverviewStatus`, `planOverviewPeriod`, `planOverviewWeek`, `planOverviewRhythm`, `weeklyPlanList`
- 달력: `scheduleCalendar`, `calendarMonthTitle`, `calendarSummary`, `previousCalendarMonth`, `currentCalendarMonth`, `nextCalendarMonth`, `calendarDayDetail*`
- 수정: `journeyPlanEditor`, `planPreviewList`, `planRevisionRequest`, `regeneratePlanButton`, `acceptPlanButton`, `keepPlanButton`, `reviseAgainButton`, `planEditorMessage`
- 데이터: `pendingPlanText`, `pendingRevisionRequest`, `pendingRevisionDetails`, `revisionRequest`, `revisionDetails`, 완료 상태와 계정별 저장 형식
- 기능: 제안 전 원본 계획 불변, 사용자 승인 후 적용, 취소 시 기존 계획 유지, AI 크레딧 예약·실패 환불 정책

## 3B 구현 계획

1. 계획 홈을 목표·이번 주 요약·다음 핵심 일정로 축약하고 primary CTA를 `전체 계획 보기` 하나로 둔다. `계획 수정하기`는 secondary text action으로 낮춘다.
2. 320×568에서도 목표와 primary CTA가 첫 viewport에 보이도록 장식 이미지, 지표 문구, 카드 padding을 줄인다.
3. 전체 계획 화면은 월 요약과 달력을 먼저 보여주고 날짜 상세를 달력 아래 긴 카드 대신 인라인 또는 하단 sheet로 단순화한다. 월 이동·오늘 버튼과 기존 calendar selector는 유지한다.
4. 계획 수정 화면은 현재 계획 요약 → 수정 요청 입력 → 제안 확인의 단계별 disclosure로 바꾼다. 자유 입력과 빠른 요청을 먼저, 세부 조건과 전체 재조정은 보조 영역에 둔다.
5. 제안이 없을 때 적용·취소 영역은 숨기고, 제안 생성 후에만 비교 요약과 `적용하기` primary, `기존 유지` secondary를 노출한다.
6. 입력 focus 시 탭바와 충돌하지 않도록 visual viewport/`dvh` 기반 여백을 검증하되 신규 scroll listener나 라이브러리는 추가하지 않는다.
7. 320×568, 360×800, 375×812, 390×844, 430×932와 200% 텍스트에서 overflow, 첫 CTA, 달력 탐색, editor 입력, keyboard focus를 E2E로 보강한다.
8. 기존 ID, 저장 데이터, 승인 흐름, AI 크레딧 정책을 유지하고 `app.html`, `styles.css`, `script.js`, 계획 관련 E2E만 최소 수정한다.

## 구현 시작 조건

- 3A Production 검증 완료: 충족
- 3B 기준 브랜치가 최신 main에서 생성됨: 충족
- 실기기 키보드 기준 정의: 구현 중 Preview에서 iPhone Safari·Galaxy Chrome 수동 검증 필요

