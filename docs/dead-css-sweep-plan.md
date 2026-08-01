# 사문 CSS 전수 청소 구현 계획

> **에이전트 작업자에게:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development(권장)
> 또는 superpowers:executing-plans로 태스크 단위 실행. 각 단계는 체크박스(`- [ ]`)다.

**목표:** `styles.css`에서 아무것도 렌더하지 않는 규칙 325개(1716줄, 전체의 9.6%)를
지우고, `.ghost-link`의 CSS 잔재와 아무것도 검증하지 않는 테스트 단언을 함께 정리한다.

**접근:** 사문 판정을 문자열 검색에만 맡기지 않는다. 클래스 이름이 런타임에 조립되는
지점(`className = \`… ${x}\``)을 정규식으로 전수 조사해 그 산출물을 살아있는 집합에
더한다. 삭제의 안전은 계산값 전수 diff(3페이지 × 2폭 × 21종 속성)가 0인 것으로,
삭제의 정확성은 규칙 셀렉터 다중집합 대조(오삭제 0)로 증명한다.

**기술 스택:** 순수 CSS(`styles.css`), Node 내장 `node:test`, Playwright(e2e + 계산값
스냅샷), 로컬 정적 서버(`serve-local.cjs`).

## Global Constraints

- 설계 문서: `docs/dead-css-sweep-design.md`. 이 계획은 그 설계를 구현한다.
- **삭제만 한다.** 굵기·색·레이아웃 값을 바꾸지 않는다. 유일한 예외는 Task 3의
  `.ghost-link` 셀렉터 조각 제거와 테스트 단언 1줄 삭제다.
- **조각이 사문** := 그 조각의 클래스 중 하나라도 살아있는 집합에 없다.
  **규칙 삭제** := 모든 콤마 조각이 사문. 하나라도 살아 있으면 손대지 않는다.
- **`:not()`/`:has()`/`:is()`/`:where()` 안의 클래스로 사문 판정을 내리지 않는다.**
  `:not(.foo)`는 `.foo`가 없어도 모든 것에 매치한다. 삭제기가 그런 규칙을 만나면
  **삭제하지 않고 목록에 남겨 보고한다.**
- 작업 디렉터리: `.worktrees/dead-css` (브랜치 `chore/dead-css-sweep`).
- 로컬 서버 포트는 **8776**을 쓴다. 8765는 다른 워크트리의 서버다 — **건드리지 않는다.**
- **A/B 비교에 `git stash`를 쓰지 않는다.** 스택이 저장소 전체에 하나뿐이라 병렬 세션과
  충돌한다. 파일 복사로 한다: `cp styles.css $TMP/keep.css` →
  `git checkout HEAD -- styles.css` → 측정 → `cp $TMP/keep.css styles.css`.
- `$TMP`는 세션 스크래치패드를 뜻한다. 저장소 안에 임시 파일을 만들지 않는다.
- e2e를 `| tail`로 판정하지 않는다. 파이프하면 종료 코드가 `tail`의 것이 된다.
  로그는 `> file.log`로 받고 코드를 따로 읽는다.
- 커밋은 사용자가 지시할 때만 한다.

## 파일 구조

| 파일 | 책임 |
| --- | --- |
| `docs/artifacts/dead-css-live-set.md` (신규) | 런타임 조립 지점 5곳과 각 접두사의 값. 다음 라운드가 같은 조사를 반복하지 않게 하는 산출물 |
| `docs/artifacts/dead-css-sweep-report.md` (신규) | 무엇을 왜 지웠는지와 증거 |
| `styles.css` (수정) | 규칙 325개·1716줄 삭제(껍데기 @media 7개 포함) + `.ghost-link` 조각 4곳 제거 |
| `tests/e2e/today.spec.js` (수정) | 공허한 단언 1줄 삭제 |
| `docs/design-tokens.md` · `docs/PROJECT_STATUS.md` (수정) | 결과 기록 |

## 확정된 수치 (구현 전 실측)

| 항목 | 값 |
| --- | --- |
| `styles.css` | 규칙 3037개 / 17,779줄 / 셀렉터에 등장하는 클래스 849개 |
| 사문 클래스 | **144개** |
| 규칙째 삭제 | **325개 / 1716줄** (전체의 9.6%, `@media` 안 50개, 껍데기 @media 7개 포함) |
| 손대지 않는 혼합 규칙 | **95개** (그중 4개는 Task 3이 `.ghost-link` 조각만 뺀다) |

---

### Task 1: 런타임 조립 지점 산출물

