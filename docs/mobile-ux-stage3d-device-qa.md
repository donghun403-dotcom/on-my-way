# 모바일 UX 3D 실기기 QA

작성일: 2026-07-21 (KST)
상태 표기: `PASS`, `FAIL`, `BLOCKED`, `NOT RUN`, `UNKNOWN`

실제로 확인하지 않은 항목은 `PASS`로 기록하지 않는다. 이 문서는 실기기 QA의 실행 절차와 현재까지 확인된 자동 검증 결과를 함께 기록한다.

## 1. QA 범위

- Production 실제 iPhone Safari 및 Samsung Galaxy Chrome에서 Today, Plan, Ollie, Memory, 인증, 세션, 모바일 셸을 확인한다.
- Staging에서 전용 OpenAI 키가 안전하게 구성된 경우에만 계획 변경안 생성·적용을 정확히 1회 확인한다.
- 실제 기기에서 재현된 결함만 최소 범위로 수정한다. 새 기능, 인증·결제·서버 구조 변경은 범위 밖이다.
- 현재 결과: 실기기 접근 불가 및 Staging AI 미구성으로 핵심 수동 QA는 `BLOCKED`이다. 제품 코드 수정은 없다.

## 2. 기준 main SHA

- 저장소: `donghun403-dotcom/on-my-way`
- 기준 SHA: `442d3020d9182cb9042e70b7cd04e0e1d3503ac4`
- 브랜치: `qa/mobile-ux-stage3d-device-validation`
- 별도 worktree: `.worktrees/mobile-ux-stage3d-device-validation`

## 3. 환경 및 안전 설정

| 환경 | 확인 결과 | 상태 |
|---|---|---|
| Production custom domain | `environment=production`, `payments=false`, `accountStorage=true`, `ai=true`, Google/Kakao/Naver configured, Apple hidden, dev login disabled | PASS |
| Production workers.dev | 위와 동일 | PASS |
| Staging | `environment=staging`, `payments=false`, `accountStorage=true`, `ai=false`, Google configured, Apple hidden, dev login disabled | PASS |
| Production 보호값 | `PAYMENTS_ENABLED=false`, `ALLOW_DEV_LOGIN=false`, `ALLOW_DEMO_BILLING=false`, `APPLE_LOGIN_VISIBLE=false` | PASS |
| Production 변경 | 배포·Secret·KV/D1·route·domain·workflow 변경 없음 | PASS |

Production OpenAI 키를 조회하거나 Staging에 복사하지 않았다. 결제 요청도 실행하지 않았다.

## 4. 실제 기기 목록

| 플랫폼 | 제조사·모델 | OS | 브라우저 | 방향/화면 확대/글자 크기 | 네트워크 | 일시(KST) | 상태 |
|---|---|---|---|---|---|---|---|
| iPhone | UNKNOWN | UNKNOWN | Safari UNKNOWN | UNKNOWN | UNKNOWN | NOT RUN | BLOCKED |
| Galaxy | UNKNOWN | UNKNOWN | Chrome UNKNOWN | UNKNOWN | UNKNOWN | NOT RUN | BLOCKED |

현재 Windows 호스트에서 `adb`, `ideviceinfo`, `ios_webkit_debug_proxy`를 찾을 수 없었고 연결된 실기기나 원격 디버깅 세션을 확인할 수 없었다. 에뮬레이터 결과로 대체하지 않는다.

## 5. iPhone Safari 결과

전체 상태: `BLOCKED`

- 초기 진입 가로 overflow, notch·home indicator safe-area, 하단 탭바: `NOT RUN`
- Safari 주소창 축소·확장, 끝 스크롤, 화면 회전, 백그라운드 복귀: `NOT RUN`
- Today/Plan/Ollie/Memory 및 인증: `NOT RUN`
- 기기·OS·Safari 버전: `UNKNOWN`

실행 체크리스트:

