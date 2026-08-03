/* mobile/scripts/patch-release-signing.mjs 계약 검사.
 *
 * 이 패치도 CI에서만 돌고 산출물은 AAB 안으로 사라진다. 어긋나면 서명 없는 번들이
 * 조용히 나오고 Play 업로드에서야 드러난다 — 그래서 다운로드 패치와 같은 규칙을
 * 고정한다: 예상한 템플릿이 아니면 시끄럽게 실패한다. */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { patchReleaseSigning } from "./mobile/scripts/patch-release-signing.mjs";

/* cap add android가 만드는 app/build.gradle의 뼈대 — 패치가 잡는 앵커만 담는다. */
const STOCK_GRADLE = `apply plugin: 'com.android.application'

android {
    namespace = "com.olivenrich.onmyway"
    defaultConfig {
        applicationId "com.olivenrich.onmyway"
        versionCode 1
        versionName "1.0"
    }
    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
`;

const ENV = { ANDROID_VERSION_CODE: "42", ANDROID_VERSION_NAME: "1.2.3" };

async function project(gradle = STOCK_GRADLE) {
  const dir = await mkdtemp(join(tmpdir(), "omw-signing-"));
  const appDir = join(dir, "android", "app");
  await mkdir(appDir, { recursive: true });
  if (gradle !== null) await writeFile(join(appDir, "build.gradle"), gradle, "utf8");
  return { dir, gradlePath: join(appDir, "build.gradle") };
}

test("버전을 리터럴로 박고 서명 설정을 심는다", async () => {
  const { dir, gradlePath } = await project();
  const result = await patchReleaseSigning(dir, ENV);
  assert.equal(result.versionCode, 42);
  assert.equal(result.versionName, "1.2.3");

  const gradle = await readFile(gradlePath, "utf8");
  assert.match(gradle, /versionCode 42/);
  assert.match(gradle, /versionName "1\.2\.3"/);
  assert.match(gradle, /signingConfigs \{/);
  assert.match(gradle, /storeType "pkcs12"/);
  assert.match(gradle, /signingConfig signingConfigs\.release/);
});

test("비밀번호는 파일에 박지 않고 gradle 평가 시점의 환경변수로만 읽는다", async () => {
  const { dir, gradlePath } = await project();
  await patchReleaseSigning(dir, { ...ENV, ANDROID_UPLOAD_KEYSTORE_PASSWORD: "actual-secret" });
  const gradle = await readFile(gradlePath, "utf8");
  assert.ok(!gradle.includes("actual-secret"), "비밀번호 값이 build.gradle에 박혔다");
  assert.match(gradle, /storePassword System\.getenv\("ANDROID_UPLOAD_KEYSTORE_PASSWORD"\)/);
});

test("버전이 없거나 형태가 틀리면 실패한다", async () => {
  const { dir } = await project();
  await assert.rejects(() => patchReleaseSigning(dir, {}), /ANDROID_VERSION_CODE/);
  await assert.rejects(
    () => patchReleaseSigning(dir, { ANDROID_VERSION_CODE: "5", ANDROID_VERSION_NAME: "1.0" }),
    /x\.y\.z/,
  );
});

test("템플릿 앵커가 없으면 덮어쓰지 않고 실패한다", async () => {
  const { dir } = await project(STOCK_GRADLE.replace('versionName "1.0"', 'versionName "2.0"'));
  await assert.rejects(() => patchReleaseSigning(dir, ENV), /예상한 템플릿이 아닙니다/);
});

test("두 번 패치하면 실패한다", async () => {
  const { dir } = await project();
  await patchReleaseSigning(dir, ENV);
  await assert.rejects(() => patchReleaseSigning(dir, ENV), /이미 signingConfigs/);
});

test("build.gradle이 없으면 cap add를 먼저 하라고 말한다", async () => {
  const { dir } = await project(null);
  await assert.rejects(() => patchReleaseSigning(dir, ENV), /cap add android/);
});
