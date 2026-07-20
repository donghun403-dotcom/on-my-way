# 3C 올리·기록 모바일 UX 감사

감사 기준은 `main` `4ba88dfd6319062f4635d100e1ceb45a4a97d324`이다. 이 문서는 현재 구현을 읽기 전용으로 감사한 결과이며 3C 제품 구현 지시나 완료 보고가 아니다.

## 1. 감사 범위

- 코드: `app.html`, `script.js`, `styles.css`, `plan-policy.mjs`
- 테스트: `mate.spec.js`, `records.spec.js`, `plan.spec.js`, `today.spec.js`, `responsive.spec.js`, `storage-recovery.spec.js`
- viewport: 320×568, 360×800, 375×812, 390×844, 430×932, 768×1024, 1440×900
- 상태: 실제 계정이 아닌 합성 계획·관계·기록 2건을 사용했다.
- 증적: [`docs/artifacts/mobile-ux-stage3-ollie-memory/before`](artifacts/mobile-ux-stage3-ollie-memory/before) 아래 올리 7장, 기록 7장과 `metrics.json`
- 제외: 제품 코드, selector, 저장 형식, 서버, 결제, 인증, Production 설정 변경

스크린샷 14개의 합계는 4,876,497 bytes, 최대 파일은 `ollie-1440x900.png` 639,117 bytes다. 개인정보·실계정 정보는 포함하지 않는다.

## 2. 현재 올리 탭 정보 구조

현재 목적은 관계와 성장 표시다. 상단 소개 다음에 큰 올리 이미지·인사, 목표 메이트/장소·레벨, XP 막대, 다음 변화, `오늘 쓰다듬기`가 한 카드에 모인다. 이어서 `우리 사이 자세히 보기`와 `성장 여정 지도` 두 `details`가 닫힌 상태로 배치된다.

첫 화면의 시각적 우선순위는 큰 캐릭터와 인사이며 행동 우선순위는 쓰다듬기다. 관계 단계는 홈의 레벨·다음 변화, 상세의 기분·함께한 날·관계 단계·XP, 여정의 현재 장소·다음 장소에서 반복된다. Pro 잠금은 닫힌 여정 안의 `PRO · 전체 여정` 링크로 노출된다.

중요한 불일치가 있다. `#view-mate`에는 `#openCompanionChat` 또는 `[data-open-companion-chat]`가 없으므로, 정책상 주 진입점이어야 할 올리 탭에서 대화를 바로 시작할 수 없다.

## 3. 현재 기록 탭 정보 구조

현재 흐름은 `STEP 1 · TALK` 대화 카드 → `STEP 2 · WRITE` 기록 카드다. 기록 카드는 실행률·오늘 대화 요약, 6개 기본 감정과 직접 입력, 한 장면 textarea, 선택 입력 `details`, 저장 CTA, 과거 기록·인사이트 `details` 순서다.

기록 탭은 `#openCompanionChat`을 첫 카드의 CTA로 두고 있어 현재 실제 대화 주 진입점 역할을 한다. 같은 답변을 `#memoryConversation`에서도 다시 보여 주므로 대화 진입과 요약이 한 탭에서 경쟁한다. 과거 기록과 성공 단서/인사이트는 닫힌 `details` 안에 있어 점진적 공개 방향은 이미 일부 적용됐다.

Free도 기본 기록을 저장한다. `detailedInsights=false`일 때 인사이트 목록은 숨기고 `#memoryPatternLock`을 보인다. 무료 체험과 Pro는 `plan-policy.mjs`의 Pro 기능 집합을 사용해 상세 인사이트를 볼 수 있다.

## 4. 핵심 사용자 동선

