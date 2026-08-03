#!/usr/bin/env node
/* 실기기 검증용 Capacitor 셸을 구성 A·B·C 중 하나로 준비한다.
 *
 *   node scripts/prepare.mjs a
 *   node scripts/prepare.mjs b
 *
 * 하는 일은 둘뿐이다: `capacitor.config.json`을 쓰고 `www/`를 채운다. 그 다음은
 * `npx cap add android && npx cap sync android && android/gradlew assembleDebug`.
 *
 * ── 왜 이 셸이 존재하는가 ───────────────────────────────────────────────────
 *
 * docs/capacitor-spike.md는 가설 A(시스템 브라우저 + 일회용 코드 + 쿠키 주입)가
 * 실패한다는 결론까지 갔지만, 그 결론과 대안(CapacitorHttp)의 근거가 전부 소스 읽기다.
 * 그 문서 §5에 실기기 없이는 확인 불가능한 항목 여섯이 남아 있고, **§2의 결론이 그중
 * 앞 둘에 달려 있다**. 이 셸은 그 여섯을 재기 위한 계측 장치다. 제품이 아니다.
 *
 * 그래서 이 단계에서 서버 코드도 script.js도 고치지 않는다. 무엇을 고쳐야 하는지를
 * 먼저 재는 단계다. 고칠 곳을 미리 정해 놓고 재면 재는 게 아니라 확인이 된다.
 *
 * ── 두 구성이 무엇을 다르게 묻는가 ──────────────────────────────────────────
 *
 *   A — server.url 원격 로드
 *       WebView가 실서버를 직접 연다. origin이 곧 서버 origin이라 상대 경로도,
 *       동일 출처 검사도, 쿠키도 웹과 똑같이 동작해야 한다. 즉 **되면 코드 변경이
 *       거의 없다**. 대신 Capacitor 문서가 server.url을 "not intended for use in
 *       production"이라고 못박고 있고, 앱 심사에서 "웹 래퍼"로 걸릴 위험이 가장 큰
 *       형태다. 이 구성은 **상한선을 재는 용도**다 — 이것마저 안 되면 나머지도 안 된다.
 *
 *   B — 번들 에셋 + server.hostname + CapacitorHttp
 *       에셋은 앱 안에서 뜨고, origin만 실서버 도메인으로 위장한다.
 *       그래서 script.js의 상대 경로가 손대지 않고도 https://onmyway.olivenrich.com/api/…
 *       로 해석된다 — 스파이크가 "6곳 남짓 고쳐야 한다"고 적은 그 수정이 **0곳이 될
 *       가능성**이 여기에 있다.
 *       대신 새 질문이 생긴다: Capacitor의 로컬 서버가 그 origin의 /api 요청을
 *       가로채서 번들에서 찾아 버리지 않는가? CapacitorHttp가 전역 fetch를 네이티브로
 *       빼돌리면 가로채이지 않는다는 게 가설이고, 이게 체크리스트의 핵심 항목이다.
 *
 * 두 구성은 배타적이지 않다. A가 되고 B가 안 되면 A의 심사 위험을 감수할지 판단하면
 * 되고, 둘 다 안 되면 서버를 고쳐야 한다는 뜻이다 — 그 경우에만 CSRF 방어를 낮추는
 * 거래(§1)를 다시 꺼낸다.
 */

import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MOBILE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = resolve(MOBILE_DIR, "..");
const WWW_DIR = join(MOBILE_DIR, "www");

/* appId를 구성마다 다르게 준다. 같으면 B를 설치하는 순간 A가 지워져서 한 대에서
   둘을 번갈아 볼 수 없다 — 검증 루프에서는 그게 곧 재측정 비용이다.
   appName도 다르게 준다. 런처 아이콘 두 개가 같은 이름이면 어느 쪽을 열었는지
   모른 채로 관측을 적게 된다. */
