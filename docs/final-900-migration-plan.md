# 마지막 900 정리 구현 계획

> **에이전트 작업자에게:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development(권장)
> 또는 superpowers:executing-plans로 태스크 단위 실행. 각 단계는 체크박스(`- [ ]`)다.

**목표:** `styles.css`의 `font-weight: 900` 90곳을 전부 처리한다 — 사문 46곳은 규칙째
삭제하고, 살아있는 31곳은 역할 토큰으로 이관하며, 글리프 캐리어 13곳만 리터럴로 남긴다.

**접근:** 삭제와 이관은 성격이 다른 작업이라 분리한다. 삭제의 안전은 스크린샷 육안이
아니라 **계산값 전수 diff**로 증명한다 — 세 페이지 × 두 폭의 모든 엘리먼트에서
computed style이 한 글자도 바뀌지 않아야 커밋한다. 이관이 끝나면 숫자 래칫을
"남은 900은 전부 글리프 사유 주석을 달고 있어야 한다"는 계약 테스트로 승격한다.

**기술 스택:** 순수 CSS(`styles.css`), Node 내장 `node:test`(`fonts.test.mjs`),
Playwright(e2e + 계산값 스냅샷), 로컬 정적 서버(`serve-local.cjs`).

## Global Constraints

- 설계 문서: `docs/final-900-migration-design.md`. 이 계획은 그 설계를 구현한다.
- 역할 토큰은 기존 4단계만 쓴다: `--weight-body`(400) · `--weight-emphasis`(600) ·
  `--weight-title`(700) · `--weight-display`(800). 새 토큰을 만들지 않는다.
- 중간값(450·650·750)을 쓰지 않는다 — `fonts.test.mjs`의 6단계 계약 테스트가 막는다.
- 글리프 캐리어는 `font-weight: 900` 리터럴을 유지하고 바로 위에 `/* 글리프 굵기(…) —
  텍스트 위계 아님, 역할 토큰 비대상. final-900-classification.md #N */` 형식의 주석을 단다.
  주석 문구에 **`글리프 굵기`가 반드시 들어가야 한다** — 계약 테스트가 그 문자열을 찾는다.
- **인증·상태 머신·색 토큰·레이아웃을 건드리지 않는다.** 이 작업은 `font-weight` 값과
  사문 규칙 삭제만 다룬다.
- 작업 디렉터리: `.worktrees/final-900` (브랜치 `feat/final-900-migration`).
- 로컬 서버 포트는 **8772**를 쓴다. 8765는 다른 워크트리의 서버다 — **건드리지 않는다.**
- 이 계획의 `/tmp/…`는 **세션 스크래치패드**를 뜻한다. 저장소 안에 임시 파일을
  만들지 않는다. 각 태스크를 시작할 때 아래를 한 번 잡아 두고 `$TMP/…`로 읽는다.

  ```bash
  TMP="$TEMP/claude/C--Users-dongh-Documents-New-project-on-my-way/scratch" && mkdir -p "$TMP"
  ```
- e2e는 절대 `| tail`로 판정하지 않는다. 파이프하면 종료 코드가 `tail`의 것이 된다.
  로그가 필요하면 `> file.log` 로 받고 종료 코드를 따로 읽는다.
- 부하 플레이키가 의심되면 `npx playwright test --last-failed --workers=1`로 분류한다.
- 커밋은 사용자가 지시할 때만 한다. 각 태스크 끝의 커밋 단계는 지시가 있을 때 실행한다.

## 파일 구조

| 파일 | 책임 |
| --- | --- |
| `scripts/snapshot-computed-styles.cjs` (신규) | 계산값 스냅샷 + diff. 삭제 안전의 유일한 증거이자 관리자 화면의 유일한 자동 안전망 |
| `docs/artifacts/final-900-classification.md` (신규) | 살아있는 31곳의 배정 근거표. 셀렉터 이름이 아니라 마크업이 근거 |
| `docs/artifacts/final-900-deletion-report.md` (신규) | 삭제한 규칙 수·줄 수와 diff 0 증거 |
| `styles.css` (수정) | 삭제 238규칙 · 이관 31곳 · 글리프 주석 8곳 |
| `fonts.test.mjs` (수정) | 숫자 래칫 → 글리프 주석 계약 |
| `docs/design-tokens.md` (수정) | 잔여 수 갱신 + 글리프 규칙 명문화 |
| `docs/final-900-migration-design.md` (수정) | 실측으로 정정된 수치 반영 |
| `docs/artifacts/typography-foundation-measurements.md` (수정) | 이번 라운드 실측 잇대기 |
| `docs/PROJECT_STATUS.md` (수정) | 작업 기록 |

## 확정된 수치 (구현 전 실측)

| 갈래 | 수 | 비고 |
| --- | --- | --- |
| 삭제 | 선언 46 / **규칙 238개 · 1448줄** | 전체 19,259줄의 7.5%. @media 안 44개 |
| 이관 | **31** | 랜딩 22 · 관리자 8 · script.js 생성 1 |
| 글리프 유지 | **13** | 주석 보유 5, 신규 주석 8 |

검산: 46 + 31 + 13 = 90. 래칫 진행: **90 → 44 → 22 → 13**.

**손대지 않는 혼합 규칙 55개**: 사문 클래스가 살아있는 셀렉터와 콤마로 묶인 규칙이다.
규칙 자체는 살아있으므로 삭제하지 않는다. 셀렉터에서 사문 조각만 빼는 것은 렌더에
영향이 0인 미용 작업이라 이번 범위 밖이다.

---

### Task 1: 계산값 스냅샷 도구와 베이스라인

**Files:**
- Create: `scripts/snapshot-computed-styles.cjs`

**Interfaces:**
- Produces: CLI 두 가지 — `node scripts/snapshot-computed-styles.cjs <out.json>` (수집),
  `node scripts/snapshot-computed-styles.cjs --diff <a.json> <b.json>` (비교, 차이가
  있으면 **종료 코드 1**). Task 2가 이 두 가지를 그대로 쓴다.

- [ ] **Step 1: 포트가 비어 있는지 확인한다**

```bash
netstat -ano | grep -E ':8772\s' || echo "8772 비어 있음"
```

기대: "8772 비어 있음". 쓰이고 있으면 8773으로 올리고, 이 계획의 모든 `BASE`를 함께 바꾼다.

- [ ] **Step 2: 스냅샷 스크립트를 만든다**

`scripts/snapshot-computed-styles.cjs`:

