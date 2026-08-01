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
