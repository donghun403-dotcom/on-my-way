#!/usr/bin/env node
/* 생성된 안드로이드 프로젝트에 Play Billing을 심는다. 셋을 한다.
 *
 *   ① app/build.gradle에 Play Billing Library 의존성
 *   ② OmwBillingBridge.java 생성 — 구매 흐름을 JS에 노출하는 다리
 *   ③ MainActivity.java에 그 다리를 등록하는 한 줄
 *
 * ①이 먼저 필요했던 이유: Play Console은 **`com.android.vending.BILLING` 권한을
 * 선언한 빌드를 본 적이 있어야** 구독 상품 생성을 열어 준다. 2026-08-05에 상품을
 * 만들려다 확인했다 — 「Create subscription」 대신 「Upload a new APK」가 떴고,
 * vc3 AAB의 매니페스트에는 권한이 `INTERNET` 하나뿐이었다.
 *
 * 권한은 우리가 손으로 적지 않는다. 라이브러리의 매니페스트가 선언한 것을 AGP가
 * 병합한다 — 쓰지도 않는 권한을 매니페스트에 직접 박는 것보다 정직하고, 라이브러리를
 * 빼면 권한도 같이 사라진다.
 *
 * ── 왜 Capacitor 플러그인이 아니라 @JavascriptInterface인가 ──────────────────
 *
 *   patch-download.mjs가 이미 같은 방식으로 다리(OmwBlobBridge)를 놓고 있고, 그
 *   경로는 실기기 4회차까지 검증이 끝났다. 플러그인으로 가면 등록 경로와 생명주기
 *   처리가 하나 더 생기는데, 같은 일을 하는 두 번째 기계다.
 *
 * ── 왜 MainActivity를 통째로 생성하지 않는가 ────────────────────────────────
 *
 *   그 파일은 patch-download.mjs의 산출물이다. 여기서도 생성하면 두 스크립트가
 *   같은 파일을 두고 다투고, 나중에 한쪽만 고쳐진다. 그래서 결제 코드는 자기
 *   파일에 두고, MainActivity에는 **등록 한 줄만** 앵커를 잡아 끼운다. 워크플로에서
 *   이 스크립트는 patch-download 뒤에 돌므로 그때 MainActivity는 이미 최종형이다.
 *
 * API는 추측하지 않았다. billing-9.1.0.aar의 클래스 파일에서 시그니처를 직접
 * 확인했다 — 8.0에서 onProductDetailsResponse가 List가 아니라
 * QueryProductDetailsResult를 받도록 바뀌었고, 9.1.0도 그 형태다.
 */