```js
// scripts/snapshot-computed-styles.cjs
// 사문 CSS 삭제가 화면을 건드리지 않았음을 증명한다. styles.css를 쓰는 세 페이지를
// 두 폭에서 열고 모든 엘리먼트의 computed style을 DOM 인덱스 경로를 키로 담는다.
// 삭제 전후 diff가 0이어야 한다.
//
// 두 폭을 재는 이유: 삭제 대상 238개 중 44개가 @media 안에 있다. 한 폭만 재면
// 다른 폭에서만 적용되는 규칙의 삭제 영향을 통째로 놓친다.
// 세 페이지인 이유: styles.css를 로드하는 HTML은 index/app/admin 셋뿐이다
// (privacy·delete-account는 legal.css, core-loop-v2는 core-loop-v2.css).
//
// 사용:
//   PORT=8772 node serve-local.cjs &
//   node scripts/snapshot-computed-styles.cjs before.json
//   node scripts/snapshot-computed-styles.cjs --diff before.json after.json
const fs = require("fs");
const { chromium } = require("@playwright/test");
const { prepareApp, waitForAppReady } = require("../tests/e2e/helpers.js");

const BASE = process.env.BASE || "http://127.0.0.1:8772";
const PROPS = [
  "font-weight", "font-size", "font-family", "color", "background-color",
  "padding", "margin", "border-radius", "box-shadow", "display",
];
const PAGES = [
  { name: "landing", path: "/", app: false },
  { name: "admin", path: "/admin.html", app: false },
  { name: "app", path: "/app.html", app: true },
];
const WIDTHS = [390, 1280];

// 페이지 안에서 실행된다. 클로저를 쓰지 않아야 직렬화된다.
function collect(props) {
  const out = {};
  const walk = (el, path) => {
    const cs = getComputedStyle(el);
    out[path] = props.map((p) => cs.getPropertyValue(p)).join("|");
    let i = 0;
    for (const child of el.children) walk(child, `${path}>${child.tagName.toLowerCase()}[${i++}]`);
  };
  walk(document.body, "body");
  return out;
}

async function snapshot(file) {
  const browser = await chromium.launch();
  const all = {};
  for (const page of PAGES) {
    for (const width of WIDTHS) {
      const p = await browser.newPage({
        viewport: { width, height: 900 },
        baseURL: BASE,
        reducedMotion: "reduce", // 트랜지션 중간값이 스냅샷에 섞이지 않게 한다
      });
      if (page.app) await prepareApp(p);
      await p.goto(page.path);
      if (page.app) await waitForAppReady(p);
      else await p.waitForLoadState("networkidle");
      const data = await p.evaluate(collect, PROPS);
      for (const [k, v] of Object.entries(data)) all[`${page.name}@${width} ${k}`] = v;
      console.log(`  ${page.name}@${width}: ${Object.keys(data).length} 노드`);
      await p.close();
    }
  }
  await browser.close();
  fs.writeFileSync(file, JSON.stringify(all));
  console.log(`${file}: 총 ${Object.keys(all).length} 노드`);
}

function diff(aPath, bPath) {
  const a = JSON.parse(fs.readFileSync(aPath, "utf8"));
  const b = JSON.parse(fs.readFileSync(bPath, "utf8"));
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const rows = [];
  for (const k of keys) if (a[k] !== b[k]) rows.push({ k, before: a[k], after: b[k] });
  console.log(`노드 ${Object.keys(a).length} → ${Object.keys(b).length} · 차이 ${rows.length}`);
  for (const r of rows.slice(0, 40)) {
    console.log(`  ${r.k}\n    전: ${r.before}\n    후: ${r.after}`);
  }
  if (rows.length > 40) console.log(`  … 외 ${rows.length - 40}개`);
  process.exitCode = rows.length ? 1 : 0;
}

const args = process.argv.slice(2);
if (args[0] === "--diff") diff(args[1], args[2]);
else if (args[0]) snapshot(args[0]);
else { console.error("사용: <out.json>  또는  --diff <a.json> <b.json>"); process.exitCode = 2; }
```

- [ ] **Step 3: 서버를 띄운다**

```bash
PORT=8772 node serve-local.cjs > /tmp/serve-8772.log 2>&1 &
```

- [ ] **Step 4: 도구가 결정적인지 자기 검증한다**

같은 코드에서 두 번 재고 스스로와 비교한다. **이게 0이 아니면 도구를 신뢰할 수 없고,
삭제 전후 diff도 의미가 없다.** 먼저 해결하고 진행한다.

```bash
node scripts/snapshot-computed-styles.cjs /tmp/self-a.json
node scripts/snapshot-computed-styles.cjs /tmp/self-b.json
node scripts/snapshot-computed-styles.cjs --diff /tmp/self-a.json /tmp/self-b.json
echo "EXIT=$?"
```

기대: `차이 0`, `EXIT=0`.

차이가 나면 원인을 없앤다 — 시간에 따라 달라지는 값(오늘 날짜로 렌더되는 요소),
애니메이션 중간값, 폰트 로딩 경합이 후보다. 노드 수 자체가 다르면 DOM이 비결정적인
것이므로 해당 페이지에서 대기 조건을 강화한다.

- [ ] **Step 5: 삭제 전 베이스라인을 남긴다**

```bash
node scripts/snapshot-computed-styles.cjs /tmp/before-delete.json
```

이 파일은 Task 2가 쓴다. **커밋하지 않는다** — 수 MB짜리 원본 JSON은 저장소에 넣지
않는다. 도구가 커밋되어 있으므로 언제든 재생성할 수 있다.

- [ ] **Step 6: 유닛 테스트가 여전히 녹색인지 확인한다**

```bash
npm test
```

기대: `# pass 458`, `# fail 0`. 이 태스크는 `styles.css`를 건드리지 않았다.

- [ ] **Step 7: 커밋**

```bash
git add scripts/snapshot-computed-styles.cjs
git commit -m "계산값 스냅샷 도구를 만든다"
```

---

### Task 2: 사문 238개 규칙 삭제 + diff 0 증명

**Files:**
- Modify: `styles.css` (규칙 238개 · 1448줄 삭제)
- Modify: `fonts.test.mjs:206-215` (래칫 90 → 44)
- Create: `docs/artifacts/final-900-deletion-report.md`

**Interfaces:**
- Consumes: Task 1의 `scripts/snapshot-computed-styles.cjs`와 `/tmp/before-delete.json`
- Produces: `styles.css`의 `font-weight: 900`이 90 → 44

- [ ] **Step 1: 사문 클래스 목록을 파일로 만든다**

`/tmp/dead-classes.txt` — 41개 클래스, 한 줄에 하나:

