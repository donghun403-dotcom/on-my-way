# 배포를 막는 e2e 실패 기록

`production.yml`은 **릴리스 Playwright 스위트를 통과해야** 배포한다. 그래서 변경과
무관한 테스트 하나가 깨져도 프로덕션 배포가 멈춘다. 그때마다 재실행으로 넘기면
같은 일이 반복되므로, 무엇이 언제 어떻게 깨졌는지 여기에 남긴다.

**재실행으로 넘어갔다는 것은 원인을 찾았다는 뜻이 아니다.** 아래 항목은 전부 미해결이다.

---

## 1. `plan.spec.js:179` — Roadmap 고정 요일 변경 (iphone-webkit)

**테스트:** `Roadmap 고정 요일 변경은 AI 재호출 없이 hard constraint를 적용한다`
**증상:** `expect(scheduledDays).toHaveLength(8)` 실패
**영향:** PR #106 머지 후 프로덕션 배포가 이 한 건 때문에 멈췄다
(`1 failed · 2 flaky · 827 passed`).

### 관측된 사실 (2026-09-18 CI, run 35358818364)

- **iphone-webkit에서만** 실패했다. 같은 실행의 `desktop-chromium` ·
  `mobile-chromium`은 통과했다.
- 재시도 2번을 포함해 **3번 모두 실패**했다. 그 환경에서는 우연이 아니었다.
- 같은 테스트를 **로컬 iphone-webkit에서 돌리면 통과**한다(2026-09-19 확인).

### 아직 모르는 것

처음에는 날짜 경계(CI 실행 시각이 한국시간 9/19 00:05였다)를 의심했으나
**그 설명은 증거와 맞지 않는다.** 이 테스트는 이미 자기 시계를 고정한다:

- `test.beforeEach`가 `page.clock.setFixedTime(ROADMAP_PREFERENCE_NOW)`를 부른다
- 픽스처 `createRoadmapPreferencePlan`의 날짜도 고정 상수에서 만든다

즉 앱이 보는 "오늘"은 실행 시각과 무관해야 한다. 그런데도 한 브라우저에서만
깨졌다. 그러므로 남은 가설은 **WebKit에서 시계 고정이 앱 부팅보다 늦게 걸리거나
일부 경로에 적용되지 않는 것**이고, 아직 확인하지 못했다.

### 조사할 때 먼저 볼 것

1. CI 환경에서만 재현되므로 로컬 반복 실행으로는 안 잡힐 수 있다.
   실패한 실행의 `test-failed-1.png`와 trace를 먼저 본다 — 화면에 며칠이
   그려졌는지가 곧 답이다.
2. `scheduledDays`의 실제 길이가 8보다 큰지 작은지로 갈린다. 모자라면 일부 날이
   과거로 밀려 걸러진 것이고, 넘치면 기준일이 당겨진 것이다.
3. `page.clock.setFixedTime`이 `prepareApp`(스토리지 주입)보다 **먼저** 불리는지,
   그리고 WebKit에서 그 순서가 지켜지는지 확인한다.

날짜 의존 픽스처의 선례는 `helpers.js`의 `completeManualPlan({ everyDay: true })`다
(PR #60). 다만 이 건은 그 부류가 **아닐 수 있으므로** 같은 처방을 바로 적용하지 마라.

---

## 함께 본 것 — 병렬 실행 부하 실패

같은 시기 전체 스위트에서 `auth` 3건과 `storage-recovery` 1건이 실패했는데,
`--workers=1`로 다시 돌리니 42건 모두 통과했다. 이쪽은 부하 탓이 분명하다.
CI 요약에서 `flaky`로 분류된 것들도 같은 부류로 보인다.

분류 요령: **`--workers=1`에서 통과하면 부하, 그래도 실패하면 진짜 버그다.**
