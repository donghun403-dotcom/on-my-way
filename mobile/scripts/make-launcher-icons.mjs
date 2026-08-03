#!/usr/bin/env node
/* 런처 아이콘 세트를 브랜드 원본에서 생성해 mobile/launcher-res/에 쓴다.
 *
 * 왜 생성물을 커밋하는가: 원본(brand/)은 .gitignore라 CI에 없다. 그래서 이 스크립트는
 * 개발 머신에서만 돌고, 산출물(작은 PNG 22개)을 저장소에 커밋해 CI의
 * patch-launcher-icons.mjs가 생성된 android 프로젝트에 복사한다.
 * 산출물 무결성은 mobile-launcher-icons.test.mjs가 검사한다.
 *
 * 어댑티브 아이콘 구성 (mipmap-anydpi-v26/ic_launcher.xml이 참조):
 *   foreground  마스코트(투명 배경 원본)를 안전 영역(중앙 ~61%)에 배치
 *   background  스토어 아이콘과 같은 파스텔 그라데이션 — Capacitor 기본은 흰색 단색이라
 *               XML도 @color → @mipmap 참조로 바꿔 끼운다(patch가 한다)
 *   legacy      기존 512 타일(둥근 모서리 + 투명)을 그대로 축소 — 구형 런처는 마스킹을
 *               하지 않으므로 타일 모양 자체가 아이콘이다
 *   round       풀블리드 512(brand/store/icon-512.png, store-assets.mjs 산출물)를 원형 크롭
 *
 * 실행: node mobile/scripts/make-launcher-icons.mjs  (저장소 루트 어디서든)
 */

import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(ROOT, "mobile", "launcher-res");

/* dp × 밀도 배율. foreground/background는 108dp 레이어, legacy/round는 48dp 아이콘. */
export const DENSITIES = Object.freeze({
  "mipmap-mdpi": 1,
  "mipmap-hdpi": 1.5,
  "mipmap-xhdpi": 2,
  "mipmap-xxhdpi": 3,
  "mipmap-xxxhdpi": 4,
});
export const LAYER_DP = 108;
export const ICON_DP = 48;

async function toDataUri(relPath) {
  const buffer = await readFile(join(ROOT, relPath));
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function saveDataUrl(dataUrl, outPath) {
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
}

async function main() {
  const sources = {
    tile: await toDataUri("brand/character/assets/logo-ollie-symbol.png"),
    mascot: await toDataUri("brand/character/assets/on-my-way-mascot.png"),
    fullBleed: await toDataUri("brand/store/icon-512.png"),
  };
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(`<canvas id="c"></canvas>`);

  const render = (size, kind) => page.evaluate(async ({ size, kind, sources }) => {
    const canvas = document.getElementById("c");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingQuality = "high";
    const load = (src) => new Promise((resolvePromise) => {
      const img = new Image();
      img.onload = () => resolvePromise(img);
      img.src = src;
    });

    if (kind === "background") {
      /* 풀블리드 아이콘의 네 모서리 색을 읽어 같은 결의 대각 그라데이션을 만든다.
         타일 아트 자체를 배경에 깔면 마스코트와 구름이 겹으로 보인다. */
      const probe = document.createElement("canvas");
      probe.width = 512;
      probe.height = 512;
      const probeCtx = probe.getContext("2d");
      probeCtx.drawImage(await load(sources.fullBleed), 0, 0);
      const colorAt = (x, y) => {
        const d = probeCtx.getImageData(x, y, 1, 1).data;
        return `rgb(${d[0]},${d[1]},${d[2]})`;
      };
      const gradient = ctx.createLinearGradient(0, 0, size, size);
      gradient.addColorStop(0, colorAt(10, 10));
      gradient.addColorStop(0.5, colorAt(256, 256) === "rgb(0,0,0)" ? colorAt(10, 501) : colorAt(501, 10));
      gradient.addColorStop(1, colorAt(501, 501));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
    } else if (kind === "foreground") {
      /* 마스킹은 바깥 ~25%를 자른다. 마스코트를 중앙 61% 높이에 맞춰 안전 영역에 둔다. */
      const img = await load(sources.mascot);
      const height = size * 0.61;
      const width = height * (img.naturalWidth / img.naturalHeight);
      ctx.drawImage(img, (size - width) / 2, (size - height) / 2, width, height);
    } else if (kind === "legacy") {
      ctx.drawImage(await load(sources.tile), 0, 0, size, size);
    } else if (kind === "round") {
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(await load(sources.fullBleed), 0, 0, size, size);
    }
    return canvas.toDataURL("image/png");
  }, { size, kind, sources });

  console.log("런처 아이콘 생성:");
  for (const [density, scale] of Object.entries(DENSITIES)) {
    const layer = Math.round(LAYER_DP * scale);
    const icon = Math.round(ICON_DP * scale);
    const files = [
      ["ic_launcher_foreground.png", await render(layer, "foreground")],
      ["ic_launcher_background.png", await render(layer, "background")],
      ["ic_launcher.png", await render(icon, "legacy")],
      ["ic_launcher_round.png", await render(icon, "round")],
    ];
    for (const [name, dataUrl] of files) {
      await saveDataUrl(dataUrl, join(OUT_DIR, density, name));
    }
    console.log(`  ${density}  layer ${layer}px · icon ${icon}px`);
  }

  /* 어댑티브 XML — patch-launcher-icons.mjs가 mipmap-anydpi-v26에 덮어쓴다.
     기본 템플릿과의 차이는 background가 @color가 아니라 @mipmap PNG라는 것 하나다. */
  const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
  await mkdir(join(OUT_DIR, "mipmap-anydpi-v26"), { recursive: true });
  await writeFile(join(OUT_DIR, "mipmap-anydpi-v26", "ic_launcher.xml"), adaptiveXml, "utf8");
  await writeFile(join(OUT_DIR, "mipmap-anydpi-v26", "ic_launcher_round.xml"), adaptiveXml, "utf8");
  console.log("  mipmap-anydpi-v26  adaptive XML 2개");

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
