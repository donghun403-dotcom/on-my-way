#!/usr/bin/env node
/* 생성된 android/app/build.gradle에 Play Billing Library를 넣는다.
 *
 * 왜 이것부터인가: Play Console은 **`com.android.vending.BILLING` 권한을 선언한 빌드를
 * 본 적이 있어야** 구독 상품 생성을 열어 준다. 2026-08-05에 상품을 만들려다 확인했다 —
 * 「Create subscription」 대신 「Upload a new APK」가 떴고, vc3 AAB의 매니페스트에는
 * 권한이 `INTERNET` 하나뿐이었다. 그래서 순서가 뒤집힌다: 라이브러리를 먼저 넣고
 * 새 번들을 올려야 콘솔이 열리고, 그다음에 실제 구매 흐름을 검증할 수 있다.
 *
 * 권한은 우리가 손으로 적지 않는다. 라이브러리의 매니페스트가 선언한 것을 AGP가
 * 병합한다 — 쓰지도 않는 권한을 매니페스트에 직접 박는 것보다 정직하고, 라이브러리를
 * 빼면 권한도 같이 사라진다.
 *
 * 네이티브 프로젝트는 커밋하지 않고 빌드마다 `cap add android`로 새로 만든다
 * (이유는 mobile/README.md). 그래서 다른 patch-*.mjs와 같은 자리에서, 같은 규칙으로
 * 주입한다 — 템플릿이 예상과 다르면 조용히 넘어가지 않고 실패한다.
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MOBILE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* 구글은 오래된 Billing Library를 쓰는 앱의 업데이트를 거부한다(대략 2년 주기).
   버전을 여기 한 곳에만 두고, 올릴 때는 이 상수와 테스트만 고친다. */
export const BILLING_LIBRARY_VERSION = "9.1.0";

/* Capacitor 템플릿의 dependencies 블록에만 있는 줄이다. androidx나 junit 줄은
   템플릿 밖에서도 흔해서 앵커로 약하다. */
const ANCHOR = "implementation project(':capacitor-android')";

export async function patchBilling(mobileDir = MOBILE_DIR) {
  const path = join(mobileDir, "android", "app", "build.gradle");
  const original = await readFile(path, "utf8").catch(() => {
    throw new Error(`build.gradle이 없습니다: ${path}\n'npx cap add android'를 먼저 실행하세요.`);
  });

  /* 이중 패치 검사가 앵커 검사보다 먼저다 — patch-release-signing.mjs와 같은 이유로,
     순서를 바꾸면 "두 번 패치했다"가 "템플릿이 다르다"로 잘못 진단된다. */
  if (original.includes("com.android.billingclient")) {
    throw new Error(`build.gradle에 이미 billingclient 의존성이 있습니다: ${path}\n두 번 패치했거나 템플릿이 바뀌었습니다.`);
  }
  if (!original.includes(ANCHOR)) {
    throw new Error(
      `build.gradle이 예상한 템플릿이 아닙니다 ("${ANCHOR}" 없음): ${path}\n` +
        `Capacitor 템플릿이 바뀌었을 수 있습니다. 패치 앵커를 확인하세요.`,
    );
  }

  const dependency = `implementation "com.android.billingclient:billing:${BILLING_LIBRARY_VERSION}"`;
  const gradle = original.replace(ANCHOR, `${ANCHOR}\n    ${dependency}`);

  await writeFile(path, gradle, "utf8");
  return { path, version: BILLING_LIBRARY_VERSION };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("patch-billing.mjs")) {
  patchBilling()
    .then(({ path, version }) => {
      console.log("Play Billing 의존성 패치 완료");
      console.log(`  파일    ${path}`);
      console.log(`  버전    ${version}`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