| 동선 | 현재 단계 | 관찰 |
|---|---:|---|
| 기록 탭 → 대화 | 1 tap | `#openCompanionChat`으로 직접 연다. |
| 올리 탭 → 대화 | 2 taps 이상 | 기록 또는 오늘 탭으로 이동한 뒤 CTA를 눌러야 한다. 올리 탭 자체 CTA는 없다. |
| 오늘 탭 → 대화/계획 조정 | 1 tap | `[data-open-companion-chat]`가 같은 sheet를 연다. |
| 대화 → 기록 | 자동 요약 + 탭 이동 | 성공 답변을 `omwCompanionEvents`에 저장하고 `#memoryConversation`에 반영한다. 기록 저장은 별도다. |
| 기록 저장 | 감정 → 한 장면 → 저장 | 제목·방해 요인·다음 행동은 선택 `details`다. |
| 기록 제안 → 계획 | 1 tap 후 Plan | `data-memory-apply`가 수정 요청을 추가하고 Plan editor로 이동한다. 계획은 자동 적용하지 않는다. |
| Today 완료 → 올리/기록 | 자동 파생 | 완료율은 올리 성장/여정과 기록의 실행률에 반영된다. |

## 5. 올리 탭 핵심 문제

1. 대화 CTA가 없어 `관계 + 대화 + 성장` 중 대화가 빠져 있다.
2. 320×568에서는 유일한 행동인 `#touchCompanion`의 상단이 698px라 첫 화면에 CTA가 하나도 없다.
3. 장소·레벨·다음 변화·관계 단계·XP·다음 장소가 세 블록에 반복돼 행동보다 상태 설명이 강하다.
4. 큰 캐릭터 장식이 모바일 첫 화면 높이 대부분을 사용한다. 4개 올리 PNG는 각각 약 856–887KB, 1085/1086×1448/1449로 실제 표시 크기보다 크다.
5. 데스크톱 1440×900에서도 고정 탭바가 쓰다듬기 CTA 영역과 겹쳐 보이는 시점이 있어, 고정 내비게이션과 콘텐츠 여백 계약을 재검증해야 한다.

## 6. 기록 탭 핵심 문제

1. 대화 카드가 첫 primary여서 기록의 핵심인 회고·저장보다 먼저 경쟁한다.
2. 저장 CTA는 모든 감사 viewport의 첫 화면 밖이다. 320px에서는 상단 1173px로 화면 높이의 약 2.1배 지점이다.
3. 6개 감정 + 직접 입력은 선택지가 많고, `.selected`만 바뀌어 `aria-pressed` 같은 선택 상태가 보조기술에 전달되지 않는다.
4. `memory-card > memory-compose-card`와 접힌 선택 입력/과거 기록/인사이트가 겹쳐 카드·공개 계층이 깊다.
5. 저장 후 `memorySaveButton.blur()`가 실행돼 초점의 명확한 다음 위치가 없다. toast는 `#appLiveRegion`으로 읽히지만 저장 CTA의 초점 유지·기록 목록 이동 정책은 없다.

## 7. 모바일 viewport별 문제

`문서 길이`는 합성 상태의 전체 페이지 높이이며 footer를 포함한다. 모든 viewport의 가로 overflow는 0px였다.

| viewport | 올리 문서 길이 | 기록 문서 길이 | 첫 화면 관찰 |
|---|---:|---:|---|
| 320×568 | 1,380px / 2.43 화면 | 1,733px / 3.05 화면 | 올리 CTA 없음. 기록은 대화 CTA만 보이고 저장은 1,173px. |
| 360×800 | 1,305px / 1.63 | 1,690px / 2.11 | 쓰다듬기와 대화 CTA는 보이나 기록 저장은 1,146px. |
| 375×812 | 1,305px / 1.61 | 1,690px / 2.08 | 기록 감정 두 번째 줄이 fold에 걸린다. |
| 390×844 | 1,305px / 1.55 | 1,690px / 2.00 | 저장은 1,147px로 fold 밖이다. |
| 430×932 | 1,305px / 1.40 | 1,654px / 1.77 | 올리 3개 상위 카드가 보이지만 기록 저장은 1,116px. |
| 768×1024 | 1,448px / 1.41 | 1,558px / 1.52 | 저장 CTA는 1,067px로 바로 아래 fold에 있다. |
| 1440×900 | 1,354px / 1.50 | 1,572px / 1.75 | 넓은 공간 대비 올리 상세 카드가 비어 보이고 탭바/CTA 중첩 위험이 있다. |

