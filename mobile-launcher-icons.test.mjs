/* 런처 아이콘 파이프라인 계약 검사.
 *
 * 원본(brand/)은 git 밖이라 CI가 재생성하지 못한다 — 커밋된 산출물이 곧 소스다.
 * 그래서 두 가지를 잠근다: ① 산출물 세트가 온전한가(다 있고, 크기가 맞는 진짜 PNG인가)
 * ② 패치가 생성된 android 프로젝트에 정확히 덮어쓰고, 템플릿이 예상과 다르면 시끄럽게
 * 실패하는가. 어긋나면 기본 로봇 아이콘이 조용히 스토어까지 올라간다. */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DENSITY_DIRS, patchLauncherIcons } from "./mobile/scripts/patch-launcher-icons.mjs";

const LAUNCHER_RES = join("mobile", "launcher-res");
const DENSITY_SCALE = { "mipmap-mdpi": 1, "mipmap-hdpi": 1.5, "mipmap-xhdpi": 2, "mipmap-xxhdpi": 3, "mipmap-xxxhdpi": 4 };

function pngSize(buffer) {
  assert.equal(buffer.readUInt32BE(0), 0x89504e47, "PNG 시그니처가 아니다");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test("산출물 세트가 온전하다 — 5개 밀도 × PNG 4종 + 어댑티브 XML 2개, 크기 일치", async () => {
  for (const [density, scale] of Object.entries(DENSITY_SCALE)) {
    const layer = Math.round(108 * scale);
    const icon = Math.round(48 * scale);
    for (const [file, expected] of [
      ["ic_launcher_foreground.png", layer],
      ["ic_launcher_background.png", layer],
      ["ic_launcher.png", icon],
      ["ic_launcher_round.png", icon],
    ]) {
      const buffer = await readFile(join(LAUNCHER_RES, density, file));
      const { width, height } = pngSize(buffer);
      assert.equal(width, expected, `${density}/${file} 폭`);
      assert.equal(height, expected, `${density}/${file} 높이`);
    }
  }
  for (const file of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
    const xml = await readFile(join(LAUNCHER_RES, "mipmap-anydpi-v26", file), "utf8");
    assert.ok(xml.includes("@mipmap/ic_launcher_background"), "배경은 그라데이션 PNG를 가리켜야 한다");
    assert.ok(xml.includes("@mipmap/ic_launcher_foreground"));
  }
});

/* cap add가 만드는 res 뼈대 — 패치가 요구하는 최소 형태만 담는다. */
async function fakeAndroidProject() {
  const dir = await mkdtemp(join(tmpdir(), "omw-launcher-"));
  const resRoot = join(dir, "android", "app", "src", "main", "res");
  for (const density of DENSITY_DIRS) {
    await mkdir(join(resRoot, density), { recursive: true });
    for (const file of ["ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"]) {
      await writeFile(join(resRoot, density, file), "capacitor-robot-placeholder");
    }
  }
  await mkdir(join(resRoot, "mipmap-anydpi-v26"), { recursive: true });
  for (const file of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
    await writeFile(join(resRoot, "mipmap-anydpi-v26", file), "<adaptive-icon>@color</adaptive-icon>");
  }
  /* 패치는 launcher-res를 mobileDir 기준으로 찾는다 — 실제 저장소 산출물을 링크 대신
     실경로로 쓰기 위해 mobileDir를 저장소의 mobile/로 두지 않고 사본을 만든다. */
  const launcherSource = join(dir, "launcher-res");
  for (const density of DENSITY_DIRS) {
    await mkdir(join(launcherSource, density), { recursive: true });
    for (const file of ["ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png", "ic_launcher_background.png"]) {
      await writeFile(join(launcherSource, density, file), await readFile(join(LAUNCHER_RES, density, file)));
    }
  }
  await mkdir(join(launcherSource, "mipmap-anydpi-v26"), { recursive: true });
  for (const file of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
    await writeFile(join(launcherSource, "mipmap-anydpi-v26", file), await readFile(join(LAUNCHER_RES, "mipmap-anydpi-v26", file)));
  }
  return { dir, resRoot };
}

test("패치는 기본 아이콘을 브랜드 산출물로 덮어쓰고 배경 PNG를 추가한다", async () => {
  const { dir, resRoot } = await fakeAndroidProject();
  const before = await readFile(join(resRoot, "mipmap-xxxhdpi", "ic_launcher.png"));
  const result = await patchLauncherIcons(dir);
  assert.equal(result.copied, 22);

  const after = await readFile(join(resRoot, "mipmap-xxxhdpi", "ic_launcher.png"));
  assert.notDeepEqual(after, before, "기본 로봇이 그대로면 패치가 안 된 것이다");
  assert.deepEqual(after, await readFile(join(LAUNCHER_RES, "mipmap-xxxhdpi", "ic_launcher.png")));
  const background = await readFile(join(resRoot, "mipmap-mdpi", "ic_launcher_background.png"));
  assert.equal(background.readUInt32BE(0), 0x89504e47);
  const xml = await readFile(join(resRoot, "mipmap-anydpi-v26", "ic_launcher.xml"), "utf8");
  assert.ok(xml.includes("@mipmap/ic_launcher_background"));
});

test("android 프로젝트가 없으면 cap add를 먼저 하라고 말한다", async () => {
  const dir = await mkdtemp(join(tmpdir(), "omw-launcher-empty-"));
  await assert.rejects(() => patchLauncherIcons(dir), /cap add android/);
});

test("밀도 디렉터리가 사라진 템플릿에서는 덮어쓰지 않고 실패한다", async () => {
  const { dir, resRoot } = await fakeAndroidProject();
  const { rm } = await import("node:fs/promises");
  await rm(join(resRoot, "mipmap-xxxhdpi"), { recursive: true });
  await assert.rejects(() => patchLauncherIcons(dir), /템플릿이 바뀌었습니다/);
});

test("산출물이 빠져 있으면 생성 스크립트를 먼저 돌리라고 말한다", async () => {
  const { dir } = await fakeAndroidProject();
  const { rm } = await import("node:fs/promises");
  await rm(join(dir, "launcher-res", "mipmap-mdpi", "ic_launcher.png"));
  await assert.rejects(() => patchLauncherIcons(dir), /make-launcher-icons/);
});
