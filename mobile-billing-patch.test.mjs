/* mobile/scripts/patch-billing.mjs 계약 검사.
 *
 * 이 패치가 어긋나면 매니페스트에 com.android.vending.BILLING이 안 붙고, 그러면
 * Play Console이 구독 상품 생성을 계속 막는다 — 업로드하고 콘솔을 열어 봐야 알게 되는
 * 종류의 실패다. 다른 patch-*.mjs와 같은 규칙을 고정한다: 예상한 템플릿이 아니면
 * 시끄럽게 실패한다. */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { patchBilling, BILLING_LIBRARY_VERSION } from "./mobile/scripts/patch-billing.mjs";

/* cap add android가 만드는 app/build.gradle의 dependencies 블록 — 앵커만 담는다. */
const STOCK_GRADLE = `apply plugin: 'com.android.application'

android {
    namespace = "com.olivenrich.onmyway"
}

dependencies {
    implementation fileTree(include: ['*.jar'], dir: 'libs')
    implementation "androidx.appcompat:appcompat:$androidxAppCompatVersion"
    implementation project(':capacitor-android')
    testImplementation "junit:junit:$junitVersion"
}
`;

async function project(gradle = STOCK_GRADLE) {
  const dir = await mkdtemp(join(tmpdir(), "omw-billing-"));
  const appDir = join(dir, "android", "app");
  await mkdir(appDir, { recursive: true });
  if (gradle !== null) await writeFile(join(appDir, "build.gradle"), gradle, "utf8");
  return { dir, gradlePath: join(appDir, "build.gradle") };
}

test("dependencies 블록에 billingclient를 넣는다", async () => {
  const { dir, gradlePath } = await project();
  const result = await patchBilling(dir);
  assert.equal(result.version, BILLING_LIBRARY_VERSION);

  const gradle = await readFile(gradlePath, "utf8");
  assert.match(gradle, new RegExp(`implementation "com\\.android\\.billingclient:billing:${BILLING_LIBRARY_VERSION.replace(/\./g, "\\.")}"`));
});

test("앵커 뒤에 넣어 dependencies 블록 안에 남는다", async () => {
  const { dir, gradlePath } = await project();
  await patchBilling(dir);
  const gradle = await readFile(gradlePath, "utf8");

  /* 블록 밖에 떨어지면 gradle이 평가 시점에 깨진다. 앵커 줄과 닫는 중괄호 사이에
     있는지로 확인한다 — 위치를 안 보면 "문자열이 있다"만으로 통과해 버린다. */
  const anchorAt = gradle.indexOf("implementation project(':capacitor-android')");
  const billingAt = gradle.indexOf("com.android.billingclient");
  const blockEndsAt = gradle.indexOf("\n}", gradle.indexOf("dependencies {"));
  assert.ok(anchorAt < billingAt, "앵커보다 앞에 들어갔다");
  assert.ok(billingAt < blockEndsAt, "dependencies 블록 밖으로 나갔다");
});

test("버전은 소스에 한 곳으로만 있다", () => {
  /* 워크플로나 문서에 버전을 또 적으면 올릴 때 한쪽만 바뀐다. 상수 하나가 소스다. */
  assert.match(BILLING_LIBRARY_VERSION, /^\d+\.\d+\.\d+$/);
});

test("템플릿 앵커가 없으면 덮어쓰지 않고 실패한다", async () => {
  const { dir } = await project(STOCK_GRADLE.replace("implementation project(':capacitor-android')", ""));
  await assert.rejects(() => patchBilling(dir), /예상한 템플릿이 아닙니다/);
});

test("두 번 패치하면 실패한다", async () => {
  const { dir } = await project();
  await patchBilling(dir);
  await assert.rejects(() => patchBilling(dir), /이미 billingclient/);
});

test("build.gradle이 없으면 cap add를 먼저 하라고 말한다", async () => {
  const { dir } = await project(null);
  await assert.rejects(() => patchBilling(dir), /cap add android/);
});