대화 sheet는 320×568에서 `clientHeight=538`, `scrollHeight=781`이며 최초 상태에서 textarea(520–630px)와 전송 CTA(644–698px)가 내부 스크롤 아래에 있다. 360px 이상에서는 키보드가 없는 상태로는 들어오지만, 실제 모바일 키보드 표시 시 usable viewport가 줄어드는 동작은 이번 합성 Chromium 감사로 확인할 수 없어 **Unknown**이다. CSS에는 `100dvh`, safe-area, `overflow-y:auto`가 있으나 `visualViewport` 대응이나 sticky 전송 CTA는 없다.

## 8. 유지해야 할 기능

- 올리 상태·인사, 쓰다듬기 중복 보상 방지, 관계 XP·레벨, 성장 장소
- 대화 상태 선택, 빠른 계획 조정, 자유 입력, AI 크레딧 정책과 실패 시 원본 계획 불변
- 오늘 실행률과 대화 요약을 기록에 연결하는 기능
- 감정 기본/직접 입력, 한 장면, 선택 제목·방해 요인·다음 행동
- 기록 저장·수정·삭제, 같은 날짜 업데이트, 과거 기록, 계획 수정 요청 연결
- Free 기본 기록, 체험/Pro 상세 인사이트 잠금 정책
- 4탭 구조와 tablist 키보드 이동

## 9. 점진적으로 숨길 기능

- 올리 홈에는 상태/인사와 대화 CTA를 남기고, 레벨·XP·함께한 날은 한 줄 관계 요약 또는 첫 `details`로 이동 검토
- 현재 장소·다음 장소·전체 여정·Pro 잠금은 하나의 성장 `details` 안에서만 노출
- 기록의 대화 카드는 큰 독립 카드보다 오늘 대화 요약/이어가기 링크로 축소
- 기록의 직접 감정 입력, 제목·방해 요인·다음 행동은 선택 공개 유지
- 과거 기록과 인사이트는 각각 닫힌 공개 수준을 유지하되 잠금 설명을 중복하지 않음

## 10. 삭제하면 안 되는 기능

이번 감사에서 삭제 대상으로 승인된 기능은 없다. 특히 관계 데이터, 여행 지도, Pro 잠금, 대화→기록 연결, 기록→Plan 제안 연결, 수정/삭제, account scope와 서버 동기화는 표시 위치를 바꾸더라도 보존해야 한다.

## 11. selector·ID 호환성 표

| 영역 | 유지 대상 | 의존 이유 |
|---|---|---|
| 탭/패널 | `#tab-mate`, `#view-mate`, `#tab-memory`, `#view-memory` | tablist, 키보드 이동, `plan.spec.js`, responsive 캡처 |
| 올리 홈 | `#companionHome`, `#companionHomeImage`, `#companionMoodLine`, `#companionMessage`, `#companionStage`, `#companionLevel`, `#companionXpBar`, `#touchCompanion` | 렌더·상호작용·mate/Today 테스트 |
| 관계/여정 | `#matePanel`, `#bondLevelName`, `#bondXpText`, `#bondXpBar`, `#journeyMapCard`, `#journeyMap`, `#journeyPlaceSummary`, `#journeyNextSummary` | 저장된 관계/완료율 렌더링 |
| 대화 | `#openCompanionChat`, `[data-open-companion-chat]`, `#companionChatSheet`, `#closeCompanionChat`, `#companionChatInput`, `#sendCompanionMessage`, `#companionChatResponse` | 공통 sheet, mate 테스트, Today 연결 |
| 기록 작성 | `#memoryForm`, `[data-memory-mood]`, `#memoryCustomMood`, `#memoryNote`, `#memoryOptionalDetails`, `#memoryTitle`, `#memoryObstacle`, `#memoryNextStep`, `#memorySaveButton`, `#memorySaveHint` | 입력·저장·편집 로직 |
| 기록 조회 | `#memoryCompletion`, `#memoryConversation`, `#memoryCount`, `#memoryList`, `#memoryPatternPanel`, `#memoryPatternLock`, `#patternList` | 완료율/대화/목록/권한 렌더와 records 테스트 |

새 UI는 ID를 교체하지 말고 기존 요소를 재배치하거나 래퍼를 최소 추가하는 방식이 안전하다.

## 12. 저장 데이터 호환성 표