const CONFIGS = {
  a: {
    appId: "com.olivenrich.onmyway.verifya",
    appName: "OMW 검증 A",
    webDir: "www",
    server: {
      url: "https://onmyway.olivenrich.com",
      /* 평문 HTTP를 열지 않는다. 열어 두면 원격 로드가 실패했을 때 그 원인이
         TLS인지 네트워크인지 구분이 안 된다. */
      cleartext: false,
      /* ── 2회차(A′)의 유일한 새 변수 ──────────────────────────────────────
         1회차에서 세 provider 모두 `location.assign`이 삼성 인터넷을 띄웠고,
         세션 쿠키가 그 브라우저의 잼에 앉아 WebView는 익명으로 남았다(A-6·A-7).
         이 목록에 있는 호스트로의 이동은 WebView 안에서 처리된다.

         **A에서 이게 서면 로그인 전체가 선다.** 구성 A는 페이지 origin이 곧 서버
         origin이라 스파이크 §1의 블로커 셋(상대 경로·403·SameSite)이 애초에
         해당되지 않는다. 콜백이 WebView 안에서 끝나면 쿠키는 같은 잼에 앉는다.
         즉 제품 코드 수정 0곳으로 6·7이 서고, 그래야 8의 세션 칸과 10의 제품
         경로가 열린다.

         와일드카드를 쓰는 이유: 카카오는 kauth → accounts로 넘어가는 등 리다이렉트
         체인을 우리가 다 열거할 수 없다. 호스트를 빠뜨려서 난 실패를 "WebView에서
         OAuth가 안 된다"로 잘못 적는 것이 이 측정에서 가장 비싼 오류다.

         **구글은 실패할 것으로 예상한다** — 구글이 WebView 내 OAuth를 정책으로
         막는다(`disallowed_useragent`). 그래도 넣는 이유는 그 거절 화면이 WebView
         **안에서** 뜨는 것과 브라우저로 나가 버리는 것이 서로 다른 관측이기
         때문이다. 빼 두면 둘을 구분할 수 없다. 카카오·네이버가 서면 남는 문제는
         구글 하나로 좁혀지고, 그건 Custom Tab + App Link 몫이다. */
      allowNavigation: [
        "*.kakao.com",
        "*.naver.com",
        "accounts.google.com",
      ],
    },
  },
  b: {
    appId: "com.olivenrich.onmyway.verifyb",
    appName: "OMW 검증 B",
    webDir: "www",
    server: {
      /* androidScheme https + hostname 조합이 WebView origin을
         https://onmyway.olivenrich.com 으로 만든다. Capacitor Android 기본값은
         https + localhost 라서, 이 한 줄이 없으면 상대 경로가 전부
         https://localhost/api/… 로 나가 서버에 닿지 않는다 (스파이크 §1-①). */
      androidScheme: "https",
      hostname: "onmyway.olivenrich.com",
    },
    plugins: {
      /* 전역 fetch·XMLHttpRequest를 네이티브 HTTP로 가로챈다. 두 가지를 동시에
         노린다: (1) 로컬 서버의 /api 가로채기를 피하고 (2) Origin 헤더가 붙지 않아
         서버의 `if (origin && origin !== url.origin)` 검사를 통과한다.
         둘 다 가설이고, 체크리스트가 이 둘을 따로 묻는다. */
      CapacitorHttp: { enabled: true },
      /* CapacitorCookies는 일부러 켜지 않는다. 켜면 document.cookie까지 네이티브
         잼으로 바뀌어서, 쿠키가 붙지 않을 때 원인이 잼인지 SameSite인지 갈라지지
         않는다. 변수를 하나씩 움직인다 — 이건 다음 회차의 변수다. */
    },
  },
  c: {
    appId: "com.olivenrich.onmyway.verifyc",
    appName: "OMW 검증 C",
    webDir: "www",
    /* ── B와 무엇이 다른가 ────────────────────────────────────────────────
       **`hostname` 위장을 버린다.** B는 origin을 실서버 도메인으로 위장해
       상대 경로가 저절로 서버를 가리키게 하려 했는데, 1회차에서 그 origin 전체를
       Capacitor 로컬 서버가 소유한다는 것이 관측됐다 — `/api/*`가 상대·절대
       가릴 것 없이 번들 `index.html`로 돌아왔다(B-4). 위장이 문제를 만들었지
       풀지 않았다.

       그래서 C는 기본 origin(`https://localhost`)을 그대로 쓰고, 대신
       `script.js`가 API를 **절대 URL**로 부른다(`apiUrl()`). 다른 호스트로
       나가는 요청은 네이티브로 빠지고 `Origin`도 붙지 않는다는 것을 1회차
       B-5가 확인했으므로, 서버의 동일 출처 검사도 통과한다. **서버 변경은
       불필요하다.**

       구성 A와의 차이는 심사다. A는 `server.url`로 실서버를 여는 웹 래퍼 형태라
       거절 위험이 가장 크다. C가 서면 그 위험 없이 같은 결과를 얻는다. */
    server: {
      androidScheme: "https",
      /* ── 이 목록에 서버 호스트가 들어가는 것이 A와 다른 점이다 ──────────────
         구성 C는 페이지가 `https://localhost`라서 `/api/auth/…/start`로의 최상위
         이동이 **처음부터 cross-origin**이다. 넣지 않으면 그 첫 걸음이 시스템
         브라우저로 나간다 — 실제로 그렇게 관측됐다(3회차 1차, 삼성 인터넷).

         **그런데 이건 측정용 변형이지 출시 형태가 아니다.** 서버 호스트를 넣으면
         콜백 뒤 WebView가 실서버 페이지에 남는다. 그 순간부터 사실상 구성 A와
         같아지므로 번들의 의미가 없어진다.

         그래도 넣는 이유는 **이 회차가 답해야 할 질문이 쿠키 하나**이기 때문이다.
         세션을 네이티브 잼에 앉혀 놓고 번들 페이지(`https://localhost`)로 돌아와
         `/api/auth/me`를 물으면, 잼이 cross-site로 쿠키를 실어 주는지가 곧바로
         갈린다. 출시 형태(딥링크 복귀)는 그 답이 나온 뒤에 정한다 — 답이
         "안 실린다"면 만들 필요도 없다. */
      allowNavigation: [
        "onmyway.olivenrich.com",
        "*.kakao.com",
        "*.naver.com",
        "accounts.google.com",
      ],
    },
    plugins: {
      CapacitorHttp: { enabled: true },
      /* ── 이번 회차의 새 변수 ────────────────────────────────────────────
         1회차는 이것을 **일부러 껐다**. 쿠키가 안 붙을 때 원인이 네이티브 잼인지
         `SameSite=Lax`인지 갈리지 않기 때문이었고, 그래서 B-7이 미검증으로 남았다.

         C에서는 켠다. 페이지 origin이 `https://localhost`이고 API가
         `https://onmyway.olivenrich.com`이라 요청이 cross-site가 되는데,
         `SameSite=Lax` 세션 쿠키는 브라우저 규칙상 거기 실리지 않는다
         (스파이크 §1-③). 네이티브 쿠키 잼이 그 규칙 밖에서 쿠키를 실어 주는지가
         **구성 C의 성패를 가르는 단 하나의 질문**이다.

         실리지 않으면 남는 선택지는 `SameSite=None; Secure`인데, 그건 웹의 CSRF
         방어를 낮추는 거래라 이 셸 하나를 위해 치를 값이 아니다. 그때는 A의 심사
         위험을 감수할지로 판단이 넘어간다. */
      CapacitorCookies: { enabled: true },
    },
  },
  /* ── 출시 구성 — 검증이 끝난 구성 C 그대로, 이름만 제품이다 ──────────────────
     4회차(2026-08-03)에서 C의 전 조각이 실기기에서 섰다: API 도달(C-4), 앱 내
     로그인 완주(C-6), cross-site 세션 쿠키(C-7), 재시작 유지(C-8), 바운스
     복귀(4회차), .md 내보내기(C-D). 여기서 C와 다른 값을 넣으면 그 검증이
     무효가 되므로 server·plugins는 C와 자구까지 같아야 한다.

     appId는 Play에 첫 업로드하는 순간 영구히 굳는다. 바꿀 수 있는 마지막
     시점이 지금이다. */
  release: {
    appId: "com.olivenrich.onmyway",
    appName: "On My Way",
    webDir: "www",
    server: {
      androidScheme: "https",
      allowNavigation: [
        "onmyway.olivenrich.com",
        "*.kakao.com",
        "*.naver.com",
        "accounts.google.com",
      ],
    },
    plugins: {
      CapacitorHttp: { enabled: true },
      CapacitorCookies: { enabled: true },
    },
  },
};