```
field-group
progress-label
pricing-grid
login-card
admin-alert-strip
use-grid
journey-lane
focus-preview-card
execution-link
bottom-tabbar
execution-gauge
plan-editor-label
routine-cue-list
discount-badge
price-breakdown
final-price
coupon-strip
companion-actions
pillar-grid
builder-kicker
custom-goal-button
result-analysis-header
result-trial-cta
ollie-talk
reason-number
problem-reasons
reason-mark
pillar-number
pillar-copy
pillar-symbol
pillar-promise
trial-expiry-policy
energy-packs
energy-system-heading
energy-cost-grid
energy-pack-grid
draft-week-list
first-week-disclosure
result-inline-start
goal-form
diagnosis-stepper
```

- [ ] **Step 2: 삭제 대상을 다시 계산해 목록과 수치를 확인한다**

`/tmp/delete-dead-rules.cjs`:

```js
// 사문 규칙을 지운다. 규칙 경계는 문자 단위로 파싱한다 —
// 셀렉터가 여러 줄에 걸치고(.a,\n.b,\n.c {) @media 안에도 규칙이 있다.
// 주석은 줄 수를 보존한 채 지워서 주석 속 중괄호가 파서를 깨지 않게 한다.
//
// 조각이 사문 := 검증된 부재 클래스를 하나라도 포함한다.
//   후손 셀렉터 ".home-page .pillar-grid"는 두 클래스가 모두 있어야 매치하므로,
//   pillar-grid가 없으면 home-page가 살아 있어도 이 조각은 절대 매치하지 않는다.
// 규칙 삭제 := 모든 콤마 조각이 사문이다. 하나라도 살아 있으면 손대지 않는다.
const fs = require("fs");
const [cssPath, listPath, mode] = process.argv.slice(2);
const raw = fs.readFileSync(cssPath, "utf8");
const TARGET = new Set(fs.readFileSync(listPath, "utf8").split(/\s+/).filter(Boolean));
const masked = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
const lines = masked.split("\n");

const spans = [];
const stack = [];
let pending = "";
lines.forEach((line, i) => {
  let buf = "";
  for (const ch of line) {
    if (ch === "{") { stack.push({ sel: (pending + buf).replace(/\s+/g, " ").trim(), start: i + 1 }); pending = ""; buf = ""; }
    else if (ch === "}") { const r = stack.pop(); if (r) spans.push({ ...r, end: i + 1, depth: stack.length }); pending = ""; buf = ""; }
    else buf += ch;
  }
  pending += buf;
});

const partDead = (p) => [...p.matchAll(/\.([\w-]+)/g)].some((m) => TARGET.has(m[1]));
const doomed = spans.filter((s) => {
  if (s.sel.startsWith("@") || !s.sel) return false;
  const parts = s.sel.split(",").map((x) => x.trim()).filter(Boolean);
  return parts.some(partDead) && parts.every(partDead);
});

const before = (raw.match(/font-weight:\s*900\b/g) || []).length;
const doomedLines = new Set();
for (const s of doomed) for (let l = s.start; l <= s.end; l++) doomedLines.add(l);
const rawLines = raw.split("\n");
const kept = rawLines.filter((_, i) => !doomedLines.has(i + 1));
const after = (kept.join("\n").match(/font-weight:\s*900\b/g) || []).length;

console.log(`규칙 ${doomed.length}개 / ${doomedLines.size}줄 삭제`);
console.log(`  @media 안: ${doomed.filter((s) => s.depth > 0).length}개`);
console.log(`font-weight:900  ${before} → ${after}  (${before - after}개 제거)`);

if (mode === "--write") {
  fs.writeFileSync(cssPath, kept.join("\n"));
  console.log("styles.css 갱신 완료");
} else {
  console.log("(미리보기. 실제로 지우려면 --write)");
}
```

미리보기로 돌린다:

```bash
node /tmp/delete-dead-rules.cjs styles.css /tmp/dead-classes.txt
```

기대 출력:

```
규칙 238개 / 1448줄 삭제
  @media 안: 44개
font-weight:900  90 → 44  (46개 제거)
```

**수치가 다르면 멈춘다.** 계획이 근거한 실측과 어긋난 것이므로, 진행 전에 왜
달라졌는지 밝힌다(`main`이 움직였을 수 있다).

- [ ] **Step 3: 삭제를 적용한다**

```bash
node /tmp/delete-dead-rules.cjs styles.css /tmp/dead-classes.txt --write
```

- [ ] **Step 4: CSS가 깨지지 않았는지 중괄호 균형으로 확인한다**

```bash
node -e "
const s=require('fs').readFileSync('styles.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');
const o=(s.match(/{/g)||[]).length, c=(s.match(/}/g)||[]).length;
console.log('{',o,'}',c, o===c?'균형 OK':'깨짐');
process.exit(o===c?0:1);
"
```

기대: `균형 OK`.

- [ ] **Step 5: 래칫을 44로 내린다**

`fonts.test.mjs`에서 아래 줄을 찾는다:

```js
  assert.equal(count, 90);
```

이렇게 바꾼다:

```js
  assert.equal(count, 44);
```

그리고 바로 위 주석의 마지막 두 줄을 교체한다. 기존:

```js
  // 아래로만 움직인다. 앱 표면 이관 완료 상태: 87(랜딩·관리자 등 다음 단계 몫)
  // + 글리프 유지 3(app-900-classification.md #52·#53·#54).
```

새로:

```js
  // 아래로만 움직인다. 사문 46곳 삭제 완료 상태:
  // 이관 대상 31(랜딩 22·관리자 8·script 1) + 글리프 유지 13.
```

- [ ] **Step 6: 유닛 테스트를 돌린다**

```bash
npm test
```

기대: `# pass 458`, `# fail 0`.

- [ ] **Step 7: 삭제 후 스냅샷을 뜨고 diff가 0인지 본다 — 이 태스크의 관문**

서버가 죽었으면 다시 띄운다(`PORT=8772 node serve-local.cjs > /tmp/serve-8772.log 2>&1 &`).

```bash
node scripts/snapshot-computed-styles.cjs /tmp/after-delete.json
node scripts/snapshot-computed-styles.cjs --diff /tmp/before-delete.json /tmp/after-delete.json
echo "EXIT=$?"
```

기대: `차이 0`, `EXIT=0`.

**차이가 나오면 삭제를 밀어붙이지 않는다.** 설계가 정한 처리는 이렇다:

1. 차이 난 키(`landing@390 body>div[2]>section[0]…`)로 어떤 엘리먼트인지 찾는다.
2. 그 엘리먼트에 어떤 사문 셀렉터가 적용되고 있었는지 역추적한다 —
   `git stash`로 삭제를 되돌린 뒤 그 엘리먼트에서 `getMatchedCSSRules` 대신
   Playwright로 해당 셀렉터들을 `document.querySelectorAll`로 세어 본다.