| 키/필드 | 역할 | 변경 위험 |
|---|---|---|
| `onmyway.activeView` | 마지막 탭 복원 | 탭 이름 `mate`/`memory` 변경 시 복원 실패 |
| `omwCompanionState` | `level`, `xp`, `relationship`, `energy`, `mood`, touch 날짜 등 | 관계/보상 중복·마이그레이션 위험 |
| `omwCompanionEvents` | 대화·상태·쓰다듬기·기록 이벤트 최대 80건 | 오늘 대화 요약과 분석 단서 손실 위험 |
| `omwExecutionState.dailyMemories` | 최대 365개 기록과 감정·한 장면·대화·제안 | 기록 호환성의 핵심. schema 재작성 금지 |
| `omwExecutionState.completedLog`, `checkedByDay` | 실행률·성장·기록 요약 | Today/올리/기록 불일치 위험 |
| `omwExecutionPlan` | 목표와 일정 원본 | 대화/기록 제안이 승인 전 변경하면 안 됨 |
| `onmyway:active-scope` 및 `onmyway:{user|anonymous}:…:state` | 계정별 로컬 격리 | 다른 계정 데이터 노출 위험 |
| 서버 sync 6개 키 | 계획·실행·관계·이벤트·테마 동기화 | 서버 변경 없이 기존 키 집합 유지 필요 |

`omwExecutionState`, `omwCompanionState`, `omwCompanionEvents`는 account scope 및 `/api/account/state` 동기화 대상이다. 3C 1차는 저장 schema와 서버 API를 바꾸지 않아도 가능하다.

## 13. 테스트 의존성 표

| 테스트 | 현재 보장 | 공백 |
|---|---|---|
| `mate.spec.js` | 대화 실패 안전성, 크레딧 표시/일·월 한도 | 올리 탭 대화 CTA, 쓰다듬기, 여정 공개, focus/keyboard |
| `records.spec.js` | 빈 기록, Today 완료율, reload 복원 | 감정, 저장/수정/삭제, 대화 요약, Pro 잠금, 초점 |
| `plan.spec.js` | 4탭 클릭/키보드 이동 | 올리↔기록 의미 연결 |
| `today.spec.js` | 완료·XP 중복 방지와 companion state | 올리 탭 표시 계층 |
| `responsive.spec.js` | 8 viewport, 6 화면, 가로 overflow, screenshot | CTA 발견 시간, keyboard/visual viewport, details open 상태 |
| `storage-recovery.spec.js` | 손상 상태 복구, 계정 격리 | 3C 재배치 후 동일 selector/이벤트 유지 |

감사 검증으로 기존 `mate.spec.js`, `records.spec.js`, `responsive.spec.js` 13개가 통과했다. 측정 전용 임시 spec은 커밋하지 않는다.

## 14. 권장 통합 정보 구조

4탭은 유지한다. 무료 베타 데이터 전에는 기록을 올리 안에 합치지 않는다.

**올리 탭 — 관계 + 대화 + 성장**

1. 올리 상태 이미지와 짧은 인사
2. `올리와 이야기하기` 단일 primary CTA
3. 오늘의 관계 요약: 함께한 날·관계 단계·XP를 한 줄/한 진행률로 통합
4. 쓰다듬기는 secondary action
5. 성장/장소/Pro 잠금은 하나의 `details`로 점진 공개

**기록 탭 — 오늘 회고 + 저장 + 과거 확인**

1. 오늘 감정
2. 오늘의 한 장면
3. 선택 입력 `details`
4. 저장 CTA
5. 저장 후 오늘 대화 요약과 `올리에서 대화 이어가기` 링크
6. 과거 기록 `details`
7. 상세 인사이트와 잠금은 그 안에서 점진 공개

대화 결과는 `omwCompanionEvents`를 계속 단일 연결점으로 사용하고 기록에는 읽기 전용 요약을 붙인다. 성장 정보는 관계 행동의 결과, 기록 통계는 회고 패턴으로 이름과 위치를 분리한다.

## 15. 구현 우선순위