**Files:**
- Create: `docs/artifacts/dead-css-live-set.md`

**Interfaces:**
- Produces: 사문 클래스 144개 목록과, 살아있는 집합에 수동으로 더해야 하는 조립 산출물
  목록. Task 2가 이 두 가지를 그대로 쓴다.

- [ ] **Step 1: 조립 지점을 전수 조사한다**

```bash
grep -rnE '(className|classList\.(add|toggle|remove))[^;]*(\$\{|\+ )' script.js *.mjs *.js 2>/dev/null | grep -v '\.test\.'
```

기대: 5곳. `script.js`의 7595 · 8402 · 8932 · 9743 · 10165.

**5곳이 아니면 멈춘다.** 계획이 근거한 실측과 어긋난 것이므로, 새로 나온 지점의 값을
먼저 확정해야 한다.

- [ ] **Step 2: 각 접두사의 값을 확인한다**

```bash
grep -n 'theme: "' script.js | head -12
grep -n -A3 'function normalizeMemoryMood' script.js
grep -n 'createBookPage(' script.js
```

기대:
- `task-`/`journey-`의 theme 값: `morning` `afternoon` `evening` `night` /
  `room` `path` `forest` `hill` `garden`
- `normalizeMemoryMood`: `{ light: "happy", steady: "calm" }[mood] || mood || "calm"`
  — **저장값이 그대로 통과하므로 열거가 닫히지 않는다**
- `createBookPage` 호출부 5곳: `book-cover` `book-foreword` `book-stats` `book-days`
  `book-letter` — 전부 리터럴

- [ ] **Step 3: 산출물을 쓴다**

`docs/artifacts/dead-css-live-set.md`:

````markdown
# 사문 판정의 살아있는 집합 — 런타임 조립 지점

클래스 이름이 런타임에 조립되면 소스에 문자열로 존재하지 않는다. 문자열 검색만으로
사문을 판정하면 **살아있는 CSS를 지운다.** 이 문서는 그 조립 지점을 전수로 적는다.

조사 방법 — 이 정규식이 전부를 찾는다:

```
(className|classList\.(add|toggle|remove))[^;]*(\$\{|\+ )
```

## 조립 지점 5곳

| 지점 | 코드 | 만들어지는 클래스 | 열거 |
| --- | --- | --- | --- |
| `script.js:7595` | `` `chat-turn ${isOllie ? "is-ollie" : "is-user"}` `` | `is-ollie` · `is-user` | 리터럴 — 검색으로 잡힌다 |
| `script.js:8402` | `` `task-row task-${period.theme}` `` | `task-morning` · `task-afternoon` · `task-evening` · `task-night` | **닫힘** |
| `script.js:8932` | `` `journey-stop journey-${stop.theme}` `` | `journey-room` · `journey-path` · `journey-forest` · `journey-hill` · `journey-garden` | **닫힘** |
| `script.js:9743` | `` `book-page ${className}` `` | `book-cover` · `book-foreword` · `book-stats` · `book-days` · `book-letter` | 호출부 5곳 전부 리터럴 |
| `script.js:10165` | `` `… mood-${normalizeMemoryMood(memory.mood)}` `` | `mood-happy` · `mood-calm` · **그 외 저장값 무엇이든** | **안 닫힘 → 접두사째 살림** |

`theme` 값의 출처는 `script.js:8355-8358`(시간대)과 `script.js:8915-8919`(여정 단계)다.

## 규칙

- **열거가 닫히는 접두사**는 그 값들만 살아있는 집합에 더한다.
- **열거가 닫히지 않는 접두사**(`mood-`)는 **접두사로 시작하는 모든 클래스를 살린다.**
  `normalizeMemoryMood`는 `[mood] || mood || "calm"`이라 저장된 임의의 값이 그대로
  클래스가 된다. 닫을 수 없는 것을 닫았다고 가정하지 않는다.

## 이 조사가 실제로 막은 오삭제

순진한 문자열 검색은 아래 6개를 사문이라 판정했다. **전부 살아 있다.**

`task-afternoon` · `task-evening` · `task-night` ·
`journey-forest` · `journey-hill` · `journey-garden`

`journey-room`·`journey-path`는 우연히 살아남았다 — `room`·`path`가 저장소 다른 곳에
부분 문자열로 있었기 때문이다. **검색은 양방향으로 못 믿는다.**

## 이미 머지된 삭제 재검사 (PR #61)

