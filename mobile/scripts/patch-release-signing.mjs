#!/usr/bin/env node
/* 생성된 android/app/build.gradle에 릴리스 서명과 버전을 심는다.
 *
 * 네이티브 프로젝트는 커밋하지 않고 빌드마다 `cap add android`로 새로 만든다
 * (이유는 mobile/README.md). 그래서 서명 설정도 patch-download.mjs와 같은 방식으로
 * 생성 직후에 주입한다 — 템플릿이 예상과 다르면 조용히 넘어가지 않고 실패한다.
 *
 * 두 가지를 심는다.
 *
 *   ① versionCode / versionName — 환경변수 값을 리터럴로 박는다. 로그의
 *      `Record the resolved config` 단계에서 눈으로 확인할 수 있게 하기 위해서다.
 *   ② signingConfigs.release — 키스토어 경로만 리터럴이고 **비밀번호는 gradle 평가
 *      시점에 System.getenv로 읽는다.** 파일에 박으면 실패 리포트 아티팩트에 비밀번호가
 *      실려 나갈 수 있다.
 *
 * 키스토어는 openssl로 만든 PKCS12다(이 저장소의 개발 머신에는 JDK가 없어 keytool을
 * 쓸 수 없다). Android Gradle은 storeType "pkcs12"를 그대로 받는다.
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MOBILE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* 앵커가 하나라도 없으면 Capacitor 템플릿이 바뀐 것이다. 패치가 어긋난 채 서명 없는
   AAB가 나오면 Play 업로드에서야 드러난다 — 여기서 미리 깨뜨린다. */
const REQUIRED_ANCHORS = [
  "versionCode 1",
  'versionName "1.0"',
  "buildTypes {",
  "minifyEnabled false",
];

export async function patchReleaseSigning(mobileDir = MOBILE_DIR, env = process.env) {
  const versionCode = Number(env.ANDROID_VERSION_CODE);
  const versionName = String(env.ANDROID_VERSION_NAME || "");
  if (!Number.isInteger(versionCode) || versionCode <= 0) {
    throw new Error(`ANDROID_VERSION_CODE가 양의 정수가 아닙니다: ${env.ANDROID_VERSION_CODE}`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(versionName)) {
    throw new Error(`ANDROID_VERSION_NAME이 x.y.z 형태가 아닙니다: ${versionName}`);
  }

  const path = join(mobileDir, "android", "app", "build.gradle");
  const original = await readFile(path, "utf8").catch(() => {
    throw new Error(`build.gradle이 없습니다: ${path}\n'npx cap add android'를 먼저 실행하세요.`);
  });

  /* 이중 패치 검사가 앵커 검사보다 먼저다 — 한 번 패치된 파일은 앵커도 이미 바뀌어
     있어서, 순서를 바꾸면 "두 번 패치했다"가 "템플릿이 다르다"로 잘못 진단된다. */
  if (original.includes("signingConfigs")) {
    throw new Error(`build.gradle에 이미 signingConfigs가 있습니다: ${path}\n두 번 패치했거나 템플릿이 바뀌었습니다.`);
  }
  for (const anchor of REQUIRED_ANCHORS) {
    if (!original.includes(anchor)) {
      throw new Error(
        `build.gradle이 예상한 템플릿이 아닙니다 ("${anchor}" 없음): ${path}\n` +
          `Capacitor 템플릿이 바뀌었을 수 있습니다. 패치 앵커를 확인하세요.`,
      );
    }
  }

  let gradle = original
    .replace("versionCode 1", `versionCode ${versionCode}`)
    .replace('versionName "1.0"', `versionName "${versionName}"`);

  /* 키스토어 경로는 워크플로가 시크릿을 복원해 두는 고정 위치다. 비밀번호·별칭은
     gradle 평가 시점의 환경변수로만 존재한다. */
  const signingBlock = `    signingConfigs {
        release {
            storeFile file(System.getenv("ANDROID_UPLOAD_KEYSTORE_FILE"))
            storeType "pkcs12"
            storePassword System.getenv("ANDROID_UPLOAD_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_UPLOAD_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_UPLOAD_KEYSTORE_PASSWORD")
        }
    }
    buildTypes {`;
  gradle = gradle.replace("    buildTypes {", signingBlock);
  gradle = gradle.replace(
    "            minifyEnabled false",
    "            signingConfig signingConfigs.release\n            minifyEnabled false",
  );

  await writeFile(path, gradle, "utf8");
  return { path, versionCode, versionName };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("patch-release-signing.mjs")) {
  patchReleaseSigning()
    .then(({ path, versionCode, versionName }) => {
      console.log("릴리스 서명 패치 완료");
      console.log(`  파일        ${path}`);
      console.log(`  versionCode ${versionCode}`);
      console.log(`  versionName ${versionName}`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