3. 매치가 있는 클래스는 **사문 판정이 틀린 것**이다. `/tmp/dead-classes.txt`에서
   그 클래스를 빼고 Step 2부터 다시 한다. 그 선언은 삭제가 아니라 이관 대상이 되며,
   Task 3의 분류표에 행을 추가한다.

- [ ] **Step 8: e2e를 돌린다**

```bash
npx playwright test tests/e2e/onboarding.spec.js tests/e2e/pricing.spec.js tests/e2e/auth.spec.js tests/e2e/responsive.spec.js tests/e2e/legal.spec.js tests/e2e/tap-targets.spec.js --workers=1 > /tmp/e2e-task2.log 2>&1
echo "EXIT=$?"
tail -20 /tmp/e2e-task2.log
```

기대: `EXIT=0`.

실패가 나오면 이 브랜치가 원인인지 먼저 가른다. `git stash`로 삭제를 되돌리고 같은
스펙을 돌려 같은 실패가 나면 선행 결함이다. 부하 플레이키가 의심되면
`npx playwright test --last-failed --workers=1`로 재분류한다.

- [ ] **Step 9: 삭제 보고서를 쓴다**

`docs/artifacts/final-900-deletion-report.md`:

```markdown
# 사문 CSS 삭제 보고 — 규칙 238개 · 1448줄

`font-weight: 900` 90곳 중 46곳은 저장소 어디에도 클래스가 없는 사문이었다.
이 문서는 그 46곳이 딸린 규칙을 지운 근거와 증거를 남긴다.

## 무엇을 지웠나

| 항목 | 값 |
| --- | --- |
| 규칙 | 238개 (그중 `@media` 안 44개) |
| 줄 | 1448줄 — `styles.css` 19,259줄의 7.5% |
| `font-weight: 900` | 90 → 44 |
| 사문 클래스 | 41개 |

**삭제 규칙**: 콤마 조각이 **전부** 사문인 규칙만 지웠다. 후손 셀렉터
`.home-page .pillar-grid`는 두 클래스가 모두 있어야 매치하므로, `pillar-grid`가
없으면 `home-page`가 살아 있어도 이 조각은 매치하지 않는다.

살아있는 셀렉터와 섞인 규칙 **55개는 손대지 않았다.** 규칙 자체가 살아 있고,
셀렉터에서 사문 조각만 빼는 것은 렌더 영향이 0인 미용 작업이다.

## 사문 판정의 자기 검증

| 오판 경로 | 확인 | 결과 |
| --- | --- | --- |
| 검색 범위가 좁다 | 저장소 전체 `.html`/`.js`/`.cjs`/`.mjs` 순회 | 41개 클래스 전부 무참조 |
| 백업을 살아있는 코드로 셈 | `.backups/onboarding-v*-20260727/`는 추적되지 않는 로컬 스냅샷 | 제외 |
| 클래스를 동적으로 조립 | 접두사 조립 흔적 검색 | 후보 3건 전부 `plan-${Date.now()}` 류 ID 생성기 |
| 프로토타입이 쓴다 | `.goal-form`은 `core-loop-v2.html`에만 있고 그 페이지는 `core-loop-v2.css`를 로드 | styles.css 규칙은 사문 |
| script.js가 쓴다 | `.goal-form`·`.diagnosis-stepper`는 `querySelector`로 찾기만 한다 — HTML에 없으니 null | 사문 |
| 테스트가 참조한다 | `tests/` 및 `*.test.mjs` 전수 검색 | 참조 0건 |

## 증거 — 계산값 전수 diff

`scripts/snapshot-computed-styles.cjs`로 삭제 전후를 쟀다.

- 페이지: `index.html` · `admin.html` · `app.html` — `styles.css`를 로드하는 전부
- 폭: 390 · 1280 — 삭제 대상 238개 중 44개가 `@media` 안에 있다
- 속성: font-weight/size/family, color, background-color, padding, margin,
  border-radius, box-shadow, display
- **노드 <NODES>개, 차이 0**

도구 자체의 결정성도 확인했다 — 같은 코드에서 두 번 재어 서로 비교했고 차이 0이었다.

원본 JSON은 커밋하지 않는다(수 MB). 도구가 커밋되어 있어 언제든 재생성한다.

## e2e

`onboarding` · `pricing` · `auth` · `responsive` · `legal` · `tap-targets` — <N> passed.
```

`<NODES>`와 `<N>`은 실제 출력값으로 채운다.

- [ ] **Step 10: 커밋**

```bash
git add styles.css fonts.test.mjs docs/artifacts/final-900-deletion-report.md
git commit -m "사문 CSS 규칙 238개를 지운다"
```

---

### Task 3: 살아있는 31곳 분류표

**Files:**
- Create: `docs/artifacts/final-900-classification.md`

**Interfaces:**
- Consumes: Task 2 이후의 `styles.css` (900이 44곳)
- Produces: 31행 배정표. Task 4·5가 이 표대로 이관한다. 배정값은
  `--weight-emphasis` · `--weight-title` · `--weight-display` 중 하나이거나 `글리프 유지`.

- [ ] **Step 1: 남은 44곳의 목록을 뽑는다**

```bash
node -e "
const fs=require('fs');
const raw=fs.readFileSync('styles.css','utf8');
const masked=raw.replace(/\/\*[\s\S]*?\*\//g,(m)=>m.replace(/[^\n]/g,' '));
const lines=masked.split('\n');
const spans=[];const stack=[];let pending='';
lines.forEach((line,i)=>{let buf='';
  for(const ch of line){
    if(ch==='{'){stack.push({sel:(pending+buf).replace(/\s+/g,' ').trim(),start:i+1});pending='';buf='';}
    else if(ch==='}'){const r=stack.pop();if(r)spans.push({...r,end:i+1});pending='';buf='';}
    else buf+=ch;}
  pending+=buf;});
const inner=(l)=>spans.filter(s=>!s.sel.startsWith('@')&&l>=s.start&&l<=s.end)
  .sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0];
lines.forEach((l,i)=>{ if(/font-weight:\s*900\b/.test(l)){
  const s=inner(i+1); const c=/글리프 굵기/.test(raw.split('\n').slice(Math.max(0,i-4),i).join('\n'));
  console.log((i+1)+'\t'+(c?'[주석]':'      ')+'\t'+(s?s.sel:'?'));
}});
"
```

기대: 44행. 그중 `[주석]`이 5행(이미 글리프로 처리된 것), 나머지 39행이 판정 대상이다.

- [ ] **Step 2: 각 행의 마크업 근거를 모은다**

셀렉터 이름으로 판정하지 않는다. 실제 마크업을 본다.

```bash
# 예: .status-pill 이 어떤 내용을 담는지
grep -n 'status-pill' admin.html script.js | head -5
```