1. Production에 테스트 계정으로 로그인하고 세로 방향에서 첫 화면과 네 탭의 가로 overflow를 확인한다.
2. 위·아래 끝까지 스크롤하며 notch, home indicator, 탭바, sticky CTA 겹침을 확인한다.
3. 주소창을 축소·확장하고 세로→가로→세로 회전 후 레이아웃과 스크롤 위치를 확인한다.
4. Ollie sheet를 열어 초기 초점, 닫기, 배경 닫기, focus restore를 확인한다. textarea를 직접 눌렀을 때만 키보드가 표시되어야 한다.
5. Memory 입력과 저장 CTA가 키보드에 가리지 않는지, 저장 후 초점·스크롤이 안정적인지 확인한다.
6. 앱을 백그라운드로 보냈다가 복귀하고 세션과 현재 탭을 확인한다.

## 6. Galaxy Chrome 결과

전체 상태: `BLOCKED`

- 공통 모바일 UI, 주소창 변화, 회전, 백그라운드 복귀: `NOT RUN`
- 시스템 뒤로 가기·Chrome back gesture·sheet 우선 닫기: `NOT RUN`
- Samsung 키보드 visual viewport와 CTA·탭바 겹침: `NOT RUN`
- 글자 크기 100% 이상과 고정·sticky 요소: `NOT RUN`
- 기기·OS·Chrome 버전: `UNKNOWN`

실행 체크리스트:

1. iPhone 공통 체크리스트를 동일하게 수행한다.
2. sheet가 열린 상태에서 시스템 뒤로 가기를 눌러 sheet만 먼저 닫히는지 확인한다.
3. sheet가 없을 때 브라우저 history가 정상 동작하고 탭 전환이 history를 과도하게 쌓지 않는지 확인한다.
4. 실제 사용 중인 Samsung 키보드로 Plan 자유 입력, Ollie 대화, Memory 기록을 각각 확인한다.
5. Chrome 주소창 축소·확장과 회전 후 fixed/sticky 요소의 위치를 확인한다.

## 7. Google 로그인 결과

- 로그인 시작, callback 복귀, 원래 위치 복귀: `NOT RUN`
- 새로고침 후 세션 유지, 로그아웃: `NOT RUN`
- 전용 실제 기기·계정이 제공되지 않아 전체 상태는 `BLOCKED`이다.

## 8. Kakao 로그인 결과

- 로그인, callback, 세션 유지, 로그아웃, 취소·거부 복귀: `NOT RUN`
- 전용 실제 기기·계정이 제공되지 않아 전체 상태는 `BLOCKED`이다.

## 9. Naver 로그인 결과

- 로그인, callback, 세션 유지, 로그아웃, 취소·거부 복귀: `NOT RUN`
- 전용 실제 기기·계정이 제공되지 않아 전체 상태는 `BLOCKED`이다.

인증 증적에는 실제 이메일, 사용자 이름, 공급자 ID, token을 남기지 않는다. 보고 명칭은 `Google test account A`, `Kakao test account B`, `Naver test account C`만 사용한다. 계정 격리는 계정 A 기록 생성 → 로그아웃 → 계정 B 비노출 → 계정 A 재로그인·복원 순서로 확인한다.

## 10. Today 결과

- 실기기 모바일 헤더, 오늘의 한 걸음 CTA, 일정 3개 제한·펼침, 완료·진행률, 탭바 비가림: `NOT RUN`
- 자동화 결과: mobile Chromium Today 4개 포함 targeted suite 통과 — `PASS`
- 전체 실기기 상태: `BLOCKED`

## 11. Plan 결과

- 실기기 Plan 홈, 날짜 sheet, 닫기·focus restore, 빠른 수정 6종, 자유 입력, 변경안 검토, 승인 전 원본 유지: `NOT RUN`
- Staging AI 변경안 생성·적용: `BLOCKED`
- 자동화 결과: mobile Chromium Plan 4개 포함 targeted suite 통과 — `PASS`

## 12. Ollie 결과

- 320px 첫 화면 대화 CTA, sheet, 초기 초점, 키보드, 내부 스크롤, 실제 CTA 복귀, secondary 동작, 관계 요약·성장 details: `NOT RUN`
- 자동화 결과: mobile Chromium Ollie·Memory 6개 중 Ollie 계약 통과 — `PASS`
- 전체 실기기 상태: `BLOCKED`

