# 타이포그래피 기반 재설계 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 잘난체를 저장소에서 완전히 걷어내고 Pretendard Variable을 실제로 self-host해서, `styles.css`의 굵기 선언이 처음으로 화면에서 구분되게 만든다.

**Architecture:** 폰트 자산을 먼저 넣어 로딩을 검증하고(Task 1), 토큰을 우회하던 지점을 정리한 뒤(Task 2), 굵기 역할 토큰을 세워 brand 선언을 이관하고(Task 3), 마지막에 가족 토큰을 Pretendard로 돌리며 잘난체를 제거한다(Task 4). 화면이 깨진 중간 상태가 생기지 않도록 "가족 전환"과 "굵기 이관"을 분리해 굵기를 먼저 옮긴다 — 잘난체는 굵기가 400 하나뿐이라 굵기를 먼저 바꿔도 화면이 변하지 않는다.

**Tech Stack:** 순수 HTML/CSS/JS (번들러 없음), Cloudflare Workers 정적 자산, `node --test` 유닛 테스트, Playwright e2e.

## Global Constraints

- 설계 근거는 `docs/typography-foundation-design.md`. 이 계획은 그 문서를 구현한다.
- 기준 커밋 `abcade5`. 이 문서의 모든 줄 번호는 이 커밋 기준이며, 편집이 진행되면 이동한다. **줄 번호로 찾지 말고 문자열로 찾는다.**
- `font-weight`는 **400 / 500 / 600 / 700 / 800 / 900 6단계만** 쓴다 (`docs/design-tokens.md:93`). 450 같은 중간값을 새로 만들지 않는다.
- `--font-*`는 글꼴 패밀리, `--text-*`는 크기, `--weight-*`는 굵기. **세 축을 섞지 않는다** (`docs/design-tokens.md:89`).
- `--text-2xs`(11px)가 최소 가독 크기다. 더 작은 값을 만들지 않는다.
- e2e는 **반드시** `E2E_BASE_URL=http://127.0.0.1:8766`을 넘긴다. 넘기지 않으면 8765의 다른 worktree 서버를 붙잡아 남의 파일을 테스트한다.
- 유닛 테스트는 저장소 루트의 `*.test.mjs`만 수집된다 (`package.json`의 `node --test *.test.mjs`). 새 유닛 테스트는 루트에 만든다.
- 백엔드·API·결제·인증·배포·마이그레이션은 건드리지 않는다.
- AGENTS.md: 요청 범위 밖의 리팩터링을 하지 않는다. 작업 종료 시 `docs/PROJECT_STATUS.md`를 갱신한다.

## 알려진 리스크 — `900`이 237개

`styles.css`의 `font-weight` 분포는 900이 237개, 700이 133개, 800이 124개다.
**700 이상이 494개**로 전체의 93%다.

지금은 폴백 글꼴에 그 굵기들이 없어서 700·800·900이 전부 같은 합성 볼드로 렌더링된다.
즉 **이 값들은 의도적으로 고른 것이 아니라 그냥 "굵게"였다.** Pretendard가 깔리면
셋이 서로 다른 굵기가 되고, 900은 진짜 Black으로 렌더링되어 앱이 전체적으로 무거워
보일 수 있다.

이 계획은 **237개를 일괄 변환하지 않는다.** 그건 브레인스토밍에서 기각한 "전면 재조판"이고,
검증하지 않을 화면까지 건드리게 된다. 대신 Task 5에서 지적된 4개 화면에 **실제로
렌더링되는** 900만 역할 토큰으로 옮기고, 나머지는 A·B 단계로 넘긴다.
Task 6에서 이 사실을 `docs/design-tokens.md`에 남겨 다음 단계가 이어받게 한다.

## File Structure

| 파일 | 책임 | 상태 |
| --- | --- | --- |
| `assets/fonts/pretendard/PretendardVariable.subset.{0..91}.woff2` | 폰트 바이너리 92개 | 생성 |
| `assets/fonts/pretendard/pretendard-variable.css` | `@font-face` 92블록. 여기 외에는 Pretendard를 선언하지 않는다 | 생성 |
| `assets/fonts/pretendard/OFL.txt` | SIL Open Font License 1.1 원문 (OFL 요구사항) | 생성 |
| `assets/fonts/README.md` | 폰트 출처·라이선스·체크섬 기록 | 수정 |
| `assets/fonts/yeogieottae-jalnan2.woff2` | — | **삭제** |
| `styles.css` | 토큰 정의와 모든 타이포 규칙 | 수정 |
| `index.html`, `app.html`, `admin.html` | 폰트 CSS `<link>` 추가 | 수정 |
| `script.js:358-359` | 글꼴 로드 실패 런타임 감지 (`data-brand-font-state`) | 수정 |
| `core-loop-v2.css` | 프로토타입 **자체** `@font-face`와 `--font-brand-*` 토큰 | 수정 |
| `core-loop-v2.js:483-489` | 프로토타입 자체 글꼴 로드 감지 | 수정 |
| `core-loop-v2.html:10` | 잘난체 woff2 `preload` 링크 | 수정 |
| `fonts.test.mjs` | 선언과 실물의 일치, 잘난체 잔존 0, 굵기 계약 가드 | 생성 |
| `core-loop-v2.test.mjs` | 잘난체 전제 단언 갱신 | 수정 |
| `tests/e2e/core-loop-v2.spec.js` | 잘난체 전제 단언 갱신, Pretendard 실로드 검증 추가 | 수정 |
| `docs/design-tokens.md` | 계약 3건 개정 | 수정 |
| `docs/PROJECT_STATUS.md` | 작업 기록 | 수정 |

---

### Task 1: Pretendard 자산 벤더링과 로딩 배선