39행 전부에 대해 클래스가 등장하는 `index.html` · `admin.html` · `script.js` 줄을
확인한다. 이 근거가 표의 "마크업" 열이 된다.

- [ ] **Step 3: 실측으로 렌더된 값을 확인한다**

선언이 아니라 **렌더된 값**을 본다. #58에서 `.card-title span` 등 3곳이 캐스케이드에서
지고 있어 셀렉터만 봤으면 오판했을 곳이었다.

```bash
node -e "
const { chromium } = require('@playwright/test');
const SELS = ['.personality-form button','.today-plan-card a','.builder-header > span',
  '.summary-head span','.live-summary dd','.feature-showcase-head > span','.feature-number',
  '.mini-schedule-row span','.feature-memory-board article span','.feature-app-link',
  '.trial-conversion-path span','.pricing-recommended-badge','.pricing-current-marker',
  '.pricing-comparison-row dd','.pricing-credit-grid article > span','.hero-trial-button',
  '.pricing-app-return','.builder-choice-section > legend','.builder-ghost',
  '.admin-stat-grid em','.admin-table th','.status-pill','.admin-health-strip small',
  '.health-icon','.admin-funnel-visual span','.retention-summary small','.plan-pill',
  '.admin-password-change-form button'];
(async()=>{
  const b=await chromium.launch();
  for(const [name,path] of [['landing','/'],['admin','/admin.html']]){
    const p=await b.newPage({viewport:{width:390,height:900},baseURL:'http://127.0.0.1:8772'});
    await p.goto(path); await p.waitForLoadState('networkidle');
    const r=await p.evaluate((sels)=>sels.flatMap(s=>{
      const el=document.querySelector(s); if(!el) return [];
      const cs=getComputedStyle(el);
      return [{s,w:cs.fontWeight,f:cs.fontSize,t:(el.textContent||'').trim().slice(0,14)}];
    }),SELS);
    console.log('## '+name);
    r.forEach(x=>console.log('| \`'+x.s+'\` | '+x.w+' | '+x.f+' | '+x.t+' |'));
    await p.close();
  }
  await b.close();
})();
" > /tmp/measured-before.md
cat /tmp/measured-before.md
```

이 출력이 Task 4·5의 이관 전 기준값이 된다. **렌더값이 900이 아닌 행은 캐스케이드에서
지고 있는 것**이므로 표에 그렇게 적는다 — 이관해도 화면이 안 바뀐다는 뜻이다.

- [ ] **Step 4: 분류표를 쓴다**

`docs/artifacts/final-900-classification.md`. 형식:

```markdown
# 마지막 900 분류표 — 살아있는 31곳

사문 46곳을 지운 뒤 남은 44곳 중, 이미 글리프로 처리된 5곳을 뺀 39곳을 판정했다.
**이관 31 · 글리프 유지 8.** 배정은 셀렉터 이름이 아니라 마크업과 렌더값이 근거다.

| # | 줄 | 셀렉터 | 화면 | 마크업 근거 | 렌더값 | 배정 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 553 | `.personality-form button` | 랜딩 | index.html:NNN 제출 버튼 | 900 | `--weight-emphasis` |
| … | | | | | | |
```

배정 기준:

- **글리프 유지**: 엘리먼트가 담는 것이 문자 아이콘 하나뿐일 때. `content`가 있는
  의사요소든, `textContent`가 `×`·`✓`·`!`·`↗` 하나인 실제 엘리먼트든 같다.
- `--weight-display`(800): 화면에서 가장 큰 숫자·기호. 히어로 지표 성격.
- `--weight-title`(700): 섹션 제목·카드 제목.
- `--weight-emphasis`(600): 제목은 아니나 강조하는 문구 — 라벨·메타·칩·탭 같은 짧은
  UI 문구와 본문 성격의 강조.

**미리 판정된 글리프 후보 2곳** (Step 2에서 마크업으로 확인한다):

| 줄 | 셀렉터 | 근거 |
| --- | --- | --- |
| 1440 | `.health-icon` | `admin.html:57-59`에서 내용이 `!` · `↗` · `✓` 하나뿐, 38×38 `place-items:center` 박스 |
| 18799 | `.task-remove-button` | `script.js:3200`에서 `textContent = "×"`, 28px 원형 버튼 |

확인 결과가 다르면 표를 근거대로 고치고, Task 5의 래칫 값을 그에 맞게 다시 계산한다.

- [ ] **Step 5: 표의 합계가 맞는지 검산한다**

```bash
node -e "
const t=require('fs').readFileSync('docs/artifacts/final-900-classification.md','utf8');
const rows=t.split('\n').filter(l=>/^\| \d+ \|/.test(l));
const c={};
for(const r of rows){const m=r.split('|').map(x=>x.trim());const a=m[m.length-2];c[a]=(c[a]||0)+1;}
console.log(c, '합계', rows.length);
"
```

기대: 합계 39, 그중 `글리프 유지` 8, 나머지 31이 토큰 배정.

- [ ] **Step 6: 커밋**

```bash
git add docs/artifacts/final-900-classification.md
git commit -m "남은 900의 분류표를 만든다"
```

---

### Task 4: 랜딩 22곳 이관

**Files:**
- Modify: `styles.css` (22개 선언)
- Modify: `fonts.test.mjs` (래칫 44 → 22)

**Interfaces:**
- Consumes: Task 3의 `docs/artifacts/final-900-classification.md` 배정
- Produces: `styles.css`의 900이 44 → 22

대상(줄 번호는 Task 2의 삭제로 **바뀐다** — 셀렉터로 찾는다):

| 셀렉터 |
| --- |
| `.personality-form button` |
| `.today-plan-card a` |
| `.builder-header > span` |
| `.summary-head span` |
| `.live-summary dd` |
| `.feature-showcase-head > span` |
| `.feature-number` |
| `.mini-schedule-row span` |
| `.feature-memory-board article span` |
| `.feature-app-link` |
| `.home-page .trial-conversion-path span` |
| `.home-page .pricing-recommended-badge` |
| `.home-page .pricing-plan-kicker, .home-page .pricing-section-head > div > span` |
| `.home-page .pricing-current-marker` |
| `.home-page .pricing-plan-cta, .home-page .pricing-final-actions a, …` (3조각) |
| `.home-page .pricing-comparison-row dd` |
| `.home-page .pricing-credit-grid article > span` |
| `.home-page .pricing-credit-details > summary, .home-page .pricing-faq details > summary` |
| `.hero-trial-button` |
| `.pricing-app-return` |
| `.builder-choice-section > legend` |
| `.builder-ghost` |

- [ ] **Step 1: 배정 JSON을 만든다**

`/tmp/task4.json` — 분류표의 배정을 그대로 옮긴다. 형식은
`{"셀렉터": "토큰이름"}`:

```json
{
  ".personality-form button": "emphasis",
  ".today-plan-card a": "emphasis"
}
```

22개 셀렉터 전부를 분류표가 정한 토큰으로 채운다.

- [ ] **Step 2: 이관 스크립트를 만든다**

`/tmp/migrate-900.cjs` — 셀렉터로 규칙을 찾아 그 안의 `font-weight: 900`만 바꾼다.
**규칙 헤더를 확인**하므로 엉뚱한 규칙을 고치지 않는다.

```js
// 배정 JSON대로 font-weight:900을 역할 토큰으로 바꾼다.
// 셀렉터로 규칙 구간을 찾고 그 구간 안의 900만 건드린다 — 줄 번호로 찾으면
// 앞선 삭제·편집으로 어긋난다.
const fs = require("fs");
const [cssPath, mapPath, mode] = process.argv.slice(2);
const raw = fs.readFileSync(cssPath, "utf8");
const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
const masked = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
const lines = masked.split("\n");
const out = raw.split("\n");

const spans = [];
const stack = [];
let pending = "";
lines.forEach((line, i) => {
  let buf = "";
  for (const ch of line) {
    if (ch === "{") { stack.push({ sel: (pending + buf).replace(/\s+/g, " ").trim(), start: i + 1 }); pending = ""; buf = ""; }
    else if (ch === "}") { const r = stack.pop(); if (r) spans.push({ ...r, end: i + 1 }); pending = ""; buf = ""; }
    else buf += ch;
  }
  pending += buf;
});

const norm = (s) => s.replace(/\s+/g, " ").trim();
let changed = 0;
const missed = [];
for (const [sel, token] of Object.entries(map)) {
  const hits = spans.filter((s) => norm(s.sel) === norm(sel));
  if (!hits.length) { missed.push(`${sel} — 규칙 없음`); continue; }
  let n = 0;
  for (const s of hits) {
    for (let l = s.start; l <= s.end; l++) {
      if (/font-weight:\s*900\b/.test(out[l - 1])) {
        out[l - 1] = out[l - 1].replace(/font-weight:\s*900\b/, `font-weight: var(--weight-${token})`);
        n++; changed++;
      }
    }
  }
  if (!n) missed.push(`${sel} — 규칙은 있으나 900 없음`);
}
console.log(`바꾼 선언 ${changed}개`);
if (missed.length) { console.log("처리 못한 것:"); missed.forEach((m) => console.log("  " + m)); }
if (mode === "--write" && !missed.length) { fs.writeFileSync(cssPath, out.join("\n")); console.log("styles.css 갱신"); }
else if (mode === "--write") console.log("처리 못한 항목이 있어 쓰지 않았다 — 셀렉터를 고쳐라");
```

- [ ] **Step 3: 미리보기로 22개가 다 잡히는지 본다**

```bash
node /tmp/migrate-900.cjs styles.css /tmp/task4.json
```

기대: `바꾼 선언 22개`, "처리 못한 것" 없음. 못 잡은 셀렉터가 있으면 실제 규칙
헤더와 문자열이 다른 것이므로 JSON의 셀렉터를 파일에서 복사해 고친다.

- [ ] **Step 4: 적용한다**

```bash
node /tmp/migrate-900.cjs styles.css /tmp/task4.json --write
```

- [ ] **Step 5: 래칫을 22로 내린다**

`fonts.test.mjs`에서 `assert.equal(count, 44);` → `assert.equal(count, 22);`

- [ ] **Step 6: 유닛 테스트**

```bash
npm test
```

기대: `# pass 458`, `# fail 0`.

- [ ] **Step 7: 실측 diff — 의도한 곳만 바뀌었는지 본다**

Task 3 Step 3의 명령을 다시 돌려 `/tmp/measured-after4.md`로 받고 비교한다.

```bash
diff /tmp/measured-before.md /tmp/measured-after4.md
```

기대: 랜딩 행의 `font-weight`가 900 → 600/700/800으로 배정대로 바뀌고, 관리자 행은
그대로다. 관리자 행이 바뀌었으면 셀렉터를 잘못 잡은 것이다.

- [ ] **Step 8: e2e**

```bash
npx playwright test tests/e2e/onboarding.spec.js tests/e2e/pricing.spec.js tests/e2e/responsive.spec.js tests/e2e/tap-targets.spec.js --workers=1 > /tmp/e2e-task4.log 2>&1
echo "EXIT=$?"
tail -20 /tmp/e2e-task4.log
```

기대: `EXIT=0`. `tap-targets`가 특히 중요하다 — 굵기 축소가 글자 폭을 줄이고, 이
프로젝트는 그것으로 히트 영역이 44px 밑으로 내려간 전례가 두 번 있다.

- [ ] **Step 9: 커밋**

```bash
git add styles.css fonts.test.mjs
git commit -m "랜딩 표면 900 22곳을 역할 토큰으로 옮긴다"
```

---

### Task 5: 관리자 8곳 + script.js 생성 1곳 이관

**Files:**
- Modify: `styles.css` (9개 선언)
- Modify: `fonts.test.mjs` (래칫 22 → 13)

**Interfaces:**
- Consumes: Task 3의 분류표
- Produces: `styles.css`의 900이 22 → 13 (전부 글리프)

대상:

| 셀렉터 | 화면 |
| --- | --- |
| `.admin-stat-grid em` | 관리자 |
| `.admin-table th` | 관리자 |
| `.status-pill` | 관리자 |
| `.admin-health-strip small` | 관리자 |
| `.admin-funnel-visual span` | 관리자 |
| `.retention-summary small` | 관리자 |
| `.plan-pill` | 관리자 |
| `.admin-password-change-form button` | 관리자 |
| `.task-builder-item label` | script.js 생성 (온보딩 빌더) |

`.health-icon`과 `.task-remove-button`은 **여기 없다** — 글리프로 Task 6이 처리한다.

- [ ] **Step 1: 배정 JSON을 만든다**

`/tmp/task5.json`에 위 9개 셀렉터를 분류표가 정한 토큰으로 채운다. 형식은 Task 4와 같다.

이관 스크립트 `/tmp/migrate-900.cjs`는 **Task 4 Step 2에서 만든 것을 그대로 쓴다.**
이 태스크를 단독으로 실행한다면 Task 4 Step 2의 코드를 먼저 그 경로에 만든다.

- [ ] **Step 2: 미리보기**

```bash
node /tmp/migrate-900.cjs styles.css /tmp/task5.json
```

기대: `바꾼 선언 9개`, "처리 못한 것" 없음.

- [ ] **Step 3: 적용**

```bash
node /tmp/migrate-900.cjs styles.css /tmp/task5.json --write
```

- [ ] **Step 4: 래칫을 13으로 내린다**