## 13. Memory 결과

- 감정 버튼 44px, `aria-pressed`, 한 줄 기록, 선택 입력, 저장 CTA, 저장 완료와 focus·scroll, 빈 저장 방지, 과거 기록: `NOT RUN`
- 자동화 결과: mobile Chromium Ollie·Memory 6개 중 Memory 계약 통과 — `PASS`
- 전체 실기기 상태: `BLOCKED`

## 14. 키보드 결과

- Plan 자유 입력, Ollie 대화, Memory 기록에서 입력창·CTA·탭바 비가림: `NOT RUN`
- iOS 자동 확대 여부: `UNKNOWN`
- Android visual viewport resize: `UNKNOWN`
- 코드 감사: Memory 모바일 입력은 `font-size: 16px`이지만 Ollie textarea는 상속값이며, `visualViewport`, `resize`, `orientationchange` 전용 처리는 없다. 이는 실기기 확인이 필요한 위험이지 확인된 결함이 아니다.

## 15. safe-area·주소창 결과

- notch/home indicator, 주소창 축소·확장, 회전, 배경 복귀: `NOT RUN`
- 코드 감사: safe-area inset과 `100dvh` 보완은 사용 중이다. viewport meta에는 `viewport-fit=cover`가 없다. 실제 영향은 `UNKNOWN`이며 선제 수정하지 않았다.

## 16. Staging AI 결과

- `/api/health`: `environment=staging`, `payments=false`, `accountStorage=true`, `ai=false` — 환경 확인 `PASS`, AI 실행 준비 `BLOCKED`
- GitHub Environment `staging`의 Secret 이름만 조회했으며 `OPENAI_API_KEY`는 존재하지 않는다. 값·prefix·길이는 조회하지 않았다.
- 변경안 생성, 승인 전 원본 불변, 명시적 적용, Today·Plan 동기화, 크레딧 처리: `NOT RUN`
- 원본 보존·크레딧 처리 코드 계약은 읽기 전용으로 확인했지만 실제 AI 실행의 대체 증거로 사용하지 않는다.

안전한 등록 절차:

1. GitHub 저장소의 `Settings` → `Environments` → `staging` → `Environment secrets`에서 Staging 전용 값으로 `OPENAI_API_KEY`를 추가한다.
2. 현재 guarded Staging workflow는 이 이름을 Worker에 동기화하지 않으므로, 별도 승인된 최소 workflow 변경으로 기존 validation, 임시 secrets file, 배포 후 Secret 이름 확인 목록에 `OPENAI_API_KEY`를 추가해야 한다.
3. 그 변경이 준비되기 전에는 Staging 배포를 실행하지 않는다. 직접 등록이 명시적으로 승인된 경우에만 다음 placeholder 형식을 사용할 수 있다.

```powershell
'<STAGING_OPENAI_API_KEY>' | npx.cmd wrangler secret put OPENAI_API_KEY --name on-my-way-staging --config wrangler.staging.jsonc
```

Production 키를 복사하거나 실제 값을 명령 기록에 남기지 않는다. 등록 후 `ai=true`를 확인해야 정확히 1회의 변경안 생성 검증을 시작할 수 있다.

## 17. payments=false 결과

- Production custom domain: `payments=false` — `PASS`
- Production workers.dev: `payments=false` — `PASS`
- Staging: `payments=false` — `PASS`
- 모든 Wrangler의 `PAYMENTS_ENABLED=false`: `wrangler.jsonc`, Preview, Production, Staging 모두 확인 — `PASS`
- 실제 결제 승인 요청 및 Toss 결제: 실행하지 않음 — `PASS`

## 18. 발견된 결함

| 등급 | 확인된 결함 수 | 비고 |
|---|---:|---|
| P0 | 0 | 실기기 미실행이므로 0은 확인됨 기준이며 부재 증명이 아님 |
| P1 | 0 | 동일 |
| P2 | 0 | 동일 |
| P3 | 0 | 동일 |

