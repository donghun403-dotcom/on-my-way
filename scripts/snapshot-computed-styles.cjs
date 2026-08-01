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
// 레이아웃 속성(width·height·min-height·line-height·gap…)이 반드시 들어가야 한다.
// 타이포/색만 재면 히트 영역이 44px 밑으로 내려가는 회귀를 놓친다 —
// 이 프로젝트는 글꼴 폭 변화로 탭 타깃이 깨진 전례가 두 번 있다.
const PROPS = [
  "font-weight", "font-size", "font-family", "line-height", "letter-spacing",
  "color", "background-color", "border-radius", "box-shadow",
  "display", "position", "padding", "margin",
  "width", "height", "min-width", "min-height",
  "gap", "flex", "grid-template-columns",
];
// admin은 `mode: "inline"`이다. /admin.html은 인증 게이트라 세션 없이 열면
// app.html로 302 리다이렉트되고, 그러면 관리자 화면 대신 앱을 재게 된다
// (조용히 틀린 결과가 나오므로 Step 0의 자기 점검이 이를 잡는다).
// 대신 디스크의 관리자 마크업을 setContent로 심고 <base href>로 서버의
// styles.css를 물린다 — 게이트는 우회하되 스타일은 진짜를 쓴다.
const PAGES = [
  { name: "landing", mode: "goto", path: "/" },
  { name: "admin", mode: "inline", file: "admin.html" },
  { name: "app", mode: "app", path: "/app.html" },
];
const WIDTHS = [390, 1280];

// 페이지가 기대한 것인지 확인한다. 리다이렉트로 엉뚱한 문서를 재는 것을 막는다.
const SENTINEL = {
  landing: ".hero-trial-button",
  admin: ".admin-health-strip",
  app: ".execution-tabbar",
};

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
      if (page.mode === "app") {
        await prepareApp(p);
        await p.goto(page.path);
        await waitForAppReady(p);
      } else if (page.mode === "inline") {
        const html = fs.readFileSync(require("path").join(process.cwd(), page.file), "utf8");
        await p.setContent(html.replace(/<head(\s[^>]*)?>/i, (m) => `${m}<base href="${BASE}/">`),
          { waitUntil: "networkidle" });
      } else {
        await p.goto(page.path);
        await p.waitForLoadState("networkidle");
      }

      // 기대한 문서를 재고 있는지 확인한다 — 리다이렉트로 엉뚱한 페이지를
      // 조용히 재면 diff가 0이어도 아무것도 증명하지 못한다.
      const sentinel = SENTINEL[page.name];
      if (!(await p.locator(sentinel).count())) {
        throw new Error(`${page.name}@${width}: 표지 셀렉터 ${sentinel} 가 없다 — 다른 문서를 재고 있다`);
      }

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