import { readFile, writeFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MOBILE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* 구글은 오래된 Billing Library를 쓰는 앱의 업데이트를 거부한다(대략 2년 주기).
   버전을 여기 한 곳에만 두고, 올릴 때는 이 상수와 테스트만 고친다. */
export const BILLING_LIBRARY_VERSION = "9.1.0";

/* Capacitor 템플릿의 dependencies 블록에만 있는 줄이다. androidx나 junit 줄은
   템플릿 밖에서도 흔해서 앵커로 약하다. */
const GRADLE_ANCHOR = "implementation project(':capacitor-android')";

/* patch-download.mjs가 생성하는 줄이다. 두 스크립트의 계약이므로 한쪽을 고치면
   다른 쪽 앵커도 같이 본다 — mobile-billing-patch.test.mjs가 그것을 지킨다. */
const ACTIVITY_ANCHOR = 'webView.addJavascriptInterface(new BlobBridge(), "OmwBlobBridge");';

const REGISTRATION = 'webView.addJavascriptInterface(new OmwBillingBridge(this, webView, ALLOWED_ORIGIN), "OmwBilling");';

/* 다리가 JS로 결과를 되돌릴 때 부르는 전역 함수. 이름을 바꾸면 script.js도 같이
   고쳐야 한다. */
export const JS_CALLBACK = "window.__omwBilling";

export function billingBridgeSource(packageName) {
  return `package ${packageName};

/* 이 파일은 mobile/scripts/patch-billing.mjs가 생성한다. 직접 고치지 마라 —
   'npx cap add android'가 다음 빌드에서 프로젝트를 새로 만든다. */

import android.app.Activity;
import android.text.TextUtils;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/* 구매 흐름을 WebView에 노출한다. 결과는 반환값이 아니라 ${JS_CALLBACK}(json) 호출로
   되돌린다 — Play Billing의 결과는 PurchasesUpdatedListener로 비동기로 오기 때문에
   @JavascriptInterface 메서드가 값을 들고 돌아올 방법이 없다.

   승인(acknowledge)은 여기서 하지 않는다. 서버가 purchaseToken을 구글에 확인하면서
   같이 한다 — 클라이언트가 승인하면 "승인은 됐는데 우리 DB에는 없는" 상태가 생기고,
   그 상태의 유저는 돈을 냈는데 권한이 없다. 진실을 한 곳에 둔다. */
public class OmwBillingBridge implements PurchasesUpdatedListener {

    private static final String TAG = "OmwBilling";

    private final Activity activity;
    private final WebView webView;
    /* JavascriptInterface는 WebView에 들어온 모든 페이지에 노출된다. 로그인 중에는
       provider 도메인이 올라오므로, 요청을 받을 때 현재 페이지가 우리 출처인지
       확인한다. 확인이 없으면 임의의 페이지가 구매 결과(purchaseToken)를 받아 갈 수
       있다 — 그 토큰 하나면 남의 구독을 자기 계정에 붙일 수 있다. */
    private final String allowedOrigin;

    private BillingClient client;

    public OmwBillingBridge(Activity activity, WebView webView, String allowedOrigin) {
        this.activity = activity;
        this.webView = webView;
        this.allowedOrigin = allowedOrigin;
    }

    @JavascriptInterface
    public void purchase(final String productId, final String basePlanId) {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (!fromAllowedOrigin()) return;
                withClient(new Runnable() {
                    @Override
                    public void run() {
                        launch(productId, basePlanId);
                    }
                });
            }
        });
    }

    /* 기기를 바꾸거나 앱을 지웠다 깐 유저의 기존 구독을 되찾는다. 구글이 진실을
       쥐고 있으므로 우리는 물어보기만 하면 된다. */
    @JavascriptInterface
    public void restore() {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (!fromAllowedOrigin()) return;
                withClient(new Runnable() {
                    @Override
                    public void run() {
                        client.queryPurchasesAsync(
                                QueryPurchasesParams.newBuilder()
                                        .setProductType(BillingClient.ProductType.SUBS)
                                        .build(),
                                (billingResult, purchases) -> emitPurchases("restored", purchases));
                    }
                });
            }
        });
    }

    private boolean fromAllowedOrigin() {
        String url = webView.getUrl();
        if (url == null) return false;
        if (url.startsWith(allowedOrigin + "/") || url.equals(allowedOrigin)) return true;
        Log.w(TAG, "허용되지 않은 출처의 결제 요청을 무시했습니다.");
        return false;
    }

    /* 연결은 한 번만 맺고 재사용한다. 끊겼으면 다시 맺고 이어서 한다. */
    private void withClient(final Runnable next) {
        if (client != null && client.isReady()) {
            next.run();
            return;
        }
        if (client == null) {
            client = BillingClient.newBuilder(activity)
                    .setListener(this)
                    .enablePendingPurchases(
                            PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                    .build();
        }
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    next.run();
                } else {
                    emitError("SETUP_FAILED", result.getDebugMessage());
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                /* 다음 요청에서 withClient가 다시 맺는다. 여기서 즉시 재연결을 돌면
                   백오프 없는 재시도 루프가 된다. */
                Log.w(TAG, "결제 서비스 연결이 끊겼습니다.");
            }
        });
    }

    private void launch(final String productId, final String basePlanId) {
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(
                        QueryProductDetailsParams.Product.newBuilder()
                                .setProductId(productId)
                                .setProductType(BillingClient.ProductType.SUBS)
                                .build()))
                .build();

        client.queryProductDetailsAsync(params, (billingResult, queryResult) -> {
            List<ProductDetails> found = queryResult.getProductDetailsList();
            if (found == null || found.isEmpty()) {
                emitError("PRODUCT_NOT_FOUND", "상품을 찾지 못했습니다: " + productId);
                return;
            }
            ProductDetails details = found.get(0);
            String offerToken = offerTokenFor(details, basePlanId);
            if (offerToken == null) {
                emitError("OFFER_NOT_FOUND", "요금제를 찾지 못했습니다: " + basePlanId);
                return;
            }
            BillingFlowParams flow = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(Collections.singletonList(
                            BillingFlowParams.ProductDetailsParams.newBuilder()
                                    .setProductDetails(details)
                                    .setOfferToken(offerToken)
                                    .build()))
                    .build();
            BillingResult launched = client.launchBillingFlow(activity, flow);
            if (launched.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                emitError("LAUNCH_FAILED", launched.getDebugMessage());
            }
        });
    }

    /* basePlanId가 비어 있으면 첫 요금제를 쓴다. 지금 상품에는 요금제가 하나뿐이지만,
       나중에 연간 요금제를 붙일 때 이 자리가 갈림길이 된다. */
    private String offerTokenFor(ProductDetails details, String basePlanId) {
        List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
        if (offers == null || offers.isEmpty()) return null;
        if (TextUtils.isEmpty(basePlanId)) return offers.get(0).getOfferToken();
        for (ProductDetails.SubscriptionOfferDetails offer : offers) {
            if (basePlanId.equals(offer.getBasePlanId())) return offer.getOfferToken();
        }
        return null;
    }

    @Override
    public void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        int code = result.getResponseCode();
        if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            emit(new Emitter() {
                @Override
                public void fill(JSONObject json) throws Exception {
                    json.put("event", "cancelled");
                }
            });
            return;
        }
        if (code != BillingClient.BillingResponseCode.OK) {
            emitError("PURCHASE_FAILED", result.getDebugMessage());
            return;
        }
        emitPurchases("purchased", purchases);
    }

    private void emitPurchases(final String event, final List<Purchase> purchases) {
        emit(new Emitter() {
            @Override
            public void fill(JSONObject json) throws Exception {
                JSONArray list = new JSONArray();
                List<Purchase> source = purchases == null ? new ArrayList<Purchase>() : purchases;
                for (Purchase purchase : source) {
                    /* PENDING은 아직 돈이 오가지 않은 상태다. 서버에 보내면 구글이
                       "구매 아님"으로 답해 실패로 기록된다. 결제가 끝나면 알림이
                       다시 온다. */
                    if (purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) continue;
                    JSONObject item = new JSONObject();
                    item.put("purchaseToken", purchase.getPurchaseToken());
                    List<String> products = purchase.getProducts();
                    item.put("productId", products.isEmpty() ? "" : products.get(0));
                    item.put("acknowledged", purchase.isAcknowledged());
                    list.put(item);
                }
                json.put("event", event);
                json.put("purchases", list);
            }
        });
    }

    private void emitError(final String code, final String message) {
        emit(new Emitter() {
            @Override
            public void fill(JSONObject json) throws Exception {
                json.put("event", "error");
                json.put("code", code);
                json.put("message", message == null ? "" : message);
            }
        });
    }

    private interface Emitter {
        void fill(JSONObject json) throws Exception;
    }

    private void emit(Emitter emitter) {
        final String payload;
        try {
            JSONObject json = new JSONObject();
            emitter.fill(json);
            payload = json.toString();
        } catch (Exception error) {
            Log.e(TAG, "결과를 만들지 못했습니다", error);
            return;
        }
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                /* 결과를 되돌릴 때도 출처를 본다. 구매 도중 페이지가 바뀌었을 수 있고,
                   그 자리에 provider 페이지가 있으면 토큰이 그쪽으로 간다. */
                if (!fromAllowedOrigin()) return;
                webView.evaluateJavascript(
                        "if (typeof ${JS_CALLBACK} === 'function') ${JS_CALLBACK}(" + payload + ");",
                        null);
            }
        });
    }
}
`;
}

async function findPackageDir(mobileDir) {
  const root = join(mobileDir, "android", "app", "src", "main", "java");
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => null);
    if (!entries) continue;
    if (entries.some((entry) => entry.isFile() && entry.name === "MainActivity.java")) return dir;
    for (const entry of entries) if (entry.isDirectory()) stack.push(join(dir, entry.name));
  }
  throw new Error(`MainActivity.java를 찾지 못했습니다 (${root} 아래).`);
}

