import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import worker from "./worker.mjs";

async function readWranglerConfig(name) {
  return JSON.parse(await readFile(new URL(name, import.meta.url), "utf8"));
}

test("Production과 Preview는 저장소 루트 자산에 SPA fallback을 적용한다", async () => {
  for (const name of ["wrangler.jsonc", "wrangler.preview.jsonc"]) {
    const config = await readWranglerConfig(name);
    assert.equal(config.assets.directory, ".");
    assert.equal(config.assets.binding, "ASSETS");
    assert.equal(config.assets.run_worker_first, true);
    assert.equal(config.assets.html_handling, "none");
    assert.equal(config.assets.not_found_handling, "single-page-application");
  }
});

test("알 수 없는 API 경로는 SPA 자산으로 전달하지 않고 JSON 404를 반환한다", async () => {
  let assetFetches = 0;
  const response = await worker.fetch(new Request("https://onmyway.olivenrich.com/api/does-not-exist"), {
    ASSETS: {
      async fetch() {
        assetFetches += 1;
        return new Response("index", { status: 200 });
      },
    },
  });

  assert.equal(response.status, 404);
  assert.match(response.headers.get("content-type") || "", /application\/json/);
  assert.equal(assetFetches, 0);
});

test("법적 페이지는 hostname과 무관하게 전용 HTML 자산으로 전달한다", async () => {
  const seen = [];
  const env = {
    ASSETS: {
      async fetch(request) {
        seen.push(new URL(request.url).pathname);
        return new Response("<!doctype html><title>On My Way</title>", {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      },
    },
  };

  for (const hostname of ["on-my-way.jungslawyer.workers.dev", "onmyway.olivenrich.com"]) {
    for (const pathname of ["/privacy", "/terms", "/support", "/delete-account"]) {
      const response = await worker.fetch(new Request(`https://${hostname}${pathname}`), env);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /On My Way/);
    }
  }
  assert.deepEqual(seen, [
    "/privacy.html", "/terms.html", "/support.html", "/delete-account.html",
    "/privacy.html", "/terms.html", "/support.html", "/delete-account.html",
  ]);
});

test("루트와 앱 진입점은 HTML 파일 URL을 바꾸지 않고 명시적으로 반환한다", async () => {
  const seen = [];
  const env = {
    ASSETS: {
      async fetch(request) {
        seen.push(new URL(request.url).pathname);
        return new Response("<!doctype html><title>On My Way</title>", { status: 200 });
      },
    },
  };

  for (const pathname of ["/", "/app"]) {
    const response = await worker.fetch(new Request(`https://onmyway.olivenrich.com${pathname}`), env);
    assert.equal(response.status, 200);
  }

  assert.deepEqual(seen, ["/index.html", "/app.html"]);
});