잘난체는 그대로 둔다. 이 태스크가 끝나면 Pretendard가 **로드는 되지만 아직 아무 데도
적용되지 않은** 상태가 된다. 깨지는 것이 없다.

**Files:**
- Create: `assets/fonts/pretendard/` (woff2 92개 + `pretendard-variable.css` + `OFL.txt`)
- Create: `fonts.test.mjs`
- Modify: `assets/fonts/README.md`
- Modify: `index.html`, `app.html`, `admin.html`

**Interfaces:**
- Produces: `"Pretendard Variable"` 글꼴 가족명 (가변 축 범위 `45 920`). Task 4의 `--font-body`가 이 이름을 참조한다.
- Produces: `fonts.test.mjs` — Task 3·4가 여기에 테스트를 추가한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`fonts.test.mjs` (저장소 루트):

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const PRETENDARD_CSS = "assets/fonts/pretendard/pretendard-variable.css";

function woff2Sources(css) {
  return [...css.matchAll(/url\(\s*["']?([^"')]+\.woff2)["']?\s*\)/g)].map((m) => m[1]);
}

test("Pretendard 웹폰트 CSS가 존재하고 subset 92개를 선언한다", () => {
  assert.ok(fs.existsSync(PRETENDARD_CSS), `${PRETENDARD_CSS}가 없다`);
  const sources = woff2Sources(fs.readFileSync(PRETENDARD_CSS, "utf8"));
  assert.equal(sources.length, 92, "dynamic subset은 92개여야 한다");
});

test("Pretendard가 선언한 subset 파일이 전부 실제로 존재한다", () => {
  const dir = path.dirname(PRETENDARD_CSS);
  const sources = woff2Sources(fs.readFileSync(PRETENDARD_CSS, "utf8"));
  const missing = sources.filter((src) => !fs.existsSync(path.join(dir, src)));
  assert.deepEqual(missing, [], "선언은 있는데 파일이 없는 폰트");
});

// 이번 버그의 본질을 잡는 테스트다. styles.css가 이름만 적어두고 파일이 없던 상태를
// 기존 테스트가 통과시켰다. 선언된 모든 폰트 파일이 실재하는지 저장소 전체에서 본다.
test("styles.css가 선언한 @font-face 파일이 전부 실제로 존재한다", () => {
  const sources = woff2Sources(fs.readFileSync("styles.css", "utf8"));
  const missing = sources.filter((src) => !fs.existsSync(src));
  assert.deepEqual(missing, [], "선언은 있는데 파일이 없는 폰트");
});