PR #61이 지운 43개 클래스에 조립 접두사가 걸리는지 확인했다. `journey-lane` 하나가
접두사에 걸렸지만 `lane`은 theme 값 다섯 개에 없다 — 조립으로 만들어지지 않으므로
사문 판정이 맞았다. **되돌릴 이유가 없다.**
````

- [ ] **Step 4: 커밋**

```bash
git add docs/artifacts/dead-css-live-set.md
git commit -m "런타임 조립 지점을 산출물로 남긴다"
```

---

### Task 2: 사문 325규칙 삭제 + 증거

**Files:**
- Modify: `styles.css` (규칙 325개 · 1716줄 삭제)
- Create: `docs/artifacts/dead-css-sweep-report.md`

**Interfaces:**
- Consumes: Task 1의 조립 산출물 목록
- Produces: `styles.css` 17,779줄 → 16,063줄

- [ ] **Step 1: 포트를 확인하고 서버를 띄운다**

```bash
netstat -ano | grep -E ':8776\s' || echo "8776 비어 있음"
PORT=8776 nohup node serve-local.cjs > /tmp/serve-8776.log 2>&1 &
```

3초 뒤 서빙되는지 확인한다:

```bash
node -e "fetch('http://127.0.0.1:8776/styles.css').then(r=>r.text()).then(t=>console.log('줄 수', t.split('\n').length))"
```

기대: 약 17779.

- [ ] **Step 2: 살아있는 집합을 만들고 사문 클래스를 산출한다**

`$TMP/build-dead-list.cjs`:

```js
// 사문 클래스를 산출한다. 저장소 전체에서 클래스 문자열을 찾되,
// 런타임 조립 산출물은 살아있는 것으로 미리 넣는다 (dead-css-live-set.md 근거).
const fs = require("fs");
const path = require("path");

// 열거가 닫히는 접두사의 값
const ASSEMBLED = [
  "task-morning", "task-afternoon", "task-evening", "task-night",
  "journey-room", "journey-path", "journey-forest", "journey-hill", "journey-garden",
  "is-ollie", "is-user",
  "book-cover", "book-foreword", "book-stats", "book-days", "book-letter",
];
// 열거가 닫히지 않는 접두사 — 이걸로 시작하면 무조건 살린다
const OPEN_PREFIXES = ["mood-"];

const root = process.cwd();
const SKIP = new Set(["node_modules", ".git", ".worktrees", ".claude", "docs", "test-results",
  "playwright-report", "apk", "mobile", ".backups", ".superpowers", "coverage"]);
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(html|js|cjs|mjs|jsx|ts|tsx)$/.test(e.name)) files.push(p);
  }
})(root);
const rel = (f) => path.relative(root, f).replace(/\\/g, "/");
const isTest = (f) => /^tests\//.test(rel(f)) || /\.test\.mjs$/.test(rel(f));
const prodText = files.filter((f) => !isTest(f)).map((f) => fs.readFileSync(f, "utf8")).join("\n");

const raw = fs.readFileSync("styles.css", "utf8").split("\r\n").join("\n");
const masked = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

// 클래스는 **셀렉터에서만** 뽑는다. 파일 전체를 훑으면 `rgba(0, 0, 0, .86)` 같은
// 소수에서 "86"을 클래스로 잡아 수가 부풀고(986/214), 기대값 대조가 무의미해진다.
const selectors = [];
{
  const stack = []; let pending = "";
  masked.split("\n").forEach((line) => {
    let buf = "";
    for (const ch of line) {
      if (ch === "{") { const s = (pending + buf).replace(/\s+/g, " ").trim(); stack.push(s); if (s && !s.startsWith("@")) selectors.push(s); pending = ""; buf = ""; }
      else if (ch === "}") { stack.pop(); pending = ""; buf = ""; }
      else buf += ch;
    }
    pending += buf + " ";
  });
}
const classes = new Set(selectors.flatMap((s) => [...s.matchAll(/\.([\w-]+)/g)].map((m) => m[1])));

const cache = new Map();
const live = (c) => {
  if (cache.has(c)) return cache.get(c);
  const v = ASSEMBLED.includes(c) || OPEN_PREFIXES.some((p) => c.startsWith(p)) || prodText.includes(c);
  cache.set(c, v);
  return v;
};
const dead = [...classes].filter((c) => !live(c)).sort();
fs.writeFileSync(process.argv[2], dead.join("\n"));
console.log(`셀렉터 클래스 ${classes.size}개 중 사문 ${dead.length}개`);
```

돌린다:

```bash
node $TMP/build-dead-list.cjs $TMP/dead.txt
```

기대: `셀렉터 클래스 849개 중 사문 144개`.

