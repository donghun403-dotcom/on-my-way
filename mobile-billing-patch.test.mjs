/* mobile/scripts/patch-billing.mjs 계약 검사.
 *
 * 이 패치가 어긋나면 두 가지로 드러난다. 의존성이 빠지면 매니페스트에
 * com.android.vending.BILLING이 안 붙어 Play Console이 구독 상품 생성을 계속 막고,
 * 다리 등록이 빠지면 기기에서 구매 버튼이 아무 반응도 하지 않는다. 둘 다 업로드하고
 * 눌러 봐야 아는 실패라 여기서 시끄럽게 깨뜨린다.
 *
 * 생성된 Java의 보안 불변식도 여기서 지킨다 — JavascriptInterface는 WebView에 들어온
 * 모든 페이지에 노출되고, 로그인 중에는 provider 도메인이 올라온다. */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { patchBilling, billingBridgeSource, BILLING_LIBRARY_VERSION, JS_CALLBACK } from "./mobile/scripts/patch-billing.mjs";

/* cap add android가 만드는 app/build.gradle의 dependencies 블록 — 앵커만 담는다. */
const STOCK_GRADLE = `apply plugin: 'com.android.application'

android {
    namespace = "com.olivenrich.onmyway"
}

dependencies {
    implementation fileTree(include: ['*.jar'], dir: 'libs')
    implementation project(':capacitor-android')
    testImplementation "junit:junit:$junitVersion"
}
`;

/* patch-download.mjs가 만든 뒤의 MainActivity.java — 이 패치가 잡는 앵커만 담는다. */
const PATCHED_ACTIVITY = `package com.olivenrich.onmyway;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String ALLOWED_ORIGIN = "https://localhost";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final WebView webView = getBridge().getWebView();
        webView.addJavascriptInterface(new BlobBridge(), "OmwBlobBridge");
    }
}
`;

async function project({ gradle = STOCK_GRADLE, activity = PATCHED_ACTIVITY } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "omw-billing-"));
  const appDir = join(dir, "android", "app");
  const packageDir = join(appDir, "src", "main", "java", "com", "olivenrich", "onmyway");
  await mkdir(packageDir, { recursive: true });
  if (gradle !== null) await writeFile(join(appDir, "build.gradle"), gradle, "utf8");
  if (activity !== null) await writeFile(join(packageDir, "MainActivity.java"), activity, "utf8");
  return {
    dir,
    gradlePath: join(appDir, "build.gradle"),
    activityPath: join(packageDir, "MainActivity.java"),
    bridgePath: join(packageDir, "OmwBillingBridge.java"),
  };
}

test("dependencies 블록 안에 billingclient를 넣는다", async () => {
  const { dir, gradlePath } = await project();
  const result = await patchBilling(dir);
  assert.equal(result.version, BILLING_LIBRARY_VERSION);

  const gradle = await readFile(gradlePath, "utf8");
  assert.ok(gradle.includes(`com.android.billingclient:billing:${BILLING_LIBRARY_VERSION}`));

  /* 블록 밖에 떨어지면 gradle이 평가 시점에 깨진다. 문자열 존재만 보면 새어 나가도
     통과하므로 위치까지 본다. */
  const anchorAt = gradle.indexOf("implementation project(':capacitor-android')");
  const billingAt = gradle.indexOf("com.android.billingclient");
  const blockEndsAt = gradle.indexOf("\n}", gradle.indexOf("dependencies {"));
  assert.ok(anchorAt < billingAt && billingAt < blockEndsAt);
});

test("다리 파일을 MainActivity와 같은 패키지에 만든다", async () => {
  const { dir, bridgePath } = await project();
  const result = await patchBilling(dir);
  assert.equal(result.packageName, "com.olivenrich.onmyway");
  assert.equal(result.bridgePath, bridgePath);

  const java = await readFile(bridgePath, "utf8");
  assert.match(java, /^package com\.olivenrich\.onmyway;/);
  assert.match(java, /class OmwBillingBridge implements PurchasesUpdatedListener/);
});

