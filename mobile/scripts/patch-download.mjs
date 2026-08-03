#!/usr/bin/env node
/* 생성된 Android 프로젝트의 MainActivity에 다운로드 처리를 심는다.
 *
 *   node scripts/patch-download.mjs            # npx cap add android 다음에 실행
 *
 * ── 왜 필요한가 ─────────────────────────────────────────────────────────────
 *
 * 2026-08-02 실기기 1회차에서 `.md` 내보내기가 A·B 모두 실패했다. 앱은 토스트로
 * "내보냈어요"라고 말하는데 파일이 생기지 않는다 — DownloadManager에 기록조차 없다.
 * Android WebView는 `blob:` + `<a download>`를 네이티브 `DownloadListener` 없이는
 * 처리하지 않고, Capacitor 기본 `BridgeActivity`는 그것을 붙여 주지 않는다.
 * 관측과 근거는 docs/capacitor-shell-checklist.md의 9번.
 *
 * 그 항목은 잠긴 유저의 열람·이동권이라 `HARD_PAYWALL_ENABLED`의 선행 조건이다.
 *
 * ── 왜 네이티브 쪽에 붙이는가 ───────────────────────────────────────────────
 *
 * 결함이 "WebView가 blob 다운로드를 흘린다"이므로 고칠 자리가 거기다. script.js를
 * 건드리면 (1) 구성 A는 실서버를 열기 때문에 프로덕션에 배포해야 잴 수 있고,
 * (2) 브라우저에서는 이미 잘 되는 경로에 네이티브 분기가 생긴다. 여기서 고치면
 * 제품 코드가 그대로인 채 다음 회차를 잴 수 있다.
 *
 * ── 왜 파일을 통째로 쓰는가 ─────────────────────────────────────────────────
 *
 * 네이티브 프로젝트는 커밋하지 않고 `cap add android`가 매번 새로 만든다(mobile/README.md).
 * 그 템플릿의 MainActivity는 본문이 비어 있는 다섯 줄짜리라, 부분 치환보다 전체 교체가
 * 짧고 확실하다. 대신 **교체 전에 그것이 정말 빈 템플릿인지 확인하고, 아니면 실패시킨다** —
 * Capacitor가 템플릿에 코드를 넣기 시작했는데 우리가 조용히 덮어쓰면 그때부터
 * 원인을 모르는 버그가 된다.
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MOBILE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* 빈 템플릿의 표지. 이 셋이 다 있고 그 밖의 코드가 없어야 교체한다. */
const STOCK_MARKERS = ["extends BridgeActivity", "com.getcapacitor.BridgeActivity", "class MainActivity"];

async function findMainActivity(androidDir) {
  const root = join(androidDir, "app", "src", "main", "java");
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      throw new Error(
        `네이티브 프로젝트가 없습니다: ${root}\n` +
          `이 스크립트는 'npx cap add android' 다음에 실행해야 합니다.`,
      );
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.name === "MainActivity.java") return path;
    }
  }
  throw new Error(`MainActivity.java를 찾지 못했습니다 (${root} 아래).`);
}

/* 허용 출처를 capacitor.config.json에서 끌어온다. 두 벌로 적으면 구성을 바꿀 때
   한쪽만 고쳐진다. */
function allowedOrigin(config) {
  const server = config.server || {};
  if (server.url) return new URL(server.url).origin;
  /* hostname을 주지 않으면 Capacitor Android의 기본값은 `localhost`다
     (**[CAP]** `CapConfig.java`). 구성 C가 그 경우다 — 위장을 버리고 기본 origin을
     쓰기 때문에 여기 걸린다.

     예전에는 이 자리에서 예외를 던졌다. 설정 실수를 잡으려던 것인데, 실제로는
     **정상적인 구성 하나를 막고 있었다.** 기본값을 그대로 쓰는 것은 실수가 아니고,
     그 기본값이 무엇인지는 Capacitor가 정해 두었으므로 추측이 아니다. */
  return `${server.androidScheme || "https"}://${server.hostname || "localhost"}`;
}

