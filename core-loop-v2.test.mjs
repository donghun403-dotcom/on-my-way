import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [html, css, script, server] = await Promise.all([
  readFile(new URL("./core-loop-v2.html", import.meta.url), "utf8"),
  readFile(new URL("./core-loop-v2.css", import.meta.url), "utf8"),
  readFile(new URL("./core-loop-v2.js", import.meta.url), "utf8"),
  readFile(new URL("./serve-local.cjs", import.meta.url), "utf8"),
]);

test("core loop prototype is isolated from the default product path and provider APIs", () => {
  assert.match(html, /<script src="core-loop-v2\.js" defer><\/script>/);
  assert.match(html, /<meta name="robots" content="noindex,nofollow"/);
  assert.doesNotMatch(script, /\bfetch\s*\(/);
  assert.doesNotMatch(script, /\/api\/(?:ai|auth|billing)/);
  assert.match(script, /aiCalls:\s*\{\s*generation:\s*0,\s*revision:\s*0\s*\}/);
});

test("brand font is local, explicit, and separate from the body stack", () => {
  assert.match(css, /font-family:\s*"여기어때 잘난체"/);
  assert.match(css, /--font-brand-display:\s*"여기어때 잘난체"/);
  assert.match(css, /--font-body:\s*"Pretendard",\s*"Apple SD Gothic Neo",\s*"Malgun Gothic",\s*sans-serif/);
  assert.match(css, /assets\/fonts\/yeogieottae-jalnan2\.woff2/);
  assert.doesNotMatch(css, /https?:\/\//);
  assert.match(server, /\.woff2":\s*"font\/woff2"/);
});

test("goal prototype keeps only goal and period required without native planning controls", () => {
  assert.equal((html.match(/\srequired(?:\s|>)/g) || []).length, 2);
  assert.match(html, /id="prototypeGoal"[^>]*required/);
  assert.equal((html.match(/type="radio"/g) || []).length, 4);
  assert.doesNotMatch(html, /type="checkbox"|type="date"|<select\b/);
  assert.match(css, /\.period-picker\s*\{[^}]*border:\s*0/s);
  assert.match(css, /\.choice-chips input\s*\{[^}]*opacity:\s*0/s);
});

test("prototype state contract keeps stable typed items and automatic Diary persistence", () => {
  for (const value of ["ACTION", "REVIEW", "TIP", "SYSTEM_RULE"]) {
    assert.match(script, new RegExp(`type: "${value}"`));
  }
  assert.match(script, /id:\s*"prototype-action-001"/);
  assert.match(script, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(script, /state\.diary\.push\(/);
  assert.match(script, /if\s*\(!state\.taskCompleted\)/);
  assert.match(script, /state\.growthCount \+= 1/);
});

test("prototype output uses textContent for user-controlled goal and change values", () => {
  assert.match(script, /setText\("#roadmapGoal", state\.goal\)/);
  assert.match(script, /text\.textContent = change/);
  assert.doesNotMatch(script, /innerHTML\s*=\s*state\./);
});