현재 확인된 제품 결함은 없다. 실기기·Staging AI 미실행은 결함이 아니라 QA 차단 조건이다.

## 19. 수정 내용

- 제품 코드 수정 없음.
- Production/Staging 배포 및 설정 변경 없음.
- QA 문서와 증적 수집용 결과 요약만 추가한다.

실기기 재현 결함이 생기면 기기, OS, 브라우저, 재현 단계, 기대/실제 결과, 빈도, 등급을 먼저 기록하고 keyboard/safe-area/viewport/focus/scroll/sheet lifecycle/history 범위에서만 최소 수정한다.

## 20. 자동 회귀 결과

- `npm test`: 130 passed / 0 failed / 0 skipped — `PASS`
- 전체 JavaScript `node --check`: 39개 확인 / 0 failed — `PASS`
- Today/Plan/Ollie/Memory/auth mobile 및 responsive Playwright: 37 passed / 0 failed / 0 did not run / 0 skipped — `PASS`
- 첫 local `webServer` 실행은 37개 본문을 모두 실행한 뒤 Windows teardown에서 종료되지 않아 명령 제한에 도달했다. 제품 실패로 분류하지 않고, 동일 테스트를 외부 로컬 서버와 명시적 PID 정리로 재실행해 exit code 0을 확인했다. 테스트 코드·assertion·skip은 변경하지 않았다.
- 전체 Playwright: 제품 코드 변경이 없어 실행 대상 아님
- 신규 skip·assertion 약화·request/console/CSP ignore: 없음
- targeted monitor 기준 console error 0, CSP error 0, unclassified product request failure 0

## 21. 잔여 Unknown

- iPhone·Galaxy 모델, OS, 브라우저 버전과 실제 화면 설정
- 실제 safe-area, 주소창 변화, 회전, 백그라운드 복귀
- 실기기 키보드 visual viewport, focus·scroll 안정성
- Google/Kakao/Naver callback·session·logout·계정 격리
- Staging AI 변경안 생성·적용·크레딧 결과
- Toss live key 부재는 공개 health에서 직접 판별할 수 없으며, 결제 비활성·요청 미실행만 확인했다.

### 증적 수집 방법

- iPhone: 제어 센터 화면 기록과 개인정보를 가린 스크린샷을 사용한다. Mac이 준비된 경우 신뢰된 기기를 Safari Develop 메뉴에 연결해 console/network를 확인한다.
- Galaxy: 시스템 화면 녹화와 개인정보를 가린 스크린샷을 사용한다. USB debugging을 승인한 테스트 기기를 데스크톱 Chrome `chrome://inspect/#devices`에 연결한다.
- 실패 시 viewport, visual viewport, focus, active element, scroll position만 기록한다. 콘솔에서 다음 관찰용 표현식을 사용할 수 있다.

```js
({
  viewport: [innerWidth, innerHeight],
  visualViewport: window.visualViewport
    ? [visualViewport.width, visualViewport.height, visualViewport.offsetTop]
    : null,
  activeElement: document.activeElement?.id || document.activeElement?.tagName || null,
  scrollY,
})
```

사용자 입력값, 이메일, token, Secret은 캡처하지 않는다. 원본 영상은 저장소에 커밋하지 않고 로컬 보관 위치만 문서화한다.

## 22. 비공개 베타 시작 가능 여부

판정: `BLOCKED` — 3D 미완료, 비공개 무료 베타 시작 불가.

다음이 모두 PASS일 때만 재판정한다.

- 실제 iPhone Safari 및 Galaxy Chrome 핵심 동선
- 키보드 CTA 가림 없음, safe-area·주소창 문제 없음
- Google/Kakao/Naver 로그인, callback, session, logout, 계정 격리
- Today/Plan/Ollie/Memory 핵심 동선
- Staging AI 변경안 생성·승인 전 원본 불변·명시적 적용·동기화 1회
- Production·Staging `payments=false`
- P0/P1 0, 베타 차단 P2 0
