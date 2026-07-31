# execution-page 900 분류표

기준: `docs/execution-900-migration-plan.md`의 분류 규칙. 실측: 문서 끝의 베이스라인(2026-07-31, 390×844).
근거 열은 `app.html`·`script.js`에서 grep으로 확인한 실제 마크업이다. 셀렉터 이름만 보고
판정한 행은 없다. CTA 판정의 기준점: 기존 `.focus-start-button`이 이미
`var(--weight-display)`를 쓴다 — 화면의 단일 주요 CTA는 display를 따른다.

**사문(死文)**: DOM에 매칭 요소가 없는 선언. 배정은 구조가 말하는 역할대로 하되(무해),
메모에 남긴다. **유지(리터럴)**: 텍스트 위계가 아닌 글리프 캐리어 — 900 리터럴 + 사유
주석으로 남기고 래칫에서 빼지 않는다.

## Task 3 — 시트 헤더·계획·메이트·컴패니언 (11)

| # | 셀렉터 | 마크업 근거 | 배정 | 메모 |
| --- | --- | --- | --- | --- |
| 1 | `#myPageSheet > header span` | `<span>MY PAGE</span><h2>마이페이지</h2>` (app.html:170) — 킥커 짝 | emphasis | |
| 2 | `#personalitySheet > header span` | `<span>MY PROFILE</span><h2>성향 설정</h2>` (app.html:221) — 킥커 짝 | emphasis | |
| 3 | `.plan-adjust-sheet > header span` | `<span>계획 조정</span><h2>어떻게 바꿀까요?</h2>` (app.html:1109) — 킥커 짝 | emphasis | |
| 4 | `.plan-adjust-scope button` | 오늘만/이번 주 범위 토글 그룹 (app.html:1112) — 짧은 UI 컨트롤 | emphasis | |
| 5 | `.plan-undo-banner button` | 상태 배너 안 "실행 취소" 보조 동작 (app.html:1123) | emphasis | |
| 6 | `.plan-subview-header > div > span` | `<span>PLAN OVERVIEW</span><h1>전체 계획</h1>` (app.html:443) — H1 옆 킥커 | emphasis | |
| 7 | `#view-mate .companion-next-inline small` | `<small>다음 변화</small>` + `<strong>` (app.html:705) — 라벨 | emphasis | |
| 8 | `#view-mate .companion-touch-secondary` | "오늘 쓰다듬기 · XP +5" (app.html:657) — 주 버튼(companion-chat-primary) 옆 보조 버튼 | emphasis | |
| 9 | `.companion-relationship-heading > span` | `<span>오늘의 관계</span>` + `<strong>…이어온 시간</strong>` (app.html:660) — 킥커 짝 | emphasis | |
| 10 | `.companion-relationship-summary dd` | `<dt>함께한 날</dt><dd>…</dd>` (app.html:659) — 11px 통계값, "큰 숫자" 아님 | emphasis | 실측 11px |
| 11 | `.journey-pro-link` | "PRO · 전체 성장 여정 보기" 11px 링크 (app.html:727) | emphasis | 실측 11px |

## Task 4 — 기억 탭·올리 (12)

| # | 셀렉터 | 마크업 근거 | 배정 | 메모 |
| --- | --- | --- | --- | --- |
| 12 | `.memory-kicker` | `<small class="memory-kicker">오늘 돌아보기</small>` + `<h2>` (app.html:743) — 킥커 짝 | emphasis | |
| 13 | `.memory-mood-picker legend` | `<legend>1. 지금 마음과…</legend>` (app.html:751) — 폼 legend | emphasis | |
| 14 | `.memory-mood-picker button` | 감정 칩 버튼(😊 기쁨 등) (app.html:751) | emphasis | |
| 15 | `.save-memory-button` | `<button type="submit"><span>오늘의 한 장 저장하기</span>→` (app.html:776) — 기억 폼의 단일 주요 CTA | **display** | `.focus-start-button` 선례 |
| 16 | `.memory-ollie-guide::before` | `content: "오늘도 잘 왔어요"` (styles.css:12855) — **글리프 아님**, 말풍선 칩 텍스트 | emphasis | 계획의 글리프 후보였으나 텍스트로 판정. 올리 발화지만 문장 흐름이 아닌 칩 — 본문 보류(700) 아닌 emphasis. 이론(異論) 여지 메모 |
| 17 | `.memory-list-head span` | app.html·script.js에 `memory-list-head` 문자열 없음 | emphasis | **사문** — DOM 매칭 없음(2026-07-31). h3 옆 span 구조 상정 규칙 |
| 18 | `.memory-mood-badge` | `moodBadge.textContent = icon+label` (script.js:10178) — 엔트리 헤드 배지 | emphasis | |
| 19 | `.daily-memory-footer small` | `"내일을 위한 올리의 제안"` 라벨 (script.js:10215) | emphasis | |
| 20 | `.apply-memory-insight` | `"내일 계획에 반영"` 엔트리 푸터 보조 버튼 (script.js:10224) | emphasis | |
| 21 | `.memory-pattern-head > span` | `<span>올리의 발견</span><h3>…성공 단서</h3>` (app.html:895) — 킥커 짝 | emphasis | |
| 22 | `.memory-conversation-card span` | `<span>오늘 올리와 나눈 대화</span><h2>대화에서 남은 한마디</h2>` (app.html:781) — 킥커 짝, letter-spacing .08em | emphasis | |
| 23 | `.memory-conversation-card button` | `"올리와 이야기하기"` text-2xs 카드 보조 버튼 (app.html:788) | emphasis | |