`fonts.test.mjs`에서 `assert.equal(count, 22);` → `assert.equal(count, 13);`

- [ ] **Step 5: 유닛 테스트**

```bash
npm test
```

기대: `# pass 458`, `# fail 0`.

- [ ] **Step 6: 실측 diff**

Task 3 Step 3의 명령을 다시 돌려 `/tmp/measured-after5.md`로 받고 비교한다.

```bash
diff /tmp/measured-before.md /tmp/measured-after5.md
```

기대: 관리자 행의 `font-weight`가 배정대로 바뀌고, `.health-icon`은 **900 그대로**다.

- [ ] **Step 7: e2e (관리자에는 스펙이 없으므로 앱·랜딩 회귀만 본다)**

```bash
npx playwright test tests/e2e/onboarding.spec.js tests/e2e/plan.spec.js tests/e2e/today.spec.js --workers=1 > /tmp/e2e-task5.log 2>&1
echo "EXIT=$?"
tail -20 /tmp/e2e-task5.log
```

기대: `EXIT=0`. `today.spec.js`가 `.calendar-day.selected`에서 실패하면 월 경계
선행 결함이다 — `git stash` 후 같은 스펙을 돌려 동일 실패를 확인하고 넘어간다.

- [ ] **Step 8: 커밋**

```bash
git add styles.css fonts.test.mjs
git commit -m "관리자와 빌더의 900 9곳을 역할 토큰으로 옮긴다"
```

---

### Task 6: 글리프 8곳 주석 + 래칫을 계약으로 승격

**Files:**
- Modify: `styles.css` (주석 8곳 추가)
- Modify: `fonts.test.mjs` (숫자 래칫 → 글리프 주석 계약)

**Interfaces:**
- Consumes: Task 5 이후의 `styles.css` (900이 13곳, 그중 5곳만 주석 보유)
- Produces: 13곳 전부 주석 보유. `fonts.test.mjs`가 숫자 대신 규칙을 지킨다.

주석이 필요한 8곳:

| 셀렉터 | 글리프 |
| --- | --- |
| `.pricing-benefits li::before` | 체크 표시 |
| `.result-week-list li::before` | 목록 마커 |
| `.journey-stop:not(:last-child)::after` | 연결선 마커 |
| `.journey-stop.done:not(.current) .journey-scene::after` | 완료 표시 |
| `.home-page .trial-conversion-path li:not(:last-child)::after` | 연결선 마커 |
| `.home-page .pricing-plan-benefits .pricing-benefit-copy::before` | 체크 표시 |
| `.health-icon` | `!` · `↗` · `✓` |
| `.task-remove-button` | `×` |

- [ ] **Step 1: 각 글리프의 실제 문자를 확인한다**

주석에 적을 문자를 추측하지 않는다. 의사요소는 `content`를, 실제 엘리먼트는
마크업을 본다.

```bash
node -e "
const fs=require('fs');const css=fs.readFileSync('styles.css','utf8');
const lines=css.split('\n');
lines.forEach((l,i)=>{ if(/font-weight:\s*900\b/.test(l)){
  const ctx=lines.slice(Math.max(0,i-12),i+2).join('\n');
  const m=ctx.match(/content:\s*([^;]+);/);
  console.log((i+1)+'  content='+(m?m[1]:'(의사요소 아님)'));
}});
"
grep -n 'health-icon' admin.html | head -3
grep -n 'task-remove-button' script.js | head -3
```

- [ ] **Step 2: 주석을 단다**

각 `font-weight: 900;` **바로 위 줄**에 아래 형식으로 넣는다. 문자열
`글리프 굵기`가 반드시 들어가야 한다 — Step 4의 계약 테스트가 이걸 찾는다.

```css
  /* 글리프 굵기("✓" 캐리어) — 텍스트 위계 아님, 역할 토큰 비대상.
     final-900-classification.md #N */
  font-weight: 900;
```

`#N`은 분류표의 행 번호로 채운다. 괄호 안 문자는 Step 1에서 확인한 실제 글리프로
바꾼다.

- [ ] **Step 3: 13곳 전부가 주석을 가졌는지 확인한다**

```bash
node -e "
const fs=require('fs');
const lines=fs.readFileSync('styles.css','utf8').split('\n');
const off=[];let n=0;
lines.forEach((l,i)=>{
  if(!/font-weight:\s*900\b/.test(l))return;
  n++;
  if(!/글리프 굵기/.test(lines.slice(Math.max(0,i-4),i).join('\n'))) off.push(i+1);
});
console.log('900 총',n,'· 주석 없음',off.length, off.join(','));
process.exit(off.length?1:0);
"
```

기대: `900 총 13 · 주석 없음 0`, 종료 코드 0.

- [ ] **Step 4: 래칫을 계약으로 바꾼다**

`fonts.test.mjs`에서 아래 테스트 전체를 찾는다:

```js
test("font-weight:900 잔여 수 래칫 — 새 900 유입을 막는다", () => {
```

이 테스트 블록 전체를 아래로 교체한다:

```js
test("남은 font-weight:900은 전부 글리프 캐리어 — 사유 주석을 요구한다", () => {
  // 900은 6단계 계약 안의 값이라 위의 계약 테스트로는 유입을 못 잡는다.
  // 이관이 끝난 지금 남은 900은 전부 글리프 캐리어("✓"·"×"·"!" 같은 문자 아이콘)다.
  // 그래서 숫자를 세는 대신 규칙을 지킨다 — 새 900이 들어오면 사유 주석이 없어서
  // 걸리고, 실패 메시지가 줄 번호를 지목한다.
  // 텍스트 위계에 굵기가 필요하면 역할 토큰을 써라: docs/design-tokens.md
  const lines = fs.readFileSync("styles.css", "utf8").split("\n");
  const offenders = [];
  lines.forEach((line, i) => {
    if (!/font-weight:\s*900\b/.test(line)) return;
    const near = lines.slice(Math.max(0, i - 4), i).join("\n");
    if (!/글리프 굵기/.test(near)) offenders.push(i + 1);
  });
  assert.deepEqual(offenders, [], `글리프 사유 주석 없는 900: ${offenders.join(", ")}줄`);
});
```

- [ ] **Step 5: 계약 테스트가 실제로 작동하는지 확인한다 — 일부러 깨 본다**

통과만 보면 테스트가 아무것도 안 해도 통과한다. 위반을 넣어 걸리는지 본다.

```bash
printf '\n.contract-probe { font-weight: 900; }\n' >> styles.css
npm test > /tmp/probe.log 2>&1
echo "EXIT=$?"
grep -A3 '글리프 캐리어' /tmp/probe.log
```

