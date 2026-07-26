# P0.6 로컬 수용 기록 (Local Acceptance)

작업 브랜치: `codex/ollie-core-loop-production` (worktree: `.worktrees/plan-experience-overhaul`)

## 1. 중단 원인 분류

이전 세션에서 중단된 Playwright 실행은 **PRODUCT_ASSERTION_FAILURE** 였다.
P0.6에서 도입한 v5 완료 ledger(`completionLedger`, codec v2) 인코딩이 여러 상태
왕복(round-trip)에서 `saveExecutionState`의 codec round-trip 무결성 검증을 깨뜨렸다.
retry / skip / sleep / fixme / timeout 상향 / assertion 제거 없이 제품 코드에서
근본 원인을 수정했다.

## 2. 수정한 제품 결함 (script.js)

ledger encode/decode 왕복이 canonical 형태에서 어긋나던 지점들:

- `normalizeCompletedOccurrences` — occurrence를 (day, sourceIndex, taskKey) 정규 순서로
  정렬. 재체크로 뒤에 다시 추가된 occurrence의 순서 불일치 해소.
- `migrateExecutionState`
  - occurrence가 없으면 `completedOccurrencesPlanIdentity`를 공백으로 정규화
    (decode는 항상 `p`를 채우므로 정합).
  - planIdentity가 없는 legacy 완료 로그를 현재 계획 identity로 입양.
  - rollover 누락 수를 계획 일정 + `checkedTaskKeysByDay`로 계산(v5는 `checkedByDay`를
    ledger에서 재구성하지 않음).
  - 완료 로그의 표시 필드(time/text)를 canonical occurrence에 맞춰 backfill.
  - occurrence·plan 항목 모두 없는 해결 불가능한 active 로그는 비활성화(decode 동작과 일치).
- `normalizeCompletedLog` — decode가 만드는 필드 구성/순서와 동일하게 정규화하고
  time은 HH:MM 형식만 허용, text는 trim/240자 제한. legacy planIdentity 입양 지원.
- `encodeExecutionCompletionLedger` — 타 계획(foreign) 기록의 완료 상태 보존,
  log.time/text가 plan 항목과 다르면 자체 정의(self-def) 행으로 저장.
- `getExecutionState` / `saveExecutionState` — ledger가 참조한 계획 사본을
  로컬 전용 키 `omwExecutionLedgerPlan`에 함께 보존해, 계획이 먼저 교체돼도 기록 복원.
  사본까지 없으면 해결 불가능한 plan-참조 행만 건너뜀(앱 정지 방지).
- `defaultAutoMemoryForCompletion` / `recordTaskCompletion` — auto 메모리 필드를
  단일 소스로 통일(ledger delta 왕복 정합, note/mood/obstacle/nextStep/updatedAt 포함).

## 3. 백워드 호환 검증

v3 상태 → v5 저장 마이그레이션을 브라우저에서 재현:

- 첫 읽기 시 raw 저장소 원문 미변경(rewrite 없음).
- 완료 로그 / 일기 / Ollie 성장 / 미지의 확장 필드(legacyExtension) 전부 무손실 보존.
- 명시적 변경 후에만 version 5 + `completionLedger`로 저장.
- 손상(invalid JSON, wrong types, duplicate ids, invalid numbers) 상태도 안전 복구.

## 4. E2E 읽기 계약 갱신 (v4 → v5)

v5는 완료·일기·체크 상태를 `completionLedger`로 압축하고 raw 저장소에서는 제거하므로,
raw `omwExecutionState`를 직접 읽던 기존 스펙을 디코드 경로(`getExecutionState()`,
`getPlanBundle()`)로 갱신했다. **assertion 의미는 그대로 유지**했고, 저장 버전 기대값만
4 → 5로 정정했다(데이터는 보존, 위치만 ledger로 이동).

- `tests/e2e/today.spec.js`, `tests/e2e/records.spec.js`,
  `tests/e2e/ollie-memory-ux.spec.js`, `tests/e2e/storage-recovery.spec.js`

## 5. 로컬 게이트 결과

- 핵심 계약 / Worker route / availability revision 유닛: `node --test *.test.mjs` → 269 pass / 0 fail
- 전체 tracked JS/MJS/CJS `node --check`: 56 파일 / 0 실패
- `git diff --check`: clean
- 민감정보 패턴 스캔: 0
- E2E (Playwright, `E2E_BASE_URL`로 명시적 로컬 서버):
  - **desktop-chromium 전체**: 128 pass / 1 skip(의도된 모바일 전용 시트 테스트) / 0 fail
  - **mobile-chromium 전체**: pass
  - **iphone-webkit**: 파일 단위 완주 시 그린. 장시간 단일 프로세스 전체 실행에서
    사소한 테스트(탭 이동/중복클릭 가드)가 간헐적 `Test timeout`(빈 call log)으로
    정지 — Windows WebKit 부하성 flake(BROWSER_PROCESS), 제품 assertion 실패 아님.
    실행마다 실패 테스트가 이동하고 단독·desktop·mobile-chromium에서 항상 통과.
- 신규 skip / retry / fixme / sleep / ignore: 없음
- 기존 조건부 skip 1건(`plan.spec.js` 모바일 시트, `test.skip(!isMobile,...)`)은
  P0.6 이전부터 존재(HEAD에 동일).

## 6. 디자인·브랜드 회귀

P0.6는 도메인(저장/ledger) 작업으로 한정. 한국어 "올리" / 영어 "Ollie" 브랜드,
여기어때 잘난체 local asset, 시작 2입력(목표·기간) → Roadmap → 고정 후 Schedule →
Diary 자동기록 → Ollie Growth → 비처벌적 Recovery 흐름 및 시각 계약(native 컨트롤
비노출, overflow 0 등)은 관련 E2E(onboarding/plan/today/mate/modal/responsive)에서 유지.