**수치가 다르면 멈춘다** — `main`이 움직였을 수 있다. 왜 달라졌는지 밝히고 진행한다.

- [ ] **Step 3: 삭제기를 만든다**

`$TMP/delete-dead.cjs`:

```js
// 사문 규칙을 지운다. v3 = v2(구간 시작 버그 수정) + 껍데기만 남은 @미디어 블록 정리.
//
// 구간의 시작은 `{`가 있는 줄이 아니라 셀렉터 텍스트가 시작된 줄이다. 셀렉터가
// 여러 줄에 걸치면 start를 `{` 줄로 잡고 지울 때 앞부분이 고아로 남아 **다음
// 살아있는 규칙에 들러붙는다.** 렌더는 안 바뀌므로 계산값 diff로는 안 잡힌다.
//
// 안의 규칙이 전부 사문이라 껍데기만 남는 @미디어 블록은 함께 지운다. 단
// **원래부터 비어 있던 블록은 건드리지 않는다** — 내 작업이 만든 것만 치운다.
//
// :not()/:has()/:is()/:where() 안의 클래스로는 사문 판정을 내리지 않는다.
const fs = require("fs");
const [cssPath, listPath, mode] = process.argv.slice(2);
const raw = fs.readFileSync(cssPath, "utf8");
const DEAD = new Set(fs.readFileSync(listPath, "utf8").split(/\s+/).filter(Boolean));
const masked = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
const lines = masked.split("\n");

const spans = [];
const stack = [];
let pending = "";
let selStart = null;

lines.forEach((line, i) => {
  let buf = "";
  for (const ch of line) {
    if (ch === "{") {
      const sel = (pending + buf).replace(/\s+/g, " ").trim();
      stack.push({ sel, start: selStart !== null ? selStart : i + 1 });
      pending = ""; buf = ""; selStart = null;
    } else if (ch === "}") {
      const r = stack.pop();
      if (r) spans.push({ ...r, end: i + 1, depth: stack.length });
      pending = ""; buf = ""; selStart = null;
    } else {
      buf += ch;
      if (selStart === null && /\S/.test(ch)) selStart = i + 1;
    }
  }
  pending += buf + " ";
});

const outside = (p) => p.replace(/:(?:not|is|where|has)\([^)]*\)/g, "");
const partDead = (p) => {
  const cls = [...outside(p).matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  return cls.length > 0 && cls.some((c) => DEAD.has(c));
};

const savedByExclusion = [];
const doomed = [];
for (const s of spans) {
  if (s.sel.startsWith("@") || !s.sel) continue;
  const parts = s.sel.split(",").map((x) => x.trim()).filter(Boolean);
  const naiveDead = (p) => {
    const cls = [...p.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
    return cls.length > 0 && cls.some((c) => DEAD.has(c));
  };
  const strict = parts.some(partDead) && parts.every(partDead);
  if (!strict) { if (parts.every(naiveDead)) savedByExclusion.push(s); continue; }
  doomed.push(s);
}

const doomedLines = new Set();
for (const s of doomed) for (let l = s.start; l <= s.end; l++) doomedLines.add(l);

// 껍데기만 남는 @미디어 정리 — 안에 규칙이 있었는데 전부 사문이 된 것만.
const atBlocks = spans.filter((s) => s.sel.startsWith("@"));
const emptiedAt = [];
for (const at of atBlocks) {
  const inner = spans.filter((s) => !s.sel.startsWith("@") && s.sel && s.start > at.start && s.end < at.end);
  if (!inner.length) continue;                       // 원래부터 비어 있던 블록은 건드리지 않는다
  if (!inner.every((s) => doomedLines.has(s.start))) continue;
  emptiedAt.push(at);
  for (let l = at.start; l <= at.end; l++) doomedLines.add(l);
}

const rawLines = raw.split("\n");
const kept = rawLines.filter((_, i) => !doomedLines.has(i + 1));

console.log(`삭제: 규칙 ${doomed.length}개 / ${doomedLines.size}줄  (@media 안 ${doomed.filter((s) => s.depth > 0).length}개)`);
console.log(`껍데기만 남아 함께 지운 @미디어 블록: ${emptiedAt.length}개`);
emptiedAt.forEach((s) => console.log(`  ${s.start}-${s.end}  ${s.sel.slice(0, 70)}`));
console.log(`:not() 제외 덕분에 살아남은 규칙: ${savedByExclusion.length}개`);
console.log(`줄 수 ${rawLines.length} → ${kept.length}`);

if (mode === "--write") { fs.writeFileSync(cssPath, kept.join("\n")); console.log("styles.css 갱신"); }
else console.log("(미리보기. 지우려면 --write)");
```

- [ ] **Step 4: 미리보기로 수치를 확인한다**

```bash
node $TMP/delete-dead.cjs styles.css $TMP/dead.txt
```

기대:

```
삭제: 규칙 325개 / 1716줄  (@media 안 50개)
껍데기만 남아 함께 지운 @미디어 블록: 7개
:not() 제외 덕분에 살아남은 규칙: 0개
줄 수 17779 → 16063
```

두 번째 줄은 **`:not()` 안의 클래스까지 세었더라면 지웠을 규칙**의 수다. 0이면 이번
데이터에서는 그 제외가 결과를 바꾸지 않았다는 뜻이고, 0이 아니면 **제외가 실제로
오삭제를 막고 있다**는 뜻이므로 그 목록을 보고서에 남긴다. 어느 쪽이든 삭제는
진행한다 — 제외는 항상 안전한 방향이다.

**이 계획의 코드는 작성 시점에 실제로 돌려 위 수치를 확인했다.** 다르게 나오면
`main`이 움직였을 수 있으니 왜 달라졌는지 먼저 밝힌다.

- [ ] **Step 5: 삭제 전 스냅샷을 뜬다**

```bash
node scripts/snapshot-computed-styles.cjs $TMP/before.json
```

기대: `총 6150 노드` 안팎. 페이지별 노드 수가 `landing 937 / admin 522 / app 1616`
꼴로 나와야 한다 — **admin이 1616이면 인증 게이트에 걸려 앱을 재고 있는 것**이므로
멈춘다(도구에 표지 셀렉터 검사가 있어 예외를 던진다).

- [ ] **Step 6: 삭제를 적용한다**

```bash
node $TMP/delete-dead.cjs styles.css $TMP/dead.txt --write
```

- [ ] **Step 7: 중괄호 균형과 빈 셀렉터를 확인한다**

```bash
node -e "
const fs=require('fs');
const masked=fs.readFileSync('styles.css','utf8').replace(/\/\*[\s\S]*?\*\//g,(m)=>m.replace(/[^\n]/g,' '));
const o=(masked.match(/{/g)||[]).length,c=(masked.match(/}/g)||[]).length;
const stack=[];let pending='';const bad=[];
masked.split('\n').forEach((line,i)=>{let buf='';
 for(const ch of line){
  if(ch==='{'){const s=(pending+buf).replace(/\s+/g,' ').trim();if(!s)bad.push(i+1);stack.push(s);pending='';buf='';}
  else if(ch==='}'){stack.pop();pending='';buf='';}
  else buf+=ch;}
 pending+=buf+' ';});
console.log('{',o,'}',c,o===c?'균형 OK':'깨짐');
console.log('셀렉터 빈 블록:',bad.length,'· 닫히지 않은 블록:',stack.length);
process.exit(o===c&&!bad.length&&!stack.length?0:1);
"
```

기대: `균형 OK`, 빈 블록 0, 닫히지 않은 블록 0.

- [ ] **Step 8: 유닛 테스트**

```bash
npm test > $TMP/unit.log 2>&1; echo "EXIT=$?"; grep -E '^# (tests|pass|fail)' $TMP/unit.log
```

기대: `# pass 458`, `# fail 0`.

`fonts.test.mjs`의 글리프 계약 테스트가 특히 중요하다 — 삭제가 글리프 주석이 달린
900 선언을 건드렸다면 여기서 걸린다.

- [ ] **Step 9: 계산값 diff — 이 태스크의 관문**

```bash
node scripts/snapshot-computed-styles.cjs $TMP/after.json
node scripts/snapshot-computed-styles.cjs --diff $TMP/before.json $TMP/after.json
echo "EXIT=$?"
```

기대: `차이 0`, `EXIT=0`.

**차이가 나오면 삭제를 밀어붙이지 않는다.**

1. 차이 난 키로 어떤 엘리먼트인지 찾는다.
2. `cp styles.css $TMP/keep.css` → `git checkout HEAD -- styles.css`로 되돌린 뒤,
   그 엘리먼트에 어떤 셀렉터가 매치하는지 `document.querySelectorAll`로 센다.
3. 매치가 있는 클래스는 **사문 판정이 틀린 것**이다. 그 클래스가 어떻게 살아났는지
   (새 조립 지점인지, 검색이 놓친 참조인지) 밝혀 `dead-css-live-set.md`에 추가하고,
   Step 2부터 다시 한다. `git stash`를 쓰지 않는다.

- [ ] **Step 10: 오삭제 0을 검산한다**

`$TMP/verify-deletion.cjs`:

```js
// 삭제 전후 스타일시트에서 규칙 셀렉터 다중집합을 뽑아 차집합을 본다.
// 사라진 셀렉터 중 사문 클래스를 담지 않은 것이 있으면 오삭제다.
// 줄바꿈 정규화가 필수다 — git show는 LF, 작업 파일은 CRLF라 정규화하지 않으면
// \r이 셀렉터에 섞여 존재하지도 않는 "삭제"가 무더기로 잡힌다.
const fs = require("fs");
const DEAD = new Set(fs.readFileSync(process.argv[4], "utf8").split(/\s+/).filter(Boolean));
const sels = (p) => {
  const raw = fs.readFileSync(p, "utf8").split("\r\n").join("\n");
  const masked = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const out = []; const stack = []; let pending = "";
  masked.split("\n").forEach((line) => {
    let buf = "";
    for (const ch of line) {
      if (ch === "{") { const s = (pending + buf).replace(/\s+/g, " ").trim(); stack.push(s); if (s && !s.startsWith("@")) out.push(s); pending = ""; buf = ""; }
      else if (ch === "}") { stack.pop(); pending = ""; buf = ""; }
      else buf += ch;
    }
    pending += buf + " ";
  });
  return out;
};
const before = sels(process.argv[2]);
const after = new Map();
for (const s of sels(process.argv[3])) after.set(s, (after.get(s) || 0) + 1);
const hasDead = (sel) => sel.split(",").some((p) =>
  [...p.replace(/:(?:not|is|where|has)\([^)]*\)/g, "").matchAll(/\.([\w-]+)/g)].some((m) => DEAD.has(m[1])));
const removed = [];
for (const s of before) {
  const n = after.get(s) || 0;
  if (n > 0) { after.set(s, n - 1); continue; }
  removed.push(s);
}
const wrong = removed.filter((s) => !hasDead(s));
console.log(`규칙 ${before.length} → ${before.length - removed.length} · 사라진 셀렉터 ${removed.length}`);
console.log(`사문 클래스 없이 사라진 규칙(오삭제): ${wrong.length}`);
wrong.slice(0, 20).forEach((s) => console.log("  ! " + s.slice(0, 110)));
process.exitCode = wrong.length ? 1 : 0;
```

돌린다:

```bash
git show HEAD:styles.css > $TMP/orig-styles.css
node $TMP/verify-deletion.cjs $TMP/orig-styles.css styles.css $TMP/dead.txt
echo "EXIT=$?"
```

기대: `오삭제: 0`, `EXIT=0`.

- [ ] **Step 11: e2e**

```bash
npx playwright test tests/e2e/onboarding.spec.js tests/e2e/pricing.spec.js tests/e2e/auth.spec.js tests/e2e/responsive.spec.js tests/e2e/legal.spec.js tests/e2e/tap-targets.spec.js tests/e2e/today.spec.js tests/e2e/plan.spec.js --workers=1 > $TMP/e2e.log 2>&1
echo "EXIT=$?"
tail -20 $TMP/e2e.log
```

기대: `EXIT=0`.

실패하면 이 브랜치가 원인인지 먼저 가른다 — **`git stash`를 쓰지 말고**
`cp styles.css $TMP/keep.css` → `git checkout HEAD -- styles.css` → 같은 스펙 재실행
→ `cp $TMP/keep.css styles.css`. 같은 실패가 나면 선행 결함이다.

- [ ] **Step 12: 보고서를 쓴다**

`docs/artifacts/dead-css-sweep-report.md`. 아래 뼈대에 실제 출력값을 채운다.

````markdown
# 사문 CSS 전수 청소 보고 — 규칙 325개 · 1609줄

`styles.css`의 셀렉터에 등장하는 클래스 849개 중 **144개가 저장소 어디에도 없다.**
그 클래스만으로 이루어진 규칙 325개(1609줄, 전체의 9.1%)를 지웠다.

## 무엇을 지웠나

| 항목 | 값 |
| --- | --- |
| 규칙 | 325개 (그중 `@media` 안 50개) |
| 줄 | 1609줄 — 17,779 → 16,170 |
| 사문 클래스 | 144개 |
| 손대지 않은 혼합 규칙 | 95개 |

## 판정 규칙

- 조각이 사문 := 그 조각의 클래스 중 하나라도 살아있는 집합에 없다
- 규칙 삭제 := 모든 콤마 조각이 사문
- `:not()`/`:has()`/`:is()`/`:where()` 안의 클래스로는 판정하지 않는다 —
  `:not(.foo)`는 `.foo`가 없어도 매치한다. 보류 <N>개

## 살아있는 집합에 런타임 조립을 더했다

문자열 검색만으로는 **6개를 잘못 지울 뻔했다.** 근거와 전체 목록은
`dead-css-live-set.md`에 있다.

## 증거

- 계산값 전수 diff: 3페이지 × 2폭 × 21종 속성, **노드 <N>개, 차이 0**
- 규칙 셀렉터 다중집합 대조: 규칙 3037 → 2712, **오삭제 0**
- `npm test` **458 pass / 0 fail**
- e2e: onboarding · pricing · auth · responsive · legal · tap-targets · today · plan
  — <N> passed
````

- [ ] **Step 13: 커밋**

```bash
git add styles.css docs/artifacts/dead-css-sweep-report.md
git commit -m "사문 CSS 규칙 325개를 지운다"
```

---

### Task 3: `.ghost-link` 조각 4곳과 공허한 단언

**Files:**
- Modify: `styles.css` (셀렉터 조각 4곳)
- Modify: `tests/e2e/today.spec.js` (단언 1줄 삭제)

**Interfaces:**
- Consumes: Task 2 이후의 `styles.css`
- Produces: `.ghost-link`가 저장소에서 완전히 사라진 상태

Task 2가 이미 단독 사문 규칙 2곳(`.execution-header-actions .ghost-link` 계열)을
지웠다. 여기서는 **`.text-button`과 묶인 혼합 규칙 4곳**의 조각만 뺀다.

- [ ] **Step 1: 남은 위치를 확인한다**

```bash
grep -n 'ghost-link' styles.css tests/e2e/today.spec.js
```

기대: `styles.css` 4곳(전부 `.text-button`과 콤마로 묶임) + `today.spec.js` 1곳.

- [ ] **Step 2: CSS 조각을 뺀다**

네 곳 모두 아래 형태다. `.ghost-link,` 줄을 지운다 (뒤따르는 `.text-button`이 남는다).

```css
.ghost-link,
.text-button {
```

→

```css
.text-button {
```

`.execution-page` 접두사가 붙은 것도 같다:

```css
.execution-page .ghost-link,
.execution-page .text-button {
```

→

```css
.execution-page .text-button {
```

- [ ] **Step 3: 테스트의 공허한 단언을 지운다**

`tests/e2e/today.spec.js`에서 이 줄을 지운다:

```js
    await expect(page.locator(".execution-header .ghost-link")).toBeHidden();
```

`.ghost-link`는 어느 HTML에도 없다. Playwright에서 존재하지 않는 요소는 hidden으로
취급되므로 이 단언은 항상 통과한다 — 아무것도 검증하지 않는다.
`.execution-header-actions`에는 이제 `.ollie-energy-meter`가 들어 있고 같은 역할의
대체 요소가 없다. 같은 테스트의 다른 단언(`#focusTaskTitle`·`#startFocusButton`·
탭 개수 4)이 이미 헤더를 검증하므로 **다시 겨누지 않고 지운다.**

- [ ] **Step 4: 저장소에서 완전히 사라졌는지 확인한다**

```bash
grep -rn 'ghost-link' --include='*.css' --include='*.js' --include='*.html' . 2>/dev/null | grep -v node_modules | grep -v '\.backups' | grep -v test-results || echo "ghost-link 없음"
```

기대: `ghost-link 없음`.

- [ ] **Step 5: 유닛 + 계산값 diff**

```bash
npm test > $TMP/unit3.log 2>&1; echo "EXIT=$?"; grep -E '^# (pass|fail)' $TMP/unit3.log
node scripts/snapshot-computed-styles.cjs $TMP/after3.json
node scripts/snapshot-computed-styles.cjs --diff $TMP/after.json $TMP/after3.json
echo "DIFF_EXIT=$?"
```

기대: `458 pass / 0 fail`, `차이 0`.

`.ghost-link`는 렌더되는 요소가 없으므로 조각을 빼도 계산값은 바뀌지 않는다. 차이가
나오면 `.text-button`을 잘못 건드린 것이다.

- [ ] **Step 6: `today.spec.js`를 돌린다**

```bash
npx playwright test tests/e2e/today.spec.js --workers=1 > $TMP/e2e3.log 2>&1
echo "EXIT=$?"
grep -E '^\s+[0-9]+ (passed|failed)' $TMP/e2e3.log | tail -2
```

기대: `EXIT=0`. 단언을 지운 파일이므로 이 스펙이 여전히 온전한지 봐야 한다.

- [ ] **Step 7: 커밋**

```bash
git add styles.css tests/e2e/today.spec.js
git commit -m "ghost-link의 CSS 잔재와 공허한 단언을 지운다"
```

---

### Task 4: 문서 갱신

**Files:**
- Modify: `docs/design-tokens.md`
- Modify: `docs/PROJECT_STATUS.md`

**Interfaces:**
- Consumes: Task 2·3의 결과 수치

- [ ] **Step 1: `docs/design-tokens.md`에 사문 청소를 적는다**

굵기 이관 절 뒤에 아래를 잇댄다:

```markdown
### 사문 CSS 청소 (2026-08-01)

굵기 이관과 별개로 `styles.css` 전체의 사문 규칙을 지웠다. 셀렉터에 등장하는 클래스
849개 중 **144개가 저장소 어디에도 없었고**, 그 클래스만으로 이루어진 규칙 325개
(1609줄, 전체의 9.1%)를 삭제했다. 두 라운드를 합치면 `styles.css`는 19,259 → 16,170줄이다.

**클래스 이름은 런타임에 조립될 수 있다.** `script.js:8402`가
`` `task-row task-${period.theme}` ``로 `task-afternoon` 같은 이름을 만든다 — 소스에
문자열로 존재하지 않는다. 사문 판정을 문자열 검색에만 맡기면 **살아있는 CSS를 지운다.**
조립 지점 전수 목록은 `docs/artifacts/dead-css-live-set.md`에 있다. 새 조립 지점을
만들면 거기에 추가하라.
```

- [ ] **Step 2: `docs/PROJECT_STATUS.md`에 기록한다**

**주의**: 이 파일은 다른 세션이 동시에 편집하는 일이 있었다. 먼저 확인한다:

```bash
git status --porcelain docs/PROJECT_STATUS.md
```

깨끗하면 굵기 이관 절 앞에 절을 추가한다:

```markdown
## 사문 CSS 전수 청소 (2026-08-01)

브랜치 `chore/dead-css-sweep`. `styles.css`의 셀렉터 클래스 849개 중 **144개가 저장소
어디에도 없었다.** 그 클래스만으로 이루어진 규칙 **325개 · 1609줄**을 지웠다
(전체의 9.1%). `.ghost-link`는 CSS 잔재와 함께 `today.spec.js`의 **아무것도 검증하지
않던 단언**도 지웠다 — 그 요소는 DOM에 없어 `toBeHidden()`이 항상 통과했다.

**이번 라운드의 교훈은 클래스 이름이 런타임에 조립된다는 것이다.** 문자열 검색이
사문이라 판정한 150개 중 6개가 실제로 살아 있었다(`task-afternoon` 계열,
`journey-forest` 계열). 조립 지점 전수 목록을 `docs/artifacts/dead-css-live-set.md`에
남겼다.

증거: 계산값 전수 diff 차이 0(3페이지 × 2폭 × 21종 속성), 규칙 다중집합 대조 오삭제 0,
`npm test` 458 pass, e2e 8개 스펙 통과.
```

- [ ] **Step 3: 최종 검산**

```bash
npm test
wc -l < styles.css
grep -c 'font-weight:\s*900' styles.css
```

기대: `458 pass`, 약 `16063`줄, 900은 **12** (글리프 캐리어 — 삭제가 건드리지 않았다).

- [ ] **Step 4: 커밋**

```bash
git add docs/
git commit -m "사문 CSS 청소를 문서에 적는다"
```

---

## 완료 조건

- `styles.css` 17,779 → **16,063줄** (1716줄 삭제)
- 계산값 전수 diff **차이 0** — 3페이지 × 2폭 × 21종 속성
- 규칙 셀렉터 다중집합 대조 **오삭제 0**
- `npm test` 458 pass / 0 fail, `font-weight: 900`은 **12** 그대로
- e2e 8개 스펙 통과 (`today` 포함 — 단언을 지운 파일)
- `ghost-link`가 저장소에서 완전히 사라짐
- `docs/artifacts/dead-css-live-set.md`가 조립 지점 5곳을 전부 적고 있음

## 범위 밖

- 900이 아닌 굵기 리터럴
- `core-loop-v2.css`
- 나머지 혼합 규칙 91개의 셀렉터 미용 정리
- CSS 변수·`@keyframes`의 사문 여부 — 클래스와 판정 방법이 다르다