test("MainActivity에 등록 한 줄을 앵커 뒤에 끼운다", async () => {
  const { dir, activityPath } = await project();
  await patchBilling(dir);
  const java = await readFile(activityPath, "utf8");

  const anchorAt = java.indexOf('new BlobBridge(), "OmwBlobBridge"');
  const billingAt = java.indexOf("new OmwBillingBridge(");
  const methodEndsAt = java.indexOf("\n    }", anchorAt);
  assert.ok(anchorAt < billingAt, "앵커보다 앞에 들어갔다");
  assert.ok(billingAt < methodEndsAt, "onCreate 밖으로 나갔다");
  assert.match(java, /new OmwBillingBridge\(this, webView, ALLOWED_ORIGIN\)/);
});

test("모든 요청과 결과에서 출처를 확인한다", () => {
  /* JavascriptInterface는 WebView의 모든 페이지에 노출된다. 결과 쪽 검사가 특히
     중요하다 — 구매 도중 로그인 provider 페이지로 넘어가 있으면 purchaseToken이
     그쪽으로 간다. 토큰 하나면 남의 구독을 자기 계정에 붙일 수 있다. */
  const java = billingBridgeSource("com.example.app");
  assert.match(java, /private boolean fromAllowedOrigin\(\)/);
  const guards = java.match(/fromAllowedOrigin\(\)/g) || [];
  assert.ok(guards.length >= 4, `출처 검사가 너무 적다 (${guards.length}곳)`);
  assert.match(java, /if \(!fromAllowedOrigin\(\)\) return;[\s\S]*evaluateJavascript/);
});

test("클라이언트가 구매를 승인하지 않는다", () => {
  /* 승인은 서버가 purchaseToken을 검증하면서 한다. 클라이언트가 승인하면
     "승인은 됐는데 우리 DB에는 없는" 상태가 생기고, 그 유저는 돈을 내고 권한이 없다. */
  const java = billingBridgeSource("com.example.app");
  assert.ok(!/acknowledgePurchase\s*\(/.test(java), "다리가 직접 승인하고 있다");
});

test("PENDING 구매는 서버로 보내지 않는다", () => {
  /* 아직 돈이 오가지 않은 상태다. 보내면 구글이 '구매 아님'으로 답해 실패로 남고,
     결제가 끝나면 어차피 알림이 다시 온다. */
  const java = billingBridgeSource("com.example.app");
  assert.match(java, /getPurchaseState\(\) != Purchase\.PurchaseState\.PURCHASED\) continue/);
});

test("JS 콜백 이름이 한 곳에서만 온다", () => {
  const java = billingBridgeSource("com.example.app");
  assert.equal(JS_CALLBACK, "window.__omwBilling");
  assert.ok(java.includes(`typeof ${JS_CALLBACK} === 'function'`));
});

test("gradle 앵커가 없으면 덮어쓰지 않고 실패한다", async () => {
  const { dir } = await project({ gradle: STOCK_GRADLE.replace("implementation project(':capacitor-android')", "") });
  await assert.rejects(() => patchBilling(dir), /예상한 템플릿이 아닙니다/);
});

test("MainActivity 앵커가 없으면 실패한다 — patch-download가 먼저다", async () => {
  const { dir } = await project({ activity: PATCHED_ACTIVITY.replace(/webView\.addJavascriptInterface.*\n/, "") });
  await assert.rejects(() => patchBilling(dir), /patch-download\.mjs를 먼저 실행/);
});

test("두 번 패치하면 실패한다", async () => {
  const { dir } = await project();
  await patchBilling(dir);
  await assert.rejects(() => patchBilling(dir), /이미 billingclient/);
});

test("build.gradle이 없으면 cap add를 먼저 하라고 말한다", async () => {
  const { dir } = await project({ gradle: null });
  await assert.rejects(() => patchBilling(dir), /cap add android/);
});