function javaSource(packageName, origin) {
  return `package ${packageName};

/* 이 파일은 mobile/scripts/patch-download.mjs가 생성한다. 직접 고치지 마라 —
   'npx cap add android'가 다음 빌드에서 덮어쓴다. */

import android.content.ContentValues;
import android.content.Context;
import android.app.DownloadManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "OmwDownload";

    /* JavascriptInterface는 WebView에 들어온 모든 페이지에 노출된다. 구성 A는 원격을
       열고 로그인 과정에서 provider 도메인으로 이동할 수 있으므로, 저장 요청을 받을 때
       현재 페이지가 우리 출처인지 확인한다. 확인 없이 두면 임의의 페이지가 사용자
       저장소에 파일을 쓸 수 있다. */
    private static final String ALLOWED_ORIGIN = "${origin}";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final WebView webView = getBridge().getWebView();
        webView.addJavascriptInterface(new BlobBridge(), "OmwBlobBridge");

        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            String name = URLUtil.guessFileName(url, contentDisposition, mimeType);

            /* blob:은 DownloadManager가 모르는 스킴이다. 페이지 안에서 읽어서
               data URL로 되돌린 다음 네이티브로 넘긴다. */
            if (url.startsWith("blob:")) {
                webView.evaluateJavascript(blobReaderScript(url, name, mimeType), null);
                return;
            }

            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setMimeType(mimeType);
            request.addRequestHeader("User-Agent", userAgent);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            manager.enqueue(request);
        });
    }

    /* 페이지 안에서 blob을 읽어 넘기는 조각.
       CapacitorHttp가 켜진 구성 B에서는 전역 fetch가 네이티브로 빼돌려져 blob:을
       처리하지 못하므로, Capacitor가 원본을 보관해 둔 CapacitorWebFetch를 먼저 쓴다. */
    private static String blobReaderScript(String url, String name, String mimeType) {
        return "(function(){var f=window.CapacitorWebFetch||window.fetch;"
                + "f(" + JSONObject.quote(url) + ").then(function(r){return r.blob()}).then(function(b){"
                + "var fr=new FileReader();"
                + "fr.onload=function(){OmwBlobBridge.save(fr.result," + JSONObject.quote(name) + ","
                + JSONObject.quote(mimeType) + ")};"
                + "fr.onerror=function(){OmwBlobBridge.fail(String(fr.error))};"
                + "fr.readAsDataURL(b)}).catch(function(e){OmwBlobBridge.fail(String(e))})})()";
    }

    private class BlobBridge {

        @JavascriptInterface
        public void save(String dataUrl, String name, String mimeType) {
            runOnUiThread(() -> {
                String current = webViewUrl();
                if (current == null || !current.startsWith(ALLOWED_ORIGIN)) {
                    Log.w(TAG, "허용되지 않은 출처의 저장 요청을 무시했습니다: " + current);
                    return;
                }
                new Thread(() -> writeFile(dataUrl, name, mimeType)).start();
            });
        }

        @JavascriptInterface
        public void fail(String message) {
            Log.e(TAG, "blob 읽기 실패: " + message);
            toast("내보내기에 실패했습니다: " + message);
        }
    }

    private String webViewUrl() {
        WebView webView = getBridge().getWebView();
        return webView == null ? null : webView.getUrl();
    }

    private void writeFile(String dataUrl, String name, String mimeType) {
        int comma = dataUrl.indexOf(',');
        if (comma < 0) {
            Log.e(TAG, "data URL 형식이 아닙니다");
            toast("내보내기에 실패했습니다");
            return;
        }
        byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, name);
                values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                Uri target = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (target == null) throw new IllegalStateException("MediaStore가 항목을 만들지 못했습니다");
                try (OutputStream out = getContentResolver().openOutputStream(target)) {
                    out.write(bytes);
                }
                Log.i(TAG, "저장 완료: " + name + " (" + bytes.length + " bytes)");
                toast(name + " 저장됨 · 다운로드 폴더");
                return;
            }

            /* ponytail: API 28 이하는 공용 Downloads에 쓰려면 WRITE_EXTERNAL_STORAGE가
               필요하다. 계측 기기가 Android 12라 권한 흐름을 만들지 않고 앱 전용
               폴더에 쓴다. 조용히 실패하지는 않게 경로를 토스트로 알린다.
               실제 출시 셸에서는 권한 요청을 붙여야 한다. */
            File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            File file = new File(dir, name);
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(bytes);
            }
            Log.i(TAG, "저장 완료(앱 전용): " + file.getAbsolutePath());
            toast("앱 전용 폴더에 저장됨: " + file.getAbsolutePath());
        } catch (Exception error) {
            Log.e(TAG, "저장 실패", error);
            toast("내보내기에 실패했습니다: " + error.getMessage());
        }
    }

    private void toast(String message) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_LONG).show());
    }
}
`;
}

export async function patchDownload(mobileDir = MOBILE_DIR) {
  const config = JSON.parse(await readFile(join(mobileDir, "capacitor.config.json"), "utf8"));
  const origin = allowedOrigin(config);
  const path = await findMainActivity(join(mobileDir, "android"));
  const original = await readFile(path, "utf8");

  for (const marker of STOCK_MARKERS) {
    if (!original.includes(marker)) {
      throw new Error(
        `MainActivity.java가 예상한 빈 템플릿이 아닙니다 ("${marker}" 없음): ${path}\n` +
          `Capacitor 템플릿이 바뀌었을 수 있습니다. 덮어쓰기 전에 내용을 확인하세요.`,
      );
    }
  }
  if (original.includes("onCreate")) {
    throw new Error(
      `MainActivity.java에 이미 onCreate가 있습니다: ${path}\n` +
        `템플릿이 코드를 담기 시작했다면 이 스크립트가 그것을 지웁니다. 병합 방식을 정하세요.`,
    );
  }

  const packageName = original.match(/^package\s+([\w.]+);/m)?.[1];
  if (!packageName) throw new Error(`package 선언을 읽지 못했습니다: ${path}`);

  await writeFile(path, javaSource(packageName, origin), "utf8");
  return { path, packageName, origin };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("patch-download.mjs")) {
  patchDownload()
    .then(({ path, packageName, origin }) => {
      console.log("다운로드 처리 패치 완료");
      console.log(`  파일    ${path}`);
      console.log(`  package ${packageName}`);
      console.log(`  허용    ${origin}`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