/* 번들 구성(B·C)이 넣을 것. 명시 목록인 이유: .assetsignore의 제외 규칙을 흉내 내면
   "번들에 무엇이 들어갔는지"가 규칙 해석에 달리게 된다. 검증 셸에서 그건 관측을
   흐린다 — 화면이 깨졌을 때 파일이 빠진 건지 코드가 깨진 건지 알 수 없다.
   목록에 있는 항목이 하나라도 없으면 빌드를 실패시킨다(아래 assertExists).
   제품이 파일을 추가·삭제하면 여기가 조용히 낡는 대신 시끄럽게 깨진다. */
const BUNDLE_ENTRIES = [
  "index.html",
  "app.html",
  "admin.html",
  "privacy.html",
  "terms.html",
  "support.html",
  "delete-account.html",
  "script.js",
  "styles.css",
  "legal.css",
  "sample-diary-book.js",
  "account-delete.js",
  "core-loop-v2.html",
  "core-loop-v2.js",
  "core-loop-v2.css",
  "plan-policy.mjs",
  "assets",
];

/* 구성 A의 www는 실제로 쓰이지 않는다 — server.url이 원격을 열기 때문이다.
   그런데 cap copy가 webDir을 요구하므로 비워 둘 수는 없다.
   여기에 제품 에셋을 복사하면 안 된다: 원격 로드가 실패했을 때 번들이 대신 떠서
   "A가 됐다"로 오독하게 된다. 그래서 눈에 띄는 실패 표지판을 넣는다.
   이 화면이 보이면 그 자체가 관측 결과다. */