test("OFL 라이선스 원문을 함께 배포한다", () => {
  const ofl = "assets/fonts/pretendard/OFL.txt";
  assert.ok(fs.existsSync(ofl), `${ofl}가 없다 — OFL은 라이선스 동봉을 요구한다`);
  assert.match(fs.readFileSync(ofl, "utf8"), /SIL OPEN FONT LICENSE/i);
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `npm test 2>&1 | grep -A3 "Pretendard"`
Expected: FAIL — `assets/fonts/pretendard/pretendard-variable.css가 없다`

- [ ] **Step 3: 벤더링 스크립트를 만들어 실행한다**

스크립트는 저장소에 커밋하지 않는다 (잘난체도 바이너리만 두고 출처는 README에 남겼다).
스크래치패드에 `vendor-pretendard.cjs`로 저장하고 **저장소 루트에서** 실행한다:

```js
const fs = require("fs");
const path = require("path");

const VERSION = "v1.3.9";
const CSS_URL = `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@${VERSION}/dist/web/variable/pretendardvariable-dynamic-subset.css`;
const WOFF2_BASE = `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@${VERSION}/packages/pretendard/dist/web/variable/woff2-dynamic-subset/`;
const LICENSE_URL = `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@${VERSION}/LICENSE`;
const OUT = path.resolve("assets/fonts/pretendard");

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const upstream = await (await fetch(CSS_URL)).text();
  const names = [...new Set([...upstream.matchAll(/(PretendardVariable\.subset\.\d+\.woff2)/g)].map((m) => m[1]))];
  if (names.length !== 92) throw new Error(`subset 개수가 92가 아니다: ${names.length}`);

  for (const name of names) {
    const res = await fetch(WOFF2_BASE + name);
    if (!res.ok) throw new Error(`${name} -> ${res.status}`);
    fs.writeFileSync(path.join(OUT, name), Buffer.from(await res.arrayBuffer()));
  }

  // src 경로를 CSS와 같은 폴더 기준으로 다시 쓴다.
  const local = upstream.replace(
    /url\(\s*["']?[^"')]*\/(PretendardVariable\.subset\.\d+\.woff2)["']?\s*\)/g,
    "url($1)",
  );
  if (/\.\.\//.test(local)) throw new Error("상대 경로가 남았다");
  fs.writeFileSync(path.join(OUT, "pretendard-variable.css"), local);

  const license = await (await fetch(LICENSE_URL)).text();
  fs.writeFileSync(path.join(OUT, "OFL.txt"), license);

  console.log(`완료: woff2 ${names.length}개 + CSS + OFL.txt`);
})();
```

Run: `node "<scratchpad>/vendor-pretendard.cjs"`
Expected: `완료: woff2 92개 + CSS + OFL.txt`

- [ ] **Step 4: 테스트를 돌려 통과를 확인한다**

Run: `npm test`
Expected: PASS. 기준선 443개 + 새 테스트 4개 = **447 pass / 0 fail**

- [ ] **Step 5: 3개 HTML에 폰트 CSS를 연결한다**

`index.html`, `app.html`, `admin.html` 각각에서 `styles.css` 링크를 찾아 **그 바로 앞**에
넣는다. 별도 `<link>`로 두는 이유는 `styles.css`와 **병렬로** 내려받게 하기 위해서다
(`@import`는 직렬화된다).

```html
<link rel="stylesheet" href="assets/fonts/pretendard/pretendard-variable.css" />
```

`privacy.html`, `terms.html`, `support.html`, `delete-account.html`은 `styles.css`를
쓰지 않으므로 건드리지 않는다.

`core-loop-v2.html`도 `styles.css`를 쓰지 않아 여기서는 제외한다 — 이 페이지는 자체
CSS로 잘난체를 직접 불러오고 있어서, **Task 4 Step 4에서 프로토타입 전체와 함께**
Pretendard로 옮긴다.

- [ ] **Step 6: 브라우저에서 실제로 로드되는지 확인한다**

로컬 서버를 8766으로 띄운다: `PORT=8766 node serve-local.cjs`

`http://127.0.0.1:8766/index.html`을 열고 콘솔에서:

```js
await document.fonts.ready;
const measure = (family) => {
  const span = document.createElement("span");
  span.textContent = "목표까지 가는 마일스톤";
  span.style.cssText = "position:absolute;left:-9999px;font-size:40px;white-space:nowrap";
  span.style.fontFamily = family;
  document.body.appendChild(span);
  const width = span.getBoundingClientRect().width;
  span.remove();
  return width;
};
// 폴백과 폭이 달라야 실제로 적용된 것이다. check()만 보면 로딩 중 상태를 오판한다.
({ base: measure("monospace"), pretendard: measure('"Pretendard Variable", monospace') });
```

Expected: 두 값이 서로 다르다. 같으면 로드 실패다.

- [ ] **Step 7: 출처를 README에 기록한다**

`assets/fonts/README.md`의 잘난체 절은 그대로 두고 (Task 4에서 지운다) 아래를 덧붙인다.
`<sha256>`은 `sha256sum assets/fonts/pretendard/pretendard-variable.css`로 실제 값을 넣는다.

```markdown
# Pretendard Variable

`pretendard/` 아래 파일은 Pretendard v1.3.9의 가변 폰트 dynamic subset 원본입니다.
변환하거나 수정하지 않았습니다.

- 공식 저장소: https://github.com/orioncactus/pretendard
- 라이선스: SIL Open Font License 1.1 (`pretendard/OFL.txt` 동봉)
- Copyright (c) 2021, Kil Hyung-jin, with Reserved Font Name Pretendard
- 받은 곳: https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/
- 구성: `PretendardVariable.subset.0.woff2` ~ `.91.woff2` (92개, 합계 약 2.82MB)
- 가변 축 범위: `font-weight: 45 920`
- `pretendard-variable.css` SHA-256: `<sha256>`

브라우저는 화면에 뜬 글자의 `unicode-range`에 해당하는 subset만 내려받습니다.
```

- [ ] **Step 8: 커밋**

```bash
git add assets/fonts/pretendard assets/fonts/README.md fonts.test.mjs index.html app.html admin.html
git commit -m "Pretendard를 저장소에 넣고 실제로 로드되는지 테스트로 고정한다"
```

---

### Task 2: 토큰을 우회하던 하드코딩 글꼴 스택을 없앤다

`styles.css`에 `-apple-system, BlinkMacSystemFont, …` 스택을 직접 쓴 곳이 4개 있다.
**여기는 `--font-body`를 거치지 않으므로 Task 4에서 토큰을 바꿔도 Pretendard가 적용되지
않는다.** 지금 정리해 둔다.

**Files:**
- Modify: `styles.css` (4곳)
- Modify: `fonts.test.mjs`

**Interfaces:**
- Consumes: 없음
- Produces: 없음. 이후 모든 글꼴 지정이 `--font-*` 토큰을 거친다는 불변식.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`fonts.test.mjs`에 추가:

```js
test("글꼴 스택을 하드코딩한 곳이 없다 — 전부 --font-* 토큰을 거친다", () => {
  const css = fs.readFileSync("styles.css", "utf8");
  const lines = css.split(/\r?\n/);
  const offenders = lines
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => /-apple-system/.test(line))
    .map(({ number, line }) => `${number}: ${line.trim().slice(0, 80)}`);
  assert.deepEqual(offenders, [], "글꼴 스택이 토큰을 우회하고 있다");
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `npm test 2>&1 | grep -A8 "하드코딩"`
Expected: FAIL — 4줄이 나열된다

- [ ] **Step 3: 4곳을 토큰으로 바꾼다**

`-apple-system`이 들어간 각 줄에서 글꼴 스택 전체를 `var(--font-body)`로 교체한다.
같은 선언 안의 다른 속성은 건드리지 않는다.

교체 전 (예):
```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
```
교체 후:
```css
font-family: var(--font-body);
```

`grep -n "apple-system" styles.css`로 4곳을 모두 찾아 처리한다.

- [ ] **Step 4: 테스트를 돌려 통과를 확인한다**

Run: `npm test`
Expected: **448 pass / 0 fail**

- [ ] **Step 5: 커밋**

```bash
git add styles.css fonts.test.mjs
git commit -m "글꼴 스택 하드코딩 4곳을 토큰으로 되돌린다"
```

---

### Task 3: 굵기 역할 토큰을 세우고 brand 선언 24곳을 이관한다

**가족은 아직 잘난체다.** 잘난체는 실제 굵기가 400 하나뿐이고 `font-synthesis: none`이라
굵기를 바꿔도 화면이 변하지 않는다. 그래서 지금 옮겨두면 Task 4의 가족 전환이 한 번에
올바른 결과로 착지한다.

**Files:**
- Modify: `styles.css`
- Modify: `fonts.test.mjs`

**Interfaces:**
- Produces: `--weight-body`(400) · `--weight-emphasis`(600) · `--weight-title`(700) · `--weight-display`(800). Task 5가 이 토큰을 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`fonts.test.mjs`에 추가:

```js
const WEIGHT_TOKENS = {
  "--weight-body": "400",
  "--weight-emphasis": "600",
  "--weight-title": "700",
  "--weight-display": "800",
};

test("굵기 역할 토큰이 정의되어 있다", () => {
  const css = fs.readFileSync("styles.css", "utf8");
  for (const [token, value] of Object.entries(WEIGHT_TOKENS)) {
    assert.match(css, new RegExp(`${token}:\\s*${value}\\s*;`), `${token}: ${value} 가 없다`);
  }
});

test("브랜드 글꼴 선언이 font-weight 400에 묶여 있지 않다", () => {
  // 잘난체는 굵기가 400 하나뿐이라 제목들이 400으로 못박혀 있었다. 가족만 바꾸고
  // 두면 제목이 지금보다 얇아진다. 그 상태로 되돌아가지 않게 막는다.
  const lines = fs.readFileSync("styles.css", "utf8").split(/\r?\n/);
  const offenders = [];
  lines.forEach((line, index) => {
    if (!/font-family:\s*var\(--font-brand-(display|ui)\)/.test(line)) return;
    for (let cursor = index + 1; cursor < Math.min(index + 14, lines.length); cursor += 1) {
      if (lines[cursor].includes("}")) break;
      if (/font-weight:\s*400\s*;/.test(lines[cursor])) offenders.push(cursor + 1);
    }
  });
  assert.deepEqual(offenders, [], "브랜드 글꼴 선언이 400에 묶여 있다");
});

test("font-weight는 6단계 계약 안의 값만 쓴다", () => {
  // docs/design-tokens.md:93. 650·750 같은 중간값이 다시 들어오지 않게 막는다.
  //
  // 토큰 참조를 통째로 면제하면 안 된다. `--weight-subtle: 450`을 만들어
  // `font-weight: var(--weight-subtle)`로 쓰면 막으려던 바로 그 값이 조용히 통과한다.
  // 그래서 토큰의 '값'까지 따라가 검사한다.
  const allowed = new Set(["400", "500", "600", "700", "800", "900", "inherit"]);
  const css = fs.readFileSync("styles.css", "utf8");

  const tokenValues = new Map(
    [...css.matchAll(/(--weight-[a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );
  const badTokens = [...tokenValues].filter(([, value]) => !allowed.has(value));
  assert.deepEqual(badTokens, [], "6단계 밖의 값을 가진 --weight-* 토큰");

  const bad = [];
  for (const match of css.matchAll(/font-weight:\s*([^;\n}]+)/g)) {
    const value = match[1].trim();
    const reference = value.match(/^var\((--weight-[a-z-]+)\)$/);
    if (reference) {
      // 선언되지 않은 토큰을 참조하면 그 규칙은 굵기가 없는 것과 같다. 오타를 잡는다.
      if (!tokenValues.has(reference[1])) bad.push(`${value} — 선언되지 않은 토큰`);
      continue;
    }
    if (!allowed.has(value)) bad.push(value);
  }
  assert.deepEqual([...new Set(bad)], [], "6단계 밖의 font-weight");
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `npm test 2>&1 | grep -A10 "굵기 역할\|브랜드 글꼴"`
Expected: FAIL — 토큰 미정의, 그리고 400에 묶인 8곳이 나열된다

- [ ] **Step 3: 토큰을 추가한다**

`styles.css`의 `:root` 안, `--font-numeric` 선언 바로 아래에 넣는다:

```css
  /* ---- typography weights ---- */
  /* 제목과 본문은 글꼴 가족이 아니라 굵기로 구분한다.
     값은 docs/design-tokens.md:93의 6단계 계약 안에서 고른다. */
  --weight-body: 400;
  --weight-emphasis: 600;
  --weight-title: 700;
  --weight-display: 800;
```

- [ ] **Step 4: brand 선언 24곳을 이관한다**

`grep -n "font-family: var(--font-brand-\(display\|ui\))" styles.css`로 24곳을 찾는다.
각 선언 블록의 `font-weight`를 아래 기준으로 역할 토큰으로 바꾼다.
**줄 번호가 아니라 그 요소가 화면에서 맡은 역할로 판단한다.**

| 역할 | 토큰 |
| --- | --- |
| 화면 제목(H1급), 큰 숫자, 주요 CTA | `var(--weight-display)` |
| 섹션·카드 제목 | `var(--weight-title)` |
| 라벨·메타·칩·탭처럼 짧은 UI 문구 | `var(--weight-emphasis)` |

세 갈래로 처리한다:

- **`font-weight: 400`으로 못박힌 8곳** — 위 기준에 맞는 토큰으로 교체한다. 판단이
  서지 않으면 8766 서버에서 해당 요소를 실제로 띄워 크기와 위치를 보고 정한다.
- **600·700이 지정된 6곳** — 같은 값의 역할 토큰으로 치환한다. 렌더 결과는 동일하다.
- **굵기 미지정 10곳** — 브라우저에서 `getComputedStyle(el).fontWeight`로 상속값을
  확인한다. 그 값이 위 표의 역할과 맞으면 그대로 두고, 어긋나면 토큰을 명시한다.

- [ ] **Step 5: 테스트를 돌려 통과를 확인한다**

Run: `npm test`
Expected: **451 pass / 0 fail**

- [ ] **Step 6: 화면이 변하지 않았는지 확인한다**

이 태스크는 아직 잘난체를 쓰므로 **눈에 보이는 변화가 없어야 한다.**
8766에서 `index.html`과 `app.html`을 열어 제목이 이전과 같은지 본다.
달라 보이면 잘못 이관한 것이다.

- [ ] **Step 7: 커밋**

```bash
git add styles.css fonts.test.mjs
git commit -m "굵기 역할 토큰을 세우고 브랜드 글꼴 선언 24곳을 옮긴다"
```

---

### Task 4: 가족 토큰을 Pretendard로 돌리고 잘난체를 제거한다

이 태스크에서 화면이 실제로 바뀐다.

**Files:**
- Modify: `styles.css`
- Delete: `assets/fonts/yeogieottae-jalnan2.woff2`
- Modify: `assets/fonts/README.md`
- Modify: `fonts.test.mjs`
- Modify: `core-loop-v2.test.mjs`
- Modify: `tests/e2e/core-loop-v2.spec.js`

**Interfaces:**
- Consumes: Task 1의 `"Pretendard Variable"`, Task 3의 `--weight-*`
- Produces: 모든 텍스트가 한 가족으로 렌더링되는 상태

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`fonts.test.mjs`에 추가:

```js
test("잘난체 참조가 저장소에 하나도 없다", () => {
  // plan-policy.test.mjs의 "PLAN_CONFIG.free 참조가 소스에 하나도 없다"와 같은 관용구.
  //
  // 이 파일 자신은 제외한다. 찾으려는 문자열이 아래 정규식 리터럴에 그대로 들어 있어서,
  // 제외하지 않으면 이 테스트가 스스로를 검출해 절대 통과하지 못한다.
  // .md는 대상이 아니다 — 설계 문서와 design-tokens.md는 과거 경위를 계속 서술해야 한다.
  const exts = /\.(mjs|js|cjs|html|css)$/;
  const skip = /node_modules|[\\/]\.git|\.worktrees|\.claude|test-results|playwright-report|blob-report/;
  const selfName = "fonts.test.mjs";
  const hits = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (skip.test(full)) continue;
      if (entry.isDirectory()) { walk(full); continue; }
      if (!exts.test(entry.name) || entry.name === selfName) continue;
      if (/여기어때 잘난체|Jalnan|jalnan/i.test(fs.readFileSync(full, "utf8"))) hits.push(full);
    }
  };
  walk(".");
  assert.deepEqual(hits, [], "잘난체 참조가 남아 있다");
});

test("글꼴 가족 토큰이 전부 Pretendard로 해석된다", () => {
  const css = fs.readFileSync("styles.css", "utf8");
  assert.match(css, /--font-body:\s*"Pretendard Variable"/);
  for (const token of ["--font-numeric", "--font-brand-display", "--font-brand-ui"]) {
    assert.match(css, new RegExp(`${token}:\\s*var\\(--font-body\\)`), `${token}가 --font-body를 가리키지 않는다`);
  }
});

// 이 테스트가 이번 작업의 존재 이유를 닫는다.
//
// 원래 버그는 "선언된 url()이 없는 파일을 가리킨" 것이 아니라 **--font-body가
// "Pretendard"라는 이름만 가리키고 그 이름의 @font-face가 저장소 어디에도 없던 것**이다.
// url()을 훑는 검사로는 절대 잡히지 않는다. Task 1의 리뷰가 이 구멍을 지적했다.
//
// 지금도 위험이 남아 있다: 벤더된 CSS가 선언하는 이름은 'Pretendard Variable'인데
// 토큰에 "Pretendard"라고 적으면 문자열이 달라 조용히 폴백된다. 그 오타를 여기서 잡는다.
test("--font-* 토큰이 가리키는 주 글꼴에 실제 @font-face가 있다", () => {
  const styles = fs.readFileSync("styles.css", "utf8");
  const vendored = fs.readFileSync(PRETENDARD_CSS, "utf8");
  const declared = new Set(
    [...`${styles}\n${vendored}`.matchAll(/@font-face\s*\{[^}]*?font-family:\s*["']([^"']+)["']/g)]
      .map((match) => match[1]),
  );
  // 폴백은 시스템 글꼴이라 @font-face가 없는 것이 정상이다. 첫 가족만 검사한다.
  const orphans = [...styles.matchAll(/--font-[a-z-]+:\s*([^;]+);/g)]
    .map((match) => match[1].trim())
    .filter((value) => !value.startsWith("var("))
    .map((value) => value.split(",")[0].trim().replace(/^["']|["']$/g, ""))
    .filter((family) => !declared.has(family));
  assert.deepEqual([...new Set(orphans)], [], "@font-face 없이 이름만 참조된 글꼴");
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `npm test 2>&1 | grep -A8 "잘난체 참조\|가족 토큰"`
Expected: FAIL — 잘난체 참조 파일들이 나열된다

- [ ] **Step 3: 가족 토큰을 바꾼다**

`styles.css`의 `:root`에서 네 줄을 교체한다:

```css
  /* ---- typography families ---- */
  /* 글꼴은 한 가족이다. 제목과 본문은 --weight-*로 구분한다. */
  --font-body: "Pretendard Variable", "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  --font-numeric: var(--font-body);
  --font-brand-display: var(--font-body);
  --font-brand-ui: var(--font-body);
```

`-apple-system`을 넣지 않는 이유는 Task 2의 가드 테스트와 충돌하기 때문이고,
기존 `--font-body`도 쓰지 않았다. 한글 폴백은 `Apple SD Gothic Neo`가 담당한다.

- [ ] **Step 4: 잘난체를 7개 파일에서 제거한다**

잘난체를 참조하는 파일은 **7개**다. `styles.css`만 고치면 나머지가 남아 삭제된 woff2를
가리키게 된다. 특히 **프로토타입(`core-loop-v2.*`)은 자체 `@font-face`와 자체
`--font-brand-*` 토큰을 갖고 있어** `styles.css` 변경이 전혀 닿지 않는다.

착수 전에 실제 목록을 확인한다:
`grep -rln "여기어때 잘난체\|Jalnan" --include=*.css --include=*.js --include=*.mjs --include=*.html .`

1. **`styles.css`** — 최상단 `@font-face` 블록 삭제 + 남은 직접 참조 3곳 삭제
2. **`script.js:358-359`** — 런타임 로드 감지를 Pretendard 기준으로 옮긴다:

```js
    await document.fonts.load('32px "Pretendard Variable"', "올리가 함께 걸어요");
    const loaded = document.fonts.check('32px "Pretendard Variable"', "올리가 함께 걸어요");
```

   실패 시 `data-brand-font-state="failed"`를 세우고 경고를 남기는 기존 동작은 유지한다.
   **이 장치가 이번 재발 방지의 런타임 절반이다** — 파일이 없으면 조용히 폴백되는 대신
   상태가 남는다.

3. **`core-loop-v2.css:2-3`** — 자체 `@font-face` 블록 삭제
4. **`core-loop-v2.css:10-11`** — 자체 `--font-brand-display` / `--font-brand-ui`를
   `styles.css`와 같은 값으로 맞춘다:

```css
  --font-brand-display: var(--font-body);
  --font-brand-ui: var(--font-body);
```

   이 파일의 `--font-body`도 Pretendard를 가리키는지 확인하고, 아니면 함께 고친다.

5. **`core-loop-v2.js:483-489`** — `script.js`와 같은 방식으로 Pretendard로 옮긴다.
   `console.warn` 문구의 글꼴 이름도 함께 바꾼다.
6. **`core-loop-v2.html:10`** — 잘난체 woff2를 가리키는 `preload` 링크를 삭제하고,
   이 페이지도 Pretendard를 받도록 폰트 CSS를 연결한다
   (이 파일은 `styles.css`를 쓰지 않아 Task 1에서 제외했다):

```html
<link rel="stylesheet" href="assets/fonts/pretendard/pretendard-variable.css" />
```

7. **`assets/fonts/yeogieottae-jalnan2.woff2`** — `git rm`
8. **`assets/fonts/README.md`** — 잘난체 절 전체 삭제 (Pretendard 절만 남긴다)

- [ ] **Step 5: 숫자 흔들림을 막는다**

`--font-numeric`을 쓰는 지점에 `font-variant-numeric: tabular-nums;`를 함께 건다.
체험 카운트다운처럼 1초마다 바뀌는 숫자에서 자릿수에 따라 글자가 들썩이는 것을 막는다.
(표시 문구 자체를 고치는 것은 B 단계다.)

- [ ] **Step 6: 잘난체를 전제한 기존 단언 25개를 갱신한다**

`core-loop-v2.test.mjs`:
- `--font-body` 토큰 문자열을 검사하는 정규식(`:24` 부근)을 새 값에 맞춘다.

`tests/e2e/core-loop-v2.spec.js`:
- `"actual Goal and Today paths load the local brand font…"` 테스트(`:16-34`)에서
  잘난체 woff2를 기다리던 부분을 Pretendard subset으로 바꾼다:

```js
const fontResponse = page.waitForResponse((response) =>
  /\/assets\/fonts\/pretendard\/PretendardVariable\.subset\.\d+\.woff2$/.test(response.url()),
);
```
- `document.fonts.check('32px "여기어때 잘난체"', …)` → `'32px "Pretendard Variable"'`
- 제목·CTA와 본문이 **서로 다른 가족**임을 단언하던 부분은 이제 성립하지 않는다.
  대신 **서로 다른 굵기**임을 단언한다:

```js
const weights = await page.evaluate(() => ({
  heading: getComputedStyle(document.querySelector("#diagnosisStepTitle")).fontWeight,
  input: getComputedStyle(document.querySelector("#designGoal")).fontWeight,
}));
expect(Number(weights.heading)).toBeGreaterThan(Number(weights.input));
```

- **로딩 중 상태를 통과로 착각하지 않도록** 폴백과 렌더 폭이 다른지까지 확인한다.

  ⚠️ **`document.fonts.ready`만으로는 부족하다.** Task 1에서 실측으로 확인된 함정이다 —
  dynamic subset은 해당 글리프가 실제로 그려질 때 fetch가 시작되므로, cold page에서는
  `ready`가 **fetch가 시작되기도 전에** resolve되어 폴백과 같은 폭을 돌려준다.
  반드시 `document.fonts.load()`로 그 글꼴과 그 문자열을 명시적으로 요청해 await한다:

```js
const applied = await page.evaluate(async () => {
  const sample = "목표까지 가는 마일스톤";
  // ready가 아니라 load다. 이 문자열의 subset을 실제로 요청하고 끝날 때까지 기다린다.
  await document.fonts.load('40px "Pretendard Variable"', sample);
  const measure = (family) => {
    const span = document.createElement("span");
    span.textContent = sample;
    span.style.cssText = "position:absolute;left:-9999px;font-size:40px;white-space:nowrap";
    span.style.fontFamily = family;
    document.body.appendChild(span);
    const width = span.getBoundingClientRect().width;
    span.remove();
    return width;
  };
  return measure('"Pretendard Variable", monospace') !== measure("monospace");
});
expect(applied).toBe(true);
```

- [ ] **Step 7: 유닛 테스트를 돌린다**

Run: `npm test`
Expected: **454 pass / 0 fail**

- [ ] **Step 8: e2e를 돌린다**

```bash
PORT=8766 node serve-local.cjs &
E2E_BASE_URL=http://127.0.0.1:8766 npx playwright test tests/e2e/core-loop-v2.spec.js
```

Expected: PASS. `E2E_BASE_URL`을 빠뜨리면 8765의 다른 worktree 서버를 테스트하게 된다.

- [ ] **Step 9: 커밋**

```bash
git add -A
git commit -m "글꼴을 Pretendard 한 가족으로 통일하고 잘난체를 걷어낸다"
```

---

### Task 5: 4개 화면을 실측해 남은 역할을 이관하고 눈으로 검증한다

여기서 "무엇을 더 고칠지"를 추측이 아니라 측정으로 정한다.

**Files:**
- Modify: `styles.css`
- Modify: `index.html`, `app.html` (preload 링크)
- Create: `docs/artifacts/typography-foundation-measurements.md`

**Interfaces:**
- Consumes: Task 3의 `--weight-*`

- [ ] **Step 1: 4개 화면에서 실제 사용 중인 타이포 조합을 수집한다**

**브라우저 도구(`preview_start`, Browser 패널)를 쓰지 않는다.** 그 경로는 이 저장소에서
두 번 실패했다 — worktree가 아닌 루트의 launch.json을 읽어 다른 세션의 8765 서버에 붙고,
패널이 표시되지 않으면 스크린샷이 프레임을 합성하지 못한다. **Playwright로 한다.**

수집·촬영은 기존 e2e 자산 위에 올린다. 새로 짜지 않는다:

- `tests/e2e/helpers.js`의 `prepareApp(page)` — 로그인 없이 `/app.html`이 뜨도록 스토리지를 세팅한다
- `tests/e2e/helpers.js`의 `completeManualPlan(page, { goal })` — 온보딩 위저드를 끝까지 진행한다
- `tests/e2e/responsive.spec.js:74-101`의 기존 흐름 — `page.goto("/app.html")` 후
  `#tab-today` / `#tab-plan`을 클릭해 탭에 도달하고 `page.screenshot({ fullPage: true })`로 찍는다

대상 화면 4개와 도달 경로:

| # | 화면 | 도달 방법 |
| --- | --- | --- |
| ① | 온보딩 조건 입력 | `page.goto("/index.html#designFlow")` |
| ② | 온보딩 1차 계획 보기 | 위에서 `completeManualPlan(page, { goal })` |
| ③ | 앱 오늘 탭 | `prepareApp(page)` → `page.goto("/app.html")` → `#tab-today` 클릭 |
| ④ | 앱 계획 탭 | 이어서 `#tab-plan` 클릭 |

각 화면에서 아래를 실행해 결과를 기록한다.

```js
(() => {
  const seen = new Map();
  document.querySelectorAll("*").forEach((el) => {
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!hasText || !el.getClientRects().length) return;
    const s = getComputedStyle(el);
    const key = `${s.fontSize} / ${s.fontWeight}`;
    if (!seen.has(key)) seen.set(key, { count: 0, sample: "" });
    const hit = seen.get(key);
    hit.count += 1;
    if (!hit.sample) hit.sample = el.textContent.trim().slice(0, 24);
  });
  return [...seen.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([k, v]) => `${k}  ×${v.count}  "${v.sample}"`);
})()
```

- [ ] **Step 2: 900이 실제로 뜨는 곳을 추린다**

수집 결과에서 `fontWeight: 900`인 조합을 골라낸다. `styles.css` 전체에는 900이 237개
있지만 **이 4개 화면에 실제로 렌더링되는 것만** 다룬다.

각각을 위 역할 표의 **세 단계 전부**에 비추어 옮긴다:

| 역할 | 토큰 |
| --- | --- |
| 화면 제목(H1급), 큰 숫자, 주요 CTA | `--weight-display` (800) |
| 섹션·카드 제목 | `--weight-title` (700) |
| **라벨·메타·칩·탭처럼 짧은 UI 문구** | **`--weight-emphasis` (600)** |

> **정정.** 이 절은 처음에 800과 700 **둘만** 제시했다. 그 결과 탭·칩·배지·모드 스위치 같은
> UI 크롬이 전부 700으로 몰려, 섹션 제목과 구분되지 않았다. 단계가 다시 둘로 줄면 이 작업의
> 목적(위계 회복)이 반토막 난다. `docs/typography-foundation-design.md`의 3단계 표가
> 원래부터 세 갈래였고, 그쪽이 옳다.

4개 화면 밖의 900은 **건드리지 않는다.** A·B 단계로 넘긴다.

- [ ] **Step 3: 실측 결과를 문서로 남긴다**

`docs/artifacts/typography-foundation-measurements.md`에 화면별 조합 목록, 옮긴 900의
개수와 위치, 그리고 다음 항목을 적는다:

- 첫 화면이 실제로 내려받은 subset 파일 개수와 총 바이트 (DevTools Network에서
  `PretendardVariable.subset` 필터)
- 그중 가장 먼저 요청된 1~2개의 파일명 — Step 4의 preload 대상

- [ ] **Step 4: preload를 건다**

Step 3에서 확인한 subset **1~2개만** `index.html`과 `app.html`에 넣는다.
추측으로 넣으면 쓰지 않는 파일을 받게 되므로 실측한 것만 넣는다.

```html
<link rel="preload" href="assets/fonts/pretendard/PretendardVariable.subset.<N>.woff2" as="font" type="font/woff2" crossorigin />
```

- [ ] **Step 5: 4개 폭에서 스크린샷을 찍는다**

320 / 390 / 430 / 1440 폭에서 Step 1의 화면 4개를 찍는다. Playwright의
`page.setViewportSize({ width, height })` + `page.screenshot({ fullPage: true })`를 쓴다
(`tests/e2e/responsive.spec.js:76,84`와 같은 방식). 헤드리스로 4개 폭 모두 정상 촬영되는 것을
사전에 확인해 두었다.

533개 굵기가 한꺼번에 실재화되므로 **범위와 무관하게 전체를 훑는다.** 특히 볼 것:

- 제목이 이전보다 얇아진 곳이 없는가 (Task 3에서 놓친 400 고정)
- 900이 남아 과하게 무거워 보이는 곳
- 줄바꿈이 달라져 넘치거나 잘린 곳 (Pretendard는 폴백 글꼴과 자폭이 다르다)

- [ ] **Step 6: 전체 테스트를 돌린다**

```bash
npm test
PORT=8766 node serve-local.cjs &
E2E_BASE_URL=http://127.0.0.1:8766 npx playwright test
```

Expected: 유닛 454 pass. e2e 전체 통과.

- [ ] **Step 7: 커밋**

```bash
git add styles.css index.html app.html docs/artifacts/typography-foundation-measurements.md
git commit -m "실측한 4개 화면의 굵기를 역할 토큰으로 옮기고 preload를 건다"
```

---

### Task 6: 문서를 갱신한다

**Files:**
- Modify: `docs/design-tokens.md`
- Modify: `docs/PROJECT_STATUS.md`

- [ ] **Step 1: `docs/design-tokens.md`의 계약 3건을 고친다**

1. **`:112`** — "여기어때 잘난체는 대표 제목·CTA·탭·칩에만. 본문·입력·숫자는 `--font-body`."
   → 삭제하고 대체한다: "글꼴은 Pretendard 한 가족이다. 제목과 본문은 가족이 아니라
   `--weight-*`로 구분한다."

2. **`:93-95`** — 6단계 굵기 규칙은 유지한다. 다만 그 근거였던 "폴백 글꼴에 존재하지
   않는 굵기"라는 전제가 바뀌었음을 덧붙인다: Pretendard 가변 폰트가 깔린 뒤로는
   6단계가 **모두 실제로 다르게 렌더링된다.**

3. **`:25-31`** — 이 절이 서술하는 수정은 `--font-body`를 덮어쓰던 토큰 충돌만
   해결했고, **글꼴 파일 자체는 없었다**는 사실을 덧붙인다. 그래서 수정 후에도 렌더
   결과는 OS 기본 글꼴이었다. 같은 오해가 반복되지 않게 남긴다.

4. **새 절 추가** — `--weight-*` 축을 토큰 목록에 넣고, 세 역할(`display` 800 /
   `title` 700 / `emphasis` 600)이 각각 무엇을 맡는지 적는다. 그리고 **`900`이 203개
   남아 있으며 그 값들은 의도적으로 고른 것이 아니라는 사실**을 적는다 — 폴백 글꼴에서는
   700·800·900이 같은 합성 볼드로 렌더링돼 구분이 없었다. A·B 단계가 이어받는다.

5. **탭 타깃 계약에 글꼴 의존성을 명시한다.** `:132` 근처의 "모든 독립 컨트롤은 44×44를
   만족한다" 절에 이번에 겪은 것을 남긴다:

   > 글꼴 가족을 바꾸면 글자 폭이 바뀐다. 히트 영역이 글자 폭을 따라가는 컨트롤은
   > 그때 44px 밑으로 내려갈 수 있다. 실제로 Pretendard 전환에서 푸터 법적 링크가
   > 44 → 38.03px로 내려갔고 `tap-targets.spec.js` 8건이 깨졌다. `::after` 오버레이에
   > `min-width: 44px`를 넣어 글자 폭과 무관하게 만들었다.
   > **글꼴을 바꾸는 작업은 이 테스트를 반드시 돌린다.**

   이 사실은 계획 단계에서 예상하지 못했고 실측이 아니었으면 놓쳤다. 그래서 남긴다.

6. **3단계 표의 공백을 적는다.** `--weight-*` 역할 표는 UI 요소(제목·라벨·칩·탭)만
   상정하고 **본문 성격의 강조**를 다루지 않는다. `.ollie-message p` /
   `.ollie-chat-preview p`(올리 말풍선 본문)와 `.app-toast`가 어디에도 맞지 않아
   700에 판단 보류로 남아 있다. 표를 늘릴지 이 둘을 재배치할지는 A·B 단계의 결정이므로,
   여기서는 **공백이 있다는 사실만 명시**한다. 임의로 채우지 않는다.

- [ ] **Step 2: `docs/PROJECT_STATUS.md`를 갱신한다**

AGENTS.md가 작업 종료 시 갱신을 요구한다. **자기 섹션만 추가하고 다른 섹션을
재정렬하거나 고쳐 쓰지 않는다** — 다른 worktree가 같은 파일을 건드리고 있어
충돌이 나기 쉽다.

적을 것: 무엇이 문제였는지, 왜 기존 테스트가 못 잡았는지(토큰 **문자열만** 검사해서
파일이 없는 상태를 통과시켰다), 무엇을 바꿨는지, 실측 수치(첫 화면이 실제로 받는 subset
개수), 글꼴 전환이 탭 타깃을 깨뜨렸다가 고쳐진 일, 그리고 남은 900 203개가 A·B로
넘어간다는 사실.

- [ ] **Step 3: 커밋**

```bash
git add docs/design-tokens.md docs/PROJECT_STATUS.md
git commit -m "타이포 토큰 계약 개정을 문서에 반영한다"
```

---

## 완료 조건

- `npm test` — 454 pass / 0 fail
- `E2E_BASE_URL=http://127.0.0.1:8766 npx playwright test` — 전체 통과
- 저장소에 `여기어때 잘난체` / `Jalnan` 참조 0건, woff2 파일 삭제됨
- 4개 화면 × 4개 폭 스크린샷 확인 완료
- `docs/artifacts/typography-foundation-measurements.md`에 실측 수치 기록
- `docs/design-tokens.md`와 `docs/PROJECT_STATUS.md` 갱신