기대: `EXIT`가 **0이 아니고**, 메시지가 방금 추가한 줄 번호를 지목한다.
`npm test`를 파이프에 물리지 않는 이유는 그러면 종료 코드가 `grep`의 것이 되기
때문이다 — 로그는 파일로 받고 코드는 따로 읽는다.

- [ ] **Step 6: 탐침을 지우고 다시 돌린다**

```bash
node -e "
const fs=require('fs');
const s=fs.readFileSync('styles.css','utf8');
fs.writeFileSync('styles.css', s.replace(/\n\.contract-probe \{ font-weight: 900; \}\n/, '\n'));
"
npm test
```

기대: `# pass 458`, `# fail 0`. `.contract-probe`가 남아 있지 않은지 확인한다:

```bash
grep -c 'contract-probe' styles.css
```

기대: `0`.

- [ ] **Step 7: 커밋**

```bash
git add styles.css fonts.test.mjs
git commit -m "글리프 8곳에 사유를 적고 래칫을 계약으로 올린다"
```

---

### Task 7: 문서 갱신

**Files:**
- Modify: `docs/design-tokens.md`
- Modify: `docs/final-900-migration-design.md`
- Modify: `docs/artifacts/typography-foundation-measurements.md`
- Modify: `docs/PROJECT_STATUS.md`

**Interfaces:**
- Consumes: Task 2~6의 결과 수치 (삭제 46 · 이관 31 · 글리프 13)

- [ ] **Step 1: `docs/design-tokens.md`의 잔여 수를 갱신한다**

`90`이 적힌 곳을 찾는다:

```bash
grep -n '90\|잔여\|래칫' docs/design-tokens.md | head -10
```

잔여 수를 **13**으로 고치고, 그 문단에 아래 규칙을 명문화한다:

```markdown
남은 `font-weight: 900` 13곳은 전부 **글리프 캐리어**다 — `content`가 문자
아이콘인 의사요소이거나, `textContent`가 `×`·`✓`·`!` 하나뿐인 엘리먼트다.
텍스트 위계가 아니므로 역할 토큰의 대상이 아니고, 리터럴 900에 사유 주석을 단다.

`fonts.test.mjs`가 이것을 계약으로 지킨다. 새 900을 넣으면 사유 주석이 없어서
테스트가 실패하고 줄 번호를 지목한다. 텍스트 굵기가 필요하면 역할 토큰을 써라.
```

- [ ] **Step 2: `docs/final-900-migration-design.md`의 수치를 정정한다**

설계를 쓸 때의 수치(규칙 210개·1333줄, 콤마 오염 0건, 이관 33, 글리프 11)는
느슨한 파서가 낸 값이었다. 실측 확정값으로 고친다:

| 항목 | 설계 초안 | 확정 |
| --- | --- | --- |
| 삭제 규칙 | 210개 · 1333줄 | **238개 · 1448줄** (@media 안 44개) |
| 혼합 규칙 | 0건 | **55개** — 살아있는 셀렉터와 섞여 손대지 않는다 |
| 이관 | 33 | **31** (`.health-icon`·`.task-remove-button`이 글리프로 판정) |
| 글리프 유지 | 11 | **13** |

정정 사유도 함께 적는다: 초안의 파서가 (1) 여러 줄에 걸친 셀렉터 그룹의 앞부분을
잃었고 (2) `@media` 안의 규칙을 통째로 놓쳤다.

- [ ] **Step 3: `docs/artifacts/typography-foundation-measurements.md`에 이번 실측을 잇댄다**

파일 끝에 절을 추가한다:

```markdown
## 마지막 900 정리 (final-900) — 2026-08-01

사문 46곳 삭제 + 살아있는 31곳 이관. 잔여 90 → 13(전부 글리프).

삭제 안전은 계산값 전수 diff로 증명했다 — 세 페이지 × 두 폭, 노드 <NODES>개, 차이 0.
자세한 것은 `final-900-deletion-report.md`.

| 셀렉터 | 화면 | 전 | 후 |
| --- | --- | --- | --- |
```

이관 31곳의 전후 렌더값을 `/tmp/measured-before.md`와 `/tmp/measured-after5.md`에서
옮긴다.

- [ ] **Step 4: `docs/PROJECT_STATUS.md`에 기록을 남긴다**

**주의**: 이 파일은 다른 세션이 동시에 편집하는 일이 있었다. 지금 상태를 먼저 본다:

```bash
git status --porcelain docs/PROJECT_STATUS.md
```

깨끗하면 절을 추가한다. 굵기 이관 작업이 **끝났다**는 것과 남은 것이 무엇인지 적는다:

```markdown
### 굵기 역할 토큰 이관 완료 (2026-08-01)

`styles.css`의 `font-weight: 900`을 네 라운드에 걸쳐 정리했다: 203 → 139 → 90 → 13.
마지막 라운드는 사문 46곳을 규칙째 지우고(238규칙·1448줄) 살아있는 31곳을 이관했다.
남은 13곳은 전부 글리프 캐리어이고 `fonts.test.mjs`가 사유 주석을 계약으로 요구한다.

남은 것: `core-loop-v2.css`의 900 2곳(프로토타입 자체 토큰 체계),
900이 아닌 700·800 리터럴, `today.spec.js:6`의 월 경계 결함.
```

- [ ] **Step 5: 최종 검산**

```bash
npm test
node -e "
const c=require('fs').readFileSync('styles.css','utf8');
console.log('900 잔여:', (c.match(/font-weight:\s*900\b/g)||[]).length);
console.log('역할 토큰 사용:', (c.match(/var\(--weight-/g)||[]).length);
"
```

기대: `# pass 458` · `# fail 0` · `900 잔여: 13`.

- [ ] **Step 6: 커밋**

```bash
git add docs/
git commit -m "굵기 이관 완료를 문서에 적는다"
```

---

## 완료 조건

- `styles.css`의 `font-weight: 900`이 **13곳**, 전부 글리프 사유 주석 보유
- `npm test` 458 pass / 0 fail
- 삭제 전후 계산값 diff **0** — 세 페이지 × 두 폭
- e2e: onboarding · pricing · auth · responsive · legal · tap-targets · plan · today 녹색
- `fonts.test.mjs`가 숫자가 아니라 규칙을 지킨다 (일부러 깨 봐서 확인)

## 범위 밖

- `core-loop-v2.css`의 900 2곳 — 프로토타입이 자체 토큰 체계를 쓴다
- 900이 아닌 700·800 리터럴
- 혼합 규칙 55개의 셀렉터에서 사문 조각 제거 — 렌더 영향 0인 미용 작업
- 사문 클래스 41개 밖의 사문 CSS 청소 — 스타일시트 전체 사문 청소는 별도 작업이다
- `today.spec.js:6`의 월 경계 결함