1. 올리 탭에 기존 공통 대화 trigger를 primary로 노출하고 320px 첫 화면 안에 배치
2. 올리의 반복 관계/장소 정보를 한 요약 + 한 성장 `details`로 정리
3. 기록 첫 화면을 감정·한 장면·저장 순서로 재배치하고 대화 카드를 요약 링크로 축소
4. 감정 선택 상태의 `aria-pressed`, 저장 후 초점, 대화 sheet 첫 초점 계약 보강
5. 실제 iOS Safari/Android Chrome에서 키보드·safe-area·주소창 변화 검증
6. 올리 PNG의 표시 크기에 맞는 자산 최적화는 별도 성능 변경으로 검토

## 16. 구현 범위

- `app.html`의 기존 올리/기록 DOM 재배치와 최소 래퍼
- `styles.css`의 320–430px 우선 계층·간격·CTA·details 조정
- `script.js`에서 기존 trigger 재사용, 선택 aria 상태, 저장/대화 초점 계약 보강
- 기존 저장 키·데이터 구조·서버 동기화 유지
- 기존 테스트 보존 + CTA/aria/focus/저장 핵심 회귀 추가
- before와 동일 viewport의 after 증적

## 17. 제외 범위

- 탭 통합 또는 삭제
- 서버/API/schema/migration 변경
- 관계 XP·보상·AI 크레딧·결제 정책 변경
- OAuth, Secret, KV, D1, route, custom domain, Production 설정 변경
- 올리 캐릭터의 새 기능·새 성장 단계 추가
- 실제 Web Analytics/Production 검증

## 18. 완료 기준

- 올리 탭에서 대화 primary를 1 tap으로 시작하고 320×568 첫 화면에서 발견 가능
- 관계/성장 정보의 반복을 줄이되 기존 값과 기능은 모두 접근 가능
- 기록 탭의 감정→한 장면→저장 순서가 첫 목적이 되고 대화는 요약/연결 역할
- 320–430px에서 가로 overflow 0, fixed 탭바가 마지막 CTA/콘텐츠를 영구 가리지 않음
- 실제 모바일 키보드에서 textarea와 전송/저장 CTA에 스크롤로 도달 가능하고 focus가 복원됨
- 감정 선택 상태가 보조기술에 노출되고 저장 완료가 live region으로 전달됨
- Free·체험·Pro 잠금/접근 정책 유지
- 기존 ID·저장 데이터·계정 격리·Today/Plan 동기화·테스트 유지
- 관련 단위/syntax/Playwright와 7개 viewport 증적 성공

## 19. 위험 요소

- DOM 재배치 중 기존 ID가 중복되거나 제거되면 광범위한 script/test 회귀가 발생한다.
- 대화 CTA를 복제할 때 동일 ID를 만들면 안 된다. 올리 탭에서는 `[data-open-companion-chat]` 같은 공통 trigger가 안전하다.
- 기록 저장·대화 이벤트 schema를 건드리면 account snapshot과 서버 sync 데이터가 깨질 수 있다.
- 고정 탭바와 bottom sheet는 CSS만 보고 실제 키보드/주소창 축소를 확정할 수 없다.
- PNG 최적화는 품질·캐시·LCP 검증이 필요하며 정보 구조 변경과 분리하는 편이 안전하다.
- 첫 대화 초점은 실제 측정에서 `#closeCompanionChat`, 닫은 뒤 `#openCompanionChat` 복원이다. textarea 자동 초점을 원한다면 generic sheet 계약과의 충돌을 명시적으로 결정해야 한다.

## 20. 구현 전 승인 필요 사항

1. 4탭 유지와 “올리=대화 주 진입, 기록=회고/저장” 정책 확정
2. 쓰다듬기를 secondary로 낮추고 대화를 primary로 올리는 승인
3. 기록 대화 카드를 요약/이어가기 링크로 축소하는 승인
4. 올리 관계 요약에 남길 3개 값(권장: 함께한 날, 관계 단계, XP) 확정
5. 대화 sheet 최초 초점을 닫기 버튼으로 둘지 textarea로 둘지 접근성 결정
6. iOS Safari·Android Chrome 실기기 키보드 QA 환경 제공
7. PNG 최적화를 3C와 함께 할지 별도 성능 PR로 분리할지 결정

위 1–5의 제품·접근성 결정과 6의 실기기 검증 계획이 승인되면, 서버 변경 없는 3C 구현을 시작할 수 있다. 이번 감사에서는 구현을 시작하지 않았다.