export async function patchBilling(mobileDir = MOBILE_DIR) {
  const gradlePath = join(mobileDir, "android", "app", "build.gradle");
  const gradleOriginal = await readFile(gradlePath, "utf8").catch(() => {
    throw new Error(`build.gradle이 없습니다: ${gradlePath}\n'npx cap add android'를 먼저 실행하세요.`);
  });

  /* 이중 패치 검사가 앵커 검사보다 먼저다 — patch-release-signing.mjs와 같은 이유로,
     순서를 바꾸면 "두 번 패치했다"가 "템플릿이 다르다"로 잘못 진단된다. */
  if (gradleOriginal.includes("com.android.billingclient")) {
    throw new Error(`build.gradle에 이미 billingclient 의존성이 있습니다: ${gradlePath}\n두 번 패치했거나 템플릿이 바뀌었습니다.`);
  }
  if (!gradleOriginal.includes(GRADLE_ANCHOR)) {
    throw new Error(
      `build.gradle이 예상한 템플릿이 아닙니다 ("${GRADLE_ANCHOR}" 없음): ${gradlePath}\n` +
        `Capacitor 템플릿이 바뀌었을 수 있습니다. 패치 앵커를 확인하세요.`,
    );
  }

  const packageDir = await findPackageDir(mobileDir);
  const activityPath = join(packageDir, "MainActivity.java");
  const activityOriginal = await readFile(activityPath, "utf8");

  /* patch-download.mjs가 먼저 돌아야 이 앵커가 있다. 순서가 뒤집히면 여기서 멈춘다 —
     조용히 건너뛰면 다리를 등록하지 않은 APK가 나오고, 기기에서 구매 버튼이 아무
     반응도 하지 않는 것으로만 드러난다. */
  if (activityOriginal.includes("OmwBillingBridge")) {
    throw new Error(`MainActivity.java에 이미 결제 다리가 등록돼 있습니다: ${activityPath}`);
  }
  if (!activityOriginal.includes(ACTIVITY_ANCHOR)) {
    throw new Error(
      `MainActivity.java가 예상한 형태가 아닙니다 (BlobBridge 등록 줄 없음): ${activityPath}\n` +
        `patch-download.mjs를 먼저 실행했는지, 그 템플릿이 바뀌지 않았는지 확인하세요.`,
    );
  }

  const packageName = activityOriginal.match(/^package\s+([\w.]+);/m)?.[1];
  if (!packageName) throw new Error(`package 선언을 읽지 못했습니다: ${activityPath}`);

  const dependency = `implementation "com.android.billingclient:billing:${BILLING_LIBRARY_VERSION}"`;
  await writeFile(gradlePath, gradleOriginal.replace(GRADLE_ANCHOR, `${GRADLE_ANCHOR}\n    ${dependency}`), "utf8");

  const bridgePath = join(packageDir, "OmwBillingBridge.java");
  await writeFile(bridgePath, billingBridgeSource(packageName), "utf8");

  await writeFile(
    activityPath,
    activityOriginal.replace(ACTIVITY_ANCHOR, `${ACTIVITY_ANCHOR}\n        ${REGISTRATION}`),
    "utf8",
  );

  return { gradlePath, bridgePath, activityPath, packageName, version: BILLING_LIBRARY_VERSION };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("patch-billing.mjs")) {
  patchBilling()
    .then(({ gradlePath, bridgePath, packageName, version }) => {
      console.log("Play Billing 패치 완료");
      console.log(`  의존성  ${gradlePath}`);
      console.log(`  다리    ${bridgePath}`);
      console.log(`  패키지  ${packageName}`);
      console.log(`  버전    ${version}`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