## Task 5 — 달력·본드 (12)

| # | 셀렉터 | 마크업 근거 | 배정 | 메모 |
| --- | --- | --- | --- | --- |
| 24 | `.calendar-kicker` | `<small>OLLIE'S MONTH</small>` + `<h2>이번 달 진행</h2>` (app.html:451) — 킥커 짝 | emphasis | |
| 25 | `.calendar-month-nav button` | ‹/오늘/› 월 이동 버튼 (app.html:460) | emphasis | |
| 26 | `.calendar-weekdays em` | `<em>월</em>` 요일 글자 (app.html:467) — 라벨 | emphasis | |
| 27 | `.calendar-day strong` | 날짜 숫자, 13px (styles.css:12150) — 셀의 주 데이터, "큰 숫자" 아님 | **title** | 요일 라벨(600)보다 한 단계 위 유지. 13px 실측 근거 |
| 28 | `.calendar-day > small` | 날짜 아래 상태 표기, text-2xs (styles.css:12155) | emphasis | |
| 29 | `.calendar-day-detail-head strong` | `<strong id="calendarDayDetailTitle">선택한 날의 스케줄</strong>` (app.html:479) — 다이얼로그 제목(aria-labelledby 대상) | **title** | |
| 30 | `.calendar-day-detail-list i` | `status.textContent = "✓"` (script.js:8680) — 체크마크 캐리어 | **유지(리터럴)** | 글리프, 텍스트 위계 아님 |
| 31 | `.calendar-day-detail-list strong` | `time.textContent = 시간/n순위` (script.js:8682) — 행 메타 | emphasis | |
| 32 | `.calendar-day-detail-list li button` | `"수정"` 행 보조 버튼 (script.js:8687) | emphasis | |
| 33 | `.bond-kicker` | app.html·script.js에 `bond-kicker` 문자열 없음 | emphasis | **사문** — DOM 매칭 없음(2026-07-31) |
| 34 | `.bond-reaction` | `<span>♥ +5</span>` 리액션 칩 (app.html:692), 실측 11px | emphasis | |
| 35 | `.bond-next-unlock small` | 클래스 `bond-next-unlock` 없음 — id `bondNextUnlock`만 존재(다른 요소) | emphasis | **사문** — DOM 매칭 없음(2026-07-31) |

## Task 6 — 데이 페이지·다이어리 북 (15)

| # | 셀렉터 | 마크업 근거 | 배정 | 메모 |
| --- | --- | --- | --- | --- |
| 36 | `.day-page-heading small` | `<small>돌아보기</small>` + `<h2>하루 페이지</h2>` (app.html:794) — 킥커 짝 | emphasis | |
| 37 | `.day-page-step` | ‹/› 날짜 이동 버튼 (app.html:800) | emphasis | |
| 38 | `.day-page-retention button` | `"한 권으로 만들기"`, `"그 날 보기"` — 상태 공지 안 11px 보조 버튼 (script.js:9163) | emphasis | |
| 39 | `.day-page-stats small` | `createDayPageStat("그날의 마음", …)` 라벨 (script.js:9233) | emphasis | |
| 40 | `.day-page-note small` | `"한 줄 기록"` 라벨 (script.js:9249) | emphasis | |
| 41 | `.day-page-chat > summary` | `<details>` 접기 토글 (script.js:9202) | emphasis | |
| 42 | `.day-page-empty-actions button` | 빈 상태 안내 버튼 복수 (script.js:9276) — 단일 CTA 아님 | emphasis | |
| 43 | `.day-page-erase-start` | `"이 날 기록 지우기"` 파괴 플로 진입 버튼 (app.html:816) | emphasis | |
| 44 | `.day-page-erase-buttons button` | `"아니요, 둘게요"/"네, 지울게요"` 확인 쌍 (app.html:819) | emphasis | |
| 45 | `.diary-next-step span` | `"내일의 첫 장면"` 라벨 + `<strong>` (script.js:10199) | emphasis | |
| 46 | `.diary-book-head small` | `<small>올리 다이어리 북</small>` + `<h2>한 달을 한 권으로</h2>` (app.html:830) — 킥커 짝 | emphasis | |
| 47 | `.diary-book-month > span` | `<span>어느 달을 만들까요?</span>` + `<select>` 라벨 (app.html:840) | emphasis | |
| 48 | `.diary-book-create` | `<span>이 달을 한 권으로 만들기</span>` + 비용 `<b>` (app.html:846) — 카드의 단일 주요 CTA | **display** | `.focus-start-button` 선례 |
| 49 | `.diary-book-done-actions button` | `"다시 저장하기"/"원본 기록 정리하기"` 보조 쌍 (app.html:870) | emphasis | |
| 50 | `.diary-book-tidy-buttons button` | 확인 쌍 (app.html:876) | emphasis | |