const CONFIG_A_FALLBACK = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>구성 A — 원격 로드 실패</title>
  </head>
  <body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#7f1d1d;color:#fff;font:16px/1.7 system-ui,sans-serif;text-align:center;padding:24px">
    <div>
      <h1 style="font-size:20px;margin:0 0 12px">구성 A — 원격 로드 실패</h1>
      <p style="margin:0 0 8px">이 화면이 보인다는 것은 <code>server.url</code>이 열리지 않았다는 뜻입니다.</p>
      <p style="margin:0;opacity:.8">체크리스트 A-1을 <strong>실패</strong>로 적으세요.</p>
    </div>
  </body>
</html>
`;

async function assertExists(path, label) {
  try {
    await stat(path);
  } catch {
    throw new Error(`번들 목록의 항목이 리포지토리에 없습니다: ${label}\n` +
      `제품에서 파일이 옮겨졌거나 지워졌다면 mobile/scripts/prepare.mjs의 BUNDLE_ENTRIES를 고치세요.`);
  }
}

async function writeConfigA() {
  await writeFile(join(WWW_DIR, "index.html"), CONFIG_A_FALLBACK, "utf8");
  return ["index.html (폴백 표지판)"];
}

async function writeBundle() {
  const copied = [];
  for (const entry of BUNDLE_ENTRIES) {
    const source = join(REPO_DIR, entry);
    await assertExists(source, entry);
    await cp(source, join(WWW_DIR, entry), { recursive: true });
    copied.push(entry);
  }
  return copied;
}

async function main() {
  const name = String(process.argv[2] || "").toLowerCase();
  const config = CONFIGS[name];
  if (!config) {
    console.error(`사용법: node scripts/prepare.mjs <${Object.keys(CONFIGS).join("|")}>`);
    process.exit(1);
  }

  await rm(WWW_DIR, { recursive: true, force: true });
  await mkdir(WWW_DIR, { recursive: true });

  const copied = name === "a" ? await writeConfigA() : await writeBundle();

  await writeFile(
    join(MOBILE_DIR, "capacitor.config.json"),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );

  const wwwCount = (await readdir(WWW_DIR)).length;
  console.log(`구성 ${name.toUpperCase()} 준비 완료`);
  console.log(`  appId   ${config.appId}`);
  console.log(`  server  ${JSON.stringify(config.server)}`);
  console.log(`  www     ${wwwCount}개 항목 — ${copied.join(", ")}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
