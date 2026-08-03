/* mobile/scripts/patch-download.mjs 계약 검사.
 *
 * 이 패치는 CI에서만 돌고 산출물은 APK 안으로 사라진다. 깨져도 빌드는 초록이고
 * 기기에서 파일이 안 생기는 것으로만 드러난다 — 1회차에 우리를 속인 그 실패 형태다.
 * 그래서 "빈 템플릿이 아니면 시끄럽게 실패한다"를 여기서 고정한다. */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { patchDownload } from "./mobile/scripts/patch-download.mjs";

const STOCK_TEMPLATE = `package com.olivenrich.onmyway.verifya;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {}
`;

const CONFIG_A = {
  appId: "com.olivenrich.onmyway.verifya",
  server: { url: "https://onmyway.olivenrich.com", cleartext: false },
};

const CONFIG_B = {
  appId: "com.olivenrich.onmyway.verifyb",
  server: { androidScheme: "https", hostname: "onmyway.olivenrich.com" },
};

async function shell({ config = CONFIG_A, template = STOCK_TEMPLATE, withProject = true } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "omw-patch-"));
  await writeFile(join(dir, "capacitor.config.json"), JSON.stringify(config), "utf8");
  const javaDir = join(dir, "android", "app", "src", "main", "java", "com", "olivenrich", "onmyway");
  if (withProject) {
    await mkdir(javaDir, { recursive: true });
    if (template !== null) await writeFile(join(javaDir, "MainActivity.java"), template, "utf8");
  }
  return { dir, activity: join(javaDir, "MainActivity.java") };
}

test("빈 템플릿을 다운로드 처리가 붙은 MainActivity로 바꾼다", async () => {
  const { dir, activity } = await shell();

  const result = await patchDownload(dir);
  assert.equal(result.packageName, "com.olivenrich.onmyway.verifya");

  const java = await readFile(activity, "utf8");
  assert.match(java, /^package com\.olivenrich\.onmyway\.verifya;/);
  assert.match(java, /setDownloadListener/);
  assert.match(java, /url\.startsWith\("blob:"\)/);
  assert.match(java, /MediaStore\.Downloads\.EXTERNAL_CONTENT_URI/);
});

test("JavascriptInterface는 현재 페이지 출처를 확인한 뒤에만 저장한다", async () => {
  const { dir, activity } = await shell();
  await patchDownload(dir);
  const java = await readFile(activity, "utf8");

  /* 이 검사가 없으면 WebView에 들어온 아무 페이지나 사용자 저장소에 쓸 수 있다.
     구성 A는 원격을 열고 로그인 중 provider 도메인으로 이동한다. */
  assert.match(java, /ALLOWED_ORIGIN = "https:\/\/onmyway\.olivenrich\.com"/);
  assert.match(java, /startsWith\(ALLOWED_ORIGIN\)/);
});

test("허용 출처는 구성 B의 hostname에서도 같은 값이 된다", async () => {
  const { dir } = await shell({ config: CONFIG_B });
  const result = await patchDownload(dir);
  assert.equal(result.origin, "https://onmyway.olivenrich.com");
});

/* 구성 C는 hostname 위장을 버리고 Capacitor 기본 origin을 쓴다. 예전에는 이 경우
   allowedOrigin이 예외를 던져 빌드가 통째로 실패했다 — 설정 실수를 잡으려던 검사가
   정상 구성 하나를 막고 있었다(run 30801472313에서 실제로 터졌다). */
test("허용 출처는 hostname이 없으면 Capacitor 기본값 localhost가 된다", async () => {
  const { dir } = await shell({ config: { server: { androidScheme: "https" } } });
  const result = await patchDownload(dir);
  assert.equal(result.origin, "https://localhost");
});

test("blob 읽기는 CapacitorHttp가 가로채지 않은 fetch를 먼저 쓴다", async () => {
  const { dir, activity } = await shell({ config: CONFIG_B });
  await patchDownload(dir);
  const java = await readFile(activity, "utf8");

  /* 구성 B는 CapacitorHttp가 전역 fetch를 네이티브로 빼돌린다. 그 fetch로 blob:을
     읽으려 하면 실패한다 — Capacitor가 남겨 둔 원본을 먼저 집어야 한다. */
  assert.match(java, /window\.CapacitorWebFetch\|\|window\.fetch/);
});

test("템플릿이 이미 코드를 담고 있으면 덮어쓰지 않고 실패한다", async () => {
  const withCode = STOCK_TEMPLATE.replace(
    "public class MainActivity extends BridgeActivity {}",
    "public class MainActivity extends BridgeActivity {\n  @Override\n  public void onCreate(Bundle b) { super.onCreate(b); }\n}",
  );
  const { dir, activity } = await shell({ template: withCode });

  await assert.rejects(() => patchDownload(dir), /이미 onCreate가 있습니다/);
  assert.equal(await readFile(activity, "utf8"), withCode, "실패했으면 원본이 그대로여야 한다");
});

test("BridgeActivity를 상속하지 않는 파일이면 실패한다", async () => {
  const { dir } = await shell({ template: "package com.x;\npublic class MainActivity {}\n" });
  await assert.rejects(() => patchDownload(dir), /빈 템플릿이 아닙니다/);
});

test("네이티브 프로젝트가 없으면 'cap add android'를 먼저 하라고 말한다", async () => {
  const { dir } = await shell({ withProject: false });
  await assert.rejects(() => patchDownload(dir), /cap add android/);
});
