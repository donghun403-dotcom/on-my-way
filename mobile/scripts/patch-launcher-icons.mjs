#!/usr/bin/env node
/* mobile/launcher-res/의 커밋된 런처 아이콘을 생성된 android 프로젝트에 복사한다.
 *
 * 네이티브 프로젝트는 커밋하지 않고 빌드마다 `cap add android`로 새로 만든다 — 그래서
 * Capacitor 기본 로봇 아이콘이 매번 되살아나고, 이 패치가 cap add 직후에 브랜드
 * 아이콘으로 갈아끼운다. patch-download.mjs와 같은 규칙: 예상한 템플릿이 아니면
 * 조용히 넘어가지 않고 실패한다.
 *
 * 산출물의 출처는 make-launcher-icons.mjs(브랜드 원본은 CI에 없어 로컬 생성 후 커밋).
 * 무결성은 mobile-launcher-icons.test.mjs가 잠근다.
 *
 * 어댑티브 XML도 바꾼다 — 기본 템플릿은 background가 @color(흰 단색)인데 우리는
 * 그라데이션 PNG(@mipmap/ic_launcher_background)를 쓴다.
 */

import { copyFile, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MOBILE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const DENSITY_DIRS = Object.freeze([
  "mipmap-mdpi",
  "mipmap-hdpi",
  "mipmap-xhdpi",
  "mipmap-xxhdpi",
  "mipmap-xxxhdpi",
]);

/* [파일명, 템플릿에 이미 있어야 하는가].
   background PNG만 새 파일이다 — 템플릿은 배경을 색으로 갖고 있어서 대응 PNG가 없다.
   나머지는 "교체"라서, 대상이 없으면 Capacitor 템플릿이 바뀐 것이니 실패한다. */
const DENSITY_FILES = Object.freeze([
  ["ic_launcher.png", true],
  ["ic_launcher_round.png", true],
  ["ic_launcher_foreground.png", true],
  ["ic_launcher_background.png", false],
]);
const ADAPTIVE_FILES = Object.freeze(["ic_launcher.xml", "ic_launcher_round.xml"]);

async function mustExist(path, hint) {
  try {
    await stat(path);
  } catch {
    throw new Error(`${hint}: ${path}`);
  }
}

export async function patchLauncherIcons(mobileDir = MOBILE_DIR) {
  const sourceRoot = join(mobileDir, "launcher-res");
  const resRoot = join(mobileDir, "android", "app", "src", "main", "res");
  await mustExist(resRoot, "android 리소스 디렉터리가 없습니다. 'npx cap add android'를 먼저 실행하세요");

  let copied = 0;
  for (const density of DENSITY_DIRS) {
    const targetDir = join(resRoot, density);
    await mustExist(targetDir, "예상한 밀도 디렉터리가 없습니다 — Capacitor 템플릿이 바뀌었습니다");
    for (const [file, mustReplace] of DENSITY_FILES) {
      const source = join(sourceRoot, density, file);
      await mustExist(source, "런처 아이콘 산출물이 없습니다. 'node mobile/scripts/make-launcher-icons.mjs'를 먼저 실행하세요");
      if (mustReplace) {
        await mustExist(join(targetDir, file), "교체 대상이 템플릿에 없습니다 — Capacitor 템플릿이 바뀌었습니다");
      }
      await copyFile(source, join(targetDir, file));
      copied += 1;
    }
  }

  const adaptiveDir = join(resRoot, "mipmap-anydpi-v26");
  await mustExist(adaptiveDir, "mipmap-anydpi-v26이 없습니다 — Capacitor 템플릿이 바뀌었습니다");
  for (const file of ADAPTIVE_FILES) {
    const source = join(sourceRoot, "mipmap-anydpi-v26", file);
    await mustExist(source, "어댑티브 XML 산출물이 없습니다. make-launcher-icons.mjs를 먼저 실행하세요");
    await mustExist(join(adaptiveDir, file), "교체 대상이 템플릿에 없습니다 — Capacitor 템플릿이 바뀌었습니다");
    const xml = await readFile(source, "utf8");
    if (!xml.includes("@mipmap/ic_launcher_background") || !xml.includes("@mipmap/ic_launcher_foreground")) {
      throw new Error(`어댑티브 XML이 예상한 참조를 담고 있지 않습니다: ${source}`);
    }
    await copyFile(source, join(adaptiveDir, file));
    copied += 1;
  }

  return { copied };
}

if (process.argv[1]?.endsWith("patch-launcher-icons.mjs")) {
  patchLauncherIcons()
    .then(({ copied }) => console.log(`런처 아이콘 패치 완료 — ${copied}개 파일`))
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