## Task 7 — 포커스·태스크·수정 제안 (16)

| # | 셀렉터 | 마크업 근거 | 배정 | 메모 |
| --- | --- | --- | --- | --- |
| 51 | `.focus-task-copy > span` | app.html·script.js에 `focus-task-copy` 문자열 없음 (`focus-task-goal`만 존재) | emphasis | **사문** — DOM 매칭 없음(2026-07-31). 킥커 스타일(letter-spacing .08em, 2xs) |
| 52 | `.execution-checklist .execution-check::after` | `content: "✓"` (styles.css:11570) — 체크마크 | **유지(리터럴)** | 글리프, 텍스트 위계 아님 |
| 53 | `.task-content > span:not(.task-row-head)` | `content.append(head, text, minimum)` — `text`가 할 일 본문 (script.js:8440대), 12px | **title** | 행의 주 텍스트. 제목도 라벨도 아니지만 이웃(라벨 600·최소행동 700 리터럴)보다 내려갈 수 없어 title. 크기·색으로 위계 보완 |
| 54 | `.focus-mode-kicker` | `<span>올리랑 똑딱, 집중할 시간</span>` + `<h2>지금 할 한 가지</h2>` (app.html:1128) — 킥커 짝 | emphasis | |
| 55 | `.focus-time-adjust > button` | −/+ 5분 조정 버튼 (app.html:1132) | emphasis | |
| 56 | `.focus-time-adjust input` | 분 숫자 입력, 14px (styles.css:11737) — 스테퍼 값 | **display** | 이웃 라벨 span이 800 리터럴 — 값이 라벨보다 얇아지는 역전 방지 |
| 57 | `.task-edit-sheet label` | 일정 편집 시트 폼 라벨들 (app.html:1079대) | emphasis | |
| 58 | `.task-edit-scope legend` | `<legend>적용 범위</legend>` (app.html:1092) | emphasis | |
| 59 | `.sheet-secondary-button` | `"지금은 건너뛰기"` 보조 버튼 (app.html:1075) | emphasis | |
| 60 | `.revision-detail-intro strong` | `<strong>목표에 맞는 조정 기준을…</strong>` + `<p>` 설명, 13px (app.html:515) — 섹션 도입 제목 | **title** | |
| 61 | `.revision-detail-heading span` | `<span id="revisionOutcomeSectionTitle">완료 모습</span><small>힌트</small>` 12px (app.html:543) — id가 SectionTitle | **title** | |
| 62 | `.revision-field` | `<label class="revision-field"><span>어떤 종류의…</span><select>` (app.html:525) — 폼 라벨 | emphasis | |
| 63 | `.revision-days legend` | `<legend>실행 가능한 요일</legend>` (app.html:575) | emphasis | |
| 64 | `.revision-days span` | 요일 체크박스 라벨(월·화…) (app.html:575대) | emphasis | |
| 65 | `.revision-request-caption` | `<span>추가로 설명할 내용</span>` + textarea 캡션 (app.html:610) | emphasis | |
| 66 | `.proposal-detail-grid small` | `small = itemLabel` 요약 리스트 라벨 (script.js:10542) | emphasis | |

## 합계

| 배정 | 수 |
| --- | --- |
| emphasis (600) | 56 |
| title (700) | 5 |
| display (800) | 3 |
| **유지(리터럴)** | **2** |

**유지 합계 = 2** (#30 `.calendar-day-detail-list i`, #52 `.execution-check::after`).
→ 이관 완료 후 `styles.css`의 `font-weight: 900` 잔여 = 137 + **2** = **139**.

사문 4곳(#17 · #33 · #35 · #51)은 배정대로 이관한다 — 화면 영향 0이고, 남겨두면 래칫이
헛수를 지킨다. 삭제는 이 작업의 범위가 아니다.

## 베이스라인 실측 (이관 전, 390×844)

`node scripts/measure-execution-weights.cjs` 출력 원문. 측정 10/24 — 미측정 14곳은 기본
상태에 없는 요소(포커스 모드·달력 서브뷰·시트 내부·저장된 기억 필요)로, 판정은 위 표의
마크업 근거가 담당한다.

| selector | view | font-weight | font-size |
| --- | --- | --- | --- |
| `.bond-reaction` | mate | 900 | 11px |
| `.companion-next-inline small` | mate | 900 | 11px |
| `.companion-relationship-heading > span` | mate | 900 | 11px |
| `.companion-relationship-summary dd` | mate | 900 | 11px |
| `.companion-touch-secondary` | mate | 900 | 12px |
| `.journey-pro-link` | mate | 900 | 11px |
| `.memory-kicker` | memory | 900 | 11px |
| `.memory-mood-picker button` | memory | 900 | 11px |
| `.memory-mood-picker legend` | memory | 900 | 11px |
| `.save-memory-button` | memory | 900 | 12px |
