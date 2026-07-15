import { ensureAiTrialAbuseMarker, getAiCreditUsage, withAiCreditUserLock } from "./ai-credits-service.mjs";
import { PLAN_CONFIG } from "./plan-policy.mjs";

// On My Way 회원/인증 서비스 코어.
// Cloudflare Worker(worker.mjs)와 로컬 서버(serve-local.cjs)가 같은 로직을 공유한다.
// 네 소셜 Provider의 Authorization Code 흐름, 내부 identity, 폐기 가능한 앱 세션을 관리한다.

const SESSION_COOKIE = "omw_session";
const STATE_COOKIE = "omw_oauth_state";
const SESSION_DAYS = 30;
const SESSION_ISSUER = "on-my-way";
const SESSION_AUDIENCE = "on-my-way-app";
const OAUTH_TRANSACTION_TTL_MS = 10 * 60 * 1000;
const ACCOUNT_DELETION_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const LEGAL_PAYMENT_RETENTION_MS = 5 * 365 * 24 * 60 * 60 * 1000;
const PAYMENT_RETRY_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_PAYMENT_RETRIES = 3;
const MAX_APP_STATE_BYTES = 250_000;
const SYNCED_APP_STATE_KEYS = new Set([
  "omwPersonalityProfile",
  "omwExecutionPlan",
  "omwExecutionState",
  "omwCompanionState",
  "omwCompanionEvents",
  "omwExecutionTheme",
]);

const textEncoder = new TextEncoder();

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacSign(payload, secret) {
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

async function hmacVerify(payload, signature, secret) {
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, base64UrlDecode(signature), textEncoder.encode(payload));
}

export async function createSessionToken(payload, secret) {
  const body = base64UrlEncode(textEncoder.encode(JSON.stringify({ iss: SESSION_ISSUER, aud: SESSION_AUDIENCE, ...payload })));
  const signature = await hmacSign(body, secret);
  return `v1.${body}.${signature}`;
}

export async function verifySessionToken(token, secret) {
  try {
    const [version, body, signature] = String(token || "").split(".");
    if (version !== "v1" || !body || !signature) return null;
    if (!(await hmacVerify(body, signature, secret))) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body)));
    if (!payload?.sid || !payload.sub || payload.iss !== SESSION_ISSUER || payload.aud !== SESSION_AUDIENCE || Number(payload.exp || 0) < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

async function sha256Base64Url(value) {
  return base64UrlEncode(new Uint8Array(await crypto.subtle.digest("SHA-256", textEncoder.encode(String(value)))));
}

function decodeJwtPart(value) {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(value)));
}

function parseJwt(value) {
  const [headerPart, payloadPart, signaturePart] = String(value || "").split(".");
  if (!headerPart || !payloadPart || !signaturePart) throw new Error("잘못된 identity token입니다.");
  return {
    headerPart,
    payloadPart,
    signaturePart,
    header: decodeJwtPart(headerPart),
    payload: decodeJwtPart(payloadPart),
  };
}

function randomId(length = 24) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes).slice(0, length);
}

function normalizeSyncedAppState(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const state = {};
  for (const [key, value] of Object.entries(input)) {
    if (!SYNCED_APP_STATE_KEYS.has(key) || typeof value !== "string") continue;
    state[key] = value;
  }
  if (textEncoder.encode(JSON.stringify(state)).byteLength > MAX_APP_STATE_BYTES) return null;
  return state;
}

function constantTimeEqual(left, right) {
  const leftBytes = textEncoder.encode(String(left || ""));
  const rightBytes = textEncoder.encode(String(right || ""));
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  return difference === 0;
}

async function deriveAdminPasswordHash(ctx, password, salt) {
  // Workers Free의 10ms CPU 한도 안에서 처리되도록, KV에는 salt와 해시만 저장하고
  // Worker Secret인 SESSION_SECRET을 서버 측 pepper로 사용한다.
  return hmacSign(`${salt}:${String(password || "")}`, sessionSecret(ctx.env));
}

async function adminPasswordSetting(ctx) {
  return typeof store(ctx).getSetting === "function" ? store(ctx).getSetting("admin_password") : null;
}

async function verifyAdminPassword(ctx, supplied) {
  const setting = await adminPasswordSetting(ctx);
  if (setting?.salt && setting?.hash) {
    return constantTimeEqual(await deriveAdminPasswordHash(ctx, supplied, setting.salt), setting.hash);
  }
  const temporaryPassword = String(ctx.env.ADMIN_PASSWORD || "");
  return temporaryPassword ? constantTimeEqual(supplied, temporaryPassword) : false;
}

const PROVIDERS = {
  kakao: {
    label: "카카오",
    authorizeUrl: "https://kauth.kakao.com/oauth/authorize",
    tokenUrl: "https://kauth.kakao.com/oauth/token",
    profileUrl: "https://kapi.kakao.com/v2/user/me",
    scope: "",
    normalizeProfile(data) {
      return {
        providerUserId: String(data.id),
        name: data.kakao_account?.profile?.nickname || "카카오 회원",
        email: data.kakao_account?.email || "",
        avatar: data.kakao_account?.profile?.thumbnail_image_url || "",
      };
    },
  },
  naver: {
    label: "네이버",
    authorizeUrl: "https://nid.naver.com/oauth2.0/authorize",
    tokenUrl: "https://nid.naver.com/oauth2.0/token",
    profileUrl: "https://openapi.naver.com/v1/nid/me",
    scope: "",
    normalizeProfile(data) {
      const body = data.response || {};
      return {
        providerUserId: String(body.id),
        name: body.nickname || body.name || "네이버 회원",
        email: body.email || "",
        avatar: body.profile_image || "",
      };
    },
  },
  google: {
    label: "구글",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    profileUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
    normalizeProfile(data) {
      return {
        providerUserId: String(data.sub),
        name: data.name || "구글 회원",
        email: data.email || "",
        avatar: data.picture || "",
      };
    },
  },
  apple: {
    label: "Apple",
    authorizeUrl: "https://appleid.apple.com/auth/authorize",
    tokenUrl: "https://appleid.apple.com/auth/token",
    scope: "name email",
  },
};

function providerConfig(env, provider) {
  const upper = provider.toUpperCase();
  const clientId = String(env[`${upper}_CLIENT_ID`] || "");
  const clientSecret = String(env[`${upper}_CLIENT_SECRET`] || "");
  if (provider === "kakao") return { clientId, clientSecret, configured: Boolean(clientId) };
  if (provider === "apple") {
    const teamId = String(env.APPLE_TEAM_ID || "");
    const keyId = String(env.APPLE_KEY_ID || "");
    const privateKey = String(env.APPLE_PRIVATE_KEY || "");
    return { clientId, clientSecret: "", teamId, keyId, privateKey, configured: Boolean(clientId && teamId && keyId && privateKey) };
  }
  return { clientId, clientSecret, configured: Boolean(clientId && clientSecret) };
}

function sessionSecret(env) {
  const secret = String(env.SESSION_SECRET || "");
  if (secret) {
    if (!devLoginAllowed(env) && secret.length < 32) throw new Error("SESSION_SECRET은 32자 이상이어야 합니다.");
    return secret;
  }
  if (devLoginAllowed(env)) return "omw-local-development-session-secret";
  throw new Error("SESSION_SECRET 환경 변수가 필요합니다.");
}

function adminEmails(env) {
  return String(env.ADMIN_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function cookie(name, value, { maxAgeSeconds, path = "/", httpOnly = true, secure }) {
  const parts = [`${name}=${value}`, `Path=${path}`, "SameSite=Lax"];
  if (httpOnly) parts.push("HttpOnly");
  if (secure) parts.push("Secure");
  if (Number.isFinite(maxAgeSeconds)) parts.push(`Max-Age=${maxAgeSeconds}`);
  return parts.join("; ");
}

function safeRedirectPath(value) {
  const candidate = String(value || "/app.html");
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return "/app.html";
  try {
    const parsed = new URL(candidate, "https://app.invalid");
    if (!["/", "/app.html", "/admin.html", "/delete-account"].includes(parsed.pathname)) return "/app.html";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/app.html";
  }
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    provider: user.provider,
    name: user.name,
    email: user.email,
    avatar: user.avatar || "",
    role: user.role || "member",
    plan: user.plan || "free",
    trialStartedAt: user.trialStartedAt || null,
    trialExpiresAt: user.trialExpiresAt || null,
    trialUsedAt: user.trialUsedAt || null,
    trialEndedAt: user.trialEndedAt || null,
    proSince: user.proSince || null,
    subscriptionStatus: user.subscriptionStatus || null,
    currentPeriodEnd: user.currentPeriodEnd || null,
    goalPlanGeneratedAt: user.goalPlanGeneratedAt || null,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

async function internalUserId(env, provider, providerUserId) {
  const digest = await hmacSign(`${provider}:${providerUserId}`, String(env.IDENTITY_SECRET || sessionSecret(env)));
  return `usr_${digest.slice(0, 32)}`;
}

export async function upsertUserFromProfile(userStore, env, provider, profile) {
  const providerUserId = String(profile.providerUserId || "").trim();
  if (!PROVIDERS[provider] || !providerUserId || providerUserId === "undefined" || providerUserId === "null") {
    throw new Error("Provider 사용자 식별자를 확인하지 못했습니다.");
  }

  const existingIdentity = typeof userStore.getIdentity === "function" ? await userStore.getIdentity(provider, providerUserId) : null;
  const id = existingIdentity?.userId || (await internalUserId(env, provider, providerUserId));
  return withAiCreditUserLock(id, async () => {
  const now = Date.now();
  const legacy = existingIdentity ? null : await userStore.getUser(`${provider}:${providerUserId}`);
  const existing = await userStore.getUser(id);
  if (existing?.status === "deletion_pending") {
    const error = new Error("탈퇴 처리 중인 계정입니다. 지원팀에 문의해 주세요.");
    error.status = 409;
    error.code = "ACCOUNT_DELETION_PENDING";
    throw error;
  }
  const isAdminEmail = profile.email && adminEmails(env).includes(profile.email.toLowerCase());

  const user = existing || (legacy ? { ...legacy, id } : {
    id,
    provider,
    status: "active",
    role: isAdminEmail ? "admin" : "member",
    roleSource: isAdminEmail ? "admin_email" : "default",
    plan: "free",
    trialStartedAt: null,
    trialExpiresAt: null,
    trialUsedAt: null,
    trialEndedAt: null,
    createdAt: now,
  });

  user.name = profile.name || user.name || "회원";
  user.email = profile.email || user.email || "";
  user.avatar = profile.avatar || user.avatar || "";
  user.lastLoginAt = now;
  if (isAdminEmail) {
    user.role = "admin";
    user.roleSource = "admin_email";
  } else if (user.roleSource === "admin_email") {
    user.role = "member";
    user.roleSource = "default";
  }

  user.updatedAt = now;
  await userStore.putUser(user);
  if (typeof userStore.putIdentity === "function") {
    await userStore.putIdentity({
      id: `${provider}:${providerUserId}`,
      userId: id,
      provider,
      providerUserId,
      providerEmail: profile.email || "",
      displayName: profile.name || "",
      profileImageUrl: profile.avatar || "",
      createdAt: existingIdentity?.createdAt || now,
      updatedAt: now,
    });
  }
  return user;
  });
}

async function issueSession(ctx, user) {
  const sessionId = randomId(40);
  const now = Date.now();
  const expiresAt = now + SESSION_DAYS * 24 * 60 * 60 * 1000;
  if (typeof store(ctx).putSession === "function") {
    await store(ctx).putSession({ id: sessionId, userId: user.id, createdAt: now, expiresAt, revokedAt: null });
  }
  const token = await createSessionToken(
    { sid: sessionId, sub: user.id, role: user.role || "member", iat: now, exp: expiresAt },
    sessionSecret(ctx.env),
  );
  return cookie(SESSION_COOKIE, token, { maxAgeSeconds: SESSION_DAYS * 24 * 60 * 60, secure: ctx.secure });
}

export async function currentSessionUser(ctx) {
  const token = ctx.getCookie(SESSION_COOKIE);
  if (!token) return null;
  const payload = await verifySessionToken(token, sessionSecret(ctx.env));
  if (!payload) return null;

  if (payload.sid && typeof store(ctx).getSession === "function") {
    const session = await store(ctx).getSession(payload.sid);
    if (!session || session.revokedAt || session.userId !== payload.sub || Number(session.expiresAt || 0) < Date.now()) return null;
  }

  if (payload.sub === "admin:password") {
    return { id: "admin:password", provider: "password", name: "관리자", email: "", role: "admin", plan: "pro", createdAt: 0, lastLoginAt: Date.now() };
  }

  const user = await store(ctx).getUser(payload.sub);
  return user && (user.status || "active") === "active" ? user : null;
}

async function revokeCurrentSession(ctx) {
  const token = ctx.getCookie(SESSION_COOKIE);
  if (!token) return;
  const payload = await verifySessionToken(token, sessionSecret(ctx.env));
  if (payload?.sid && typeof store(ctx).deleteSession === "function") await store(ctx).deleteSession(payload.sid);
}

function store(ctx) {
  return ctx.store;
}

function devLoginAllowed(env) {
  const environment = String(env.APP_ENV || "production").toLowerCase();
  return ["local", "test"].includes(environment) && String(env.ALLOW_DEV_LOGIN || "").toLowerCase() === "true";
}

function demoBillingAllowed(env) {
  return String(env.ALLOW_DEMO_BILLING || "").toLowerCase() === "true";
}

function billingConfig(env) {
  const clientKey = String(env.TOSS_CLIENT_KEY || "");
  const secretKey = String(env.TOSS_SECRET_KEY || "");
  const configured = Boolean(clientKey && secretKey);
  const enabled = configured && String(env.PAYMENTS_ENABLED || "").toLowerCase() === "true";
  return { clientKey, secretKey, configured, enabled };
}

function addBillingMonth(value) {
  const date = new Date(Number(value) || Date.now());
  date.setMonth(date.getMonth() + 1);
  return date.getTime();
}

async function tossBillingRequest(env, path, { method = "POST", body, fetcher = fetch } = {}) {
  const config = billingConfig(env);
  if (!config.configured) throw new Error("자동결제 환경 변수가 설정되지 않았습니다.");
  const response = await fetcher(`https://api.tosspayments.com${path}`, {
    method,
    headers: {
      Authorization: `Basic ${btoa(`${config.secretKey}:`)}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || "결제사 요청을 처리하지 못했습니다.");
    error.status = response.status >= 500 ? 502 : 400;
    error.code = data.code || "BILLING_ERROR";
    throw error;
  }
  return data;
}

async function ensureCustomerKey(ctx, user) {
  if (!user.customerKey) {
    user.customerKey = `omw_${randomId(30)}`;
    await store(ctx).putUser(user);
  }
  return user.customerKey;
}

function createPaymentOrderId() {
  return `omw_${Date.now()}_${randomId(10)}`;
}

async function chargeSubscription(env, user, { orderId = createPaymentOrderId(), fetcher = fetch } = {}) {
  return tossBillingRequest(env, `/v1/billing/${encodeURIComponent(user.billingKey)}`, {
    fetcher,
    body: {
      customerKey: user.customerKey,
      amount: PLAN_CONFIG.pro.priceKRW,
      orderId,
      orderName: "On My Way PRO 월정액",
      customerEmail: user.email || undefined,
      customerName: user.name || undefined,
    },
  });
}

async function recoverCompletedPayment(env, orderId, fetcher = fetch) {
  if (!orderId) return null;
  try {
    const payment = await tossBillingRequest(env, `/v1/payments/orders/${encodeURIComponent(orderId)}`, { method: "GET", fetcher });
    return ["DONE", "PARTIAL_CANCELED"].includes(payment.status) ? payment : null;
  } catch {
    return null;
  }
}

function applySuccessfulPayment(user, payment, now) {
  user.plan = "pro";
  user.proSince = user.proSince || now;
  user.subscriptionStatus = "active";
  user.currentPeriodEnd = addBillingMonth(now);
  user.lastPaymentKey = payment.paymentKey || null;
  user.lastOrderId = payment.orderId || null;
  user.lastPaymentAt = now;
  user.paymentFailure = null;
  user.paymentRetryCount = 0;
  user.nextPaymentRetryAt = null;
  user.pendingOrderId = null;
  user.pendingRenewalOrderId = null;
}

function devLoginPage(provider, redirect) {
  const meta = PROVIDERS[provider];
  const colors = { kakao: "#fee500", naver: "#03c75a", google: "#f3f5f9" };
  const textColors = { kakao: "#38290a", naver: "#ffffff", google: "#3a4763" };
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${meta.label} 로그인 (데모)</title>
<style>
  body { display:grid; min-height:100vh; margin:0; place-items:center; background:linear-gradient(160deg,#f3f6fb,#eef4f0); font-family:'Pretendard','Apple SD Gothic Neo',sans-serif; }
  .card { width:min(92vw,360px); padding:30px 26px; background:#fff; border-radius:22px; box-shadow:0 24px 60px rgba(70,84,120,.16); }
  .badge { display:inline-block; padding:7px 12px; border-radius:999px; background:${colors[provider]}; color:${textColors[provider]}; font-size:12px; font-weight:800; }
  h1 { margin:14px 0 6px; color:#2e3850; font-size:19px; }
  p { margin:0 0 18px; color:#7d879c; font-size:12px; line-height:1.6; }
  label { display:block; margin-bottom:12px; color:#5b6579; font-size:11px; font-weight:700; }
  input { box-sizing:border-box; width:100%; margin-top:5px; padding:11px 12px; border:1px solid #dbe1ec; border-radius:11px; font:inherit; font-size:13px; }
  button { width:100%; margin-top:6px; padding:13px; border:0; border-radius:12px; background:#5c7f72; color:#fff; font:inherit; font-size:14px; font-weight:800; cursor:pointer; }
  small { display:block; margin-top:12px; color:#a2abbd; font-size:10px; line-height:1.5; }
</style></head>
<body><form class="card" id="devLoginForm">
  <span class="badge">${meta.label} 로그인 데모</span>
  <h1>${meta.label} 계정으로 계속하기</h1>
  <p>아직 ${meta.label} 개발자 키가 연결되지 않아 데모 로그인으로 진행돼요. 키를 연결하면 이 화면 대신 실제 ${meta.label} 로그인이 열립니다.</p>
  <label>이름(닉네임)<input id="devName" type="text" maxlength="20" placeholder="예: 올리친구" required /></label>
  <label>이메일 (선택)<input id="devEmail" type="email" maxlength="60" placeholder="예: me@example.com" /></label>
  <button type="submit">동의하고 계속하기</button>
  <small>입력한 정보는 이 서비스의 회원 정보로만 저장됩니다.</small>
</form>
<script>
document.querySelector('#devLoginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const response = await fetch('/api/auth/dev-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: ${JSON.stringify(provider)},
      name: document.querySelector('#devName').value.trim(),
      email: document.querySelector('#devEmail').value.trim(),
    }),
  });
  if (response.ok) location.href = ${JSON.stringify(safeRedirectPath(redirect))};
  else alert('로그인에 실패했어요. 다시 시도해 주세요.');
});
</script></body></html>`;
}

function pemToBytes(value) {
  const base64 = String(value || "")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  if (!base64) throw new Error("Apple private key 설정이 필요합니다.");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function createAppleClientSecret(config, now = Date.now()) {
  const issuedAt = Math.floor(now / 1000);
  const headerPart = base64UrlEncode(textEncoder.encode(JSON.stringify({ alg: "ES256", kid: config.keyId, typ: "JWT" })));
  const payloadPart = base64UrlEncode(textEncoder.encode(JSON.stringify({
    iss: config.teamId,
    iat: issuedAt,
    exp: issuedAt + 5 * 60,
    aud: "https://appleid.apple.com",
    sub: config.clientId,
  })));
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(config.privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, textEncoder.encode(`${headerPart}.${payloadPart}`));
  return `${headerPart}.${payloadPart}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifyAppleIdentityToken(idToken, { clientId, nonce, fetcher = fetch, now = Date.now() }) {
  const parsed = parseJwt(idToken);
  if (parsed.header.alg !== "RS256" || !parsed.header.kid) throw new Error("Apple identity token header가 올바르지 않습니다.");
  const response = await fetcher("https://appleid.apple.com/auth/keys", { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Apple 공개키를 가져오지 못했습니다.");
  const jwks = await response.json();
  const jwk = Array.isArray(jwks.keys) ? jwks.keys.find((candidate) => candidate.kid === parsed.header.kid && candidate.kty === "RSA") : null;
  if (!jwk) throw new Error("Apple identity token 공개키를 찾지 못했습니다.");
  const publicKey = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const validSignature = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    base64UrlDecode(parsed.signaturePart),
    textEncoder.encode(`${parsed.headerPart}.${parsed.payloadPart}`),
  );
  const audience = Array.isArray(parsed.payload.aud) ? parsed.payload.aud : [parsed.payload.aud];
  if (!validSignature) throw new Error("Apple identity token 서명이 올바르지 않습니다.");
  if (parsed.payload.iss !== "https://appleid.apple.com") throw new Error("Apple identity token issuer가 올바르지 않습니다.");
  if (!audience.includes(clientId)) throw new Error("Apple identity token audience가 올바르지 않습니다.");
  if (Number(parsed.payload.exp || 0) * 1000 < now) throw new Error("Apple identity token이 만료되었습니다.");
  if (!nonce || parsed.payload.nonce !== nonce) throw new Error("Apple identity token nonce가 올바르지 않습니다.");
  if (!parsed.payload.sub) throw new Error("Apple 사용자 식별자가 없습니다.");
  return parsed.payload;
}

async function exchangeOAuthCode(env, provider, code, redirectUri, transaction, firstPartyProfile = {}, fetcher = fetch) {
  const meta = PROVIDERS[provider];
  const config = providerConfig(env, provider);
  const { clientId, clientSecret } = config;
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code,
  });
  if (provider === "apple") params.set("client_secret", await createAppleClientSecret(config));
  else if (clientSecret) params.set("client_secret", clientSecret);
  if (provider === "naver") params.set("state", transaction.state);
  if (transaction.codeVerifier) params.set("code_verifier", transaction.codeVerifier);

  let tokenUrl = meta.tokenUrl;
  let tokenOptions = { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString() };
  if (provider === "naver") {
    tokenUrl = `${meta.tokenUrl}?${params}`;
    tokenOptions = { method: "GET", headers: { Accept: "application/json" } };
  }
  const tokenResponse = await fetcher(tokenUrl, tokenOptions);
  const tokenData = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || (!tokenData.access_token && !tokenData.id_token)) throw new Error(`${meta.label} 토큰 발급에 실패했어요.`);

  if (provider === "apple") {
    const claims = await verifyAppleIdentityToken(tokenData.id_token, { clientId, nonce: transaction.nonce, fetcher });
    return {
      providerUserId: String(claims.sub),
      name: firstPartyProfile.name || "",
      email: claims.email || firstPartyProfile.email || "",
      avatar: "",
    };
  }

  const profileResponse = await fetcher(meta.profileUrl, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const profileData = await profileResponse.json().catch(() => ({}));
  if (!profileResponse.ok) throw new Error(`${meta.label} 프로필을 가져오지 못했어요.`);
  return meta.normalizeProfile(profileData);
}

function authErrorRedirect(code, provider = "") {
  const params = new URLSearchParams({ auth: code });
  if (provider) params.set("provider", provider);
  return `/app.html?${params}`;
}

async function readOAuthCallback(ctx, provider) {
  if (provider === "apple" && ctx.method === "POST" && typeof ctx.readForm === "function") return ctx.readForm();
  return Object.fromEntries(ctx.url.searchParams.entries());
}

async function consumeOAuthTransaction(ctx, provider, state) {
  if (!state || state !== (ctx.getCookie(STATE_COOKIE) || "")) return null;
  if (typeof store(ctx).getOAuthTransaction !== "function") return null;
  const transaction = await store(ctx).getOAuthTransaction(state);
  if (!transaction || transaction.provider !== provider || Number(transaction.expiresAt || 0) < Date.now() || transaction.usedAt) return null;
  if (typeof store(ctx).deleteOAuthTransaction === "function") await store(ctx).deleteOAuthTransaction(state);
  return transaction;
}

// ctx: {
//   method, url(URL), getCookie(name), readJson(), env(객체), store({getUser, putUser, listUsers, deleteUser}), secure(bool)
// }
// 반환: { status, json?, html?, redirect?, cookies?: [] } 또는 null(미처리 경로)
export async function handleAccountApi(ctx) {
  const { method, url } = ctx;
  const path = url.pathname;

  if (path === "/api/auth/providers" && method === "GET") {
    return {
      status: 200,
      json: {
        providers: Object.keys(PROVIDERS).map((id) => ({
          id,
          label: PROVIDERS[id].label,
          configured: providerConfig(ctx.env, id).configured,
        })),
        devLoginEnabled: devLoginAllowed(ctx.env),
      },
    };
  }

  const providerStartMatch = path.match(/^\/api\/auth\/(kakao|naver|google|apple)\/start$/);
  if ((path === "/api/auth/start" || providerStartMatch) && method === "GET") {
    const provider = providerStartMatch?.[1] || String(url.searchParams.get("provider") || "");
    const redirect = safeRedirectPath(url.searchParams.get("redirect"));
    if (!PROVIDERS[provider]) return { status: 400, json: { error: "지원하지 않는 로그인 방식이에요." } };

    const config = providerConfig(ctx.env, provider);
    if (!config.configured) {
      if (!devLoginAllowed(ctx.env)) return { status: 503, json: { error: `${PROVIDERS[provider].label} 로그인이 아직 준비 중이에요.` } };
      return { status: 200, html: devLoginPage(provider, redirect) };
    }

    const state = randomId(40);
    const codeVerifier = provider === "google" ? randomId(64) : "";
    const nonce = provider === "apple" ? randomId(40) : "";
    const transaction = {
      state,
      provider,
      redirect,
      codeVerifier,
      nonce,
      createdAt: Date.now(),
      expiresAt: Date.now() + OAUTH_TRANSACTION_TTL_MS,
    };
    if (typeof store(ctx).putOAuthTransaction !== "function") return { status: 503, json: { error: "로그인 상태 저장소가 아직 준비되지 않았습니다." } };
    await store(ctx).putOAuthTransaction(transaction);
    const redirectUri = `${url.origin}/api/auth/callback/${provider}`;
    const authorize = new URL(PROVIDERS[provider].authorizeUrl);
    authorize.searchParams.set("client_id", config.clientId);
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("state", state);
    if (PROVIDERS[provider].scope) authorize.searchParams.set("scope", PROVIDERS[provider].scope);
    if (codeVerifier) {
      authorize.searchParams.set("code_challenge", await sha256Base64Url(codeVerifier));
      authorize.searchParams.set("code_challenge_method", "S256");
    }
    if (nonce) authorize.searchParams.set("nonce", nonce);
    if (provider === "apple") authorize.searchParams.set("response_mode", "form_post");

    return {
      status: 302,
      redirect: authorize.toString(),
      cookies: [cookie(STATE_COOKIE, state, { maxAgeSeconds: 600, secure: ctx.secure })],
    };
  }

  const callbackMatch = path.match(/^\/api\/auth\/callback\/(kakao|naver|google|apple)$/);
  if (callbackMatch && (method === "GET" || (callbackMatch[1] === "apple" && method === "POST"))) {
    const provider = callbackMatch[1];
    const callback = await readOAuthCallback(ctx, provider);
    const code = String(callback.code || "");
    const state = String(callback.state || "");
    const clearStateCookie = cookie(STATE_COOKIE, "", { maxAgeSeconds: 0, secure: ctx.secure });
    if (callback.error) {
      return { status: 302, redirect: authErrorRedirect(callback.error === "user_cancelled_authorize" ? "cancelled" : "provider_error", provider), cookies: [clearStateCookie] };
    }
    const transaction = await consumeOAuthTransaction(ctx, provider, state);
    if (!code || !transaction) {
      return { status: 302, redirect: authErrorRedirect("invalid_state", provider), cookies: [clearStateCookie] };
    }

    const redirect = safeRedirectPath(transaction.redirect);
    let firstPartyProfile = {};
    if (provider === "apple" && callback.user) {
      try {
        const appleUser = JSON.parse(String(callback.user));
        firstPartyProfile = {
          name: [appleUser.name?.firstName, appleUser.name?.lastName].filter(Boolean).join(" ").trim(),
          email: String(appleUser.email || ""),
        };
      } catch {}
    }

    try {
      const redirectUri = `${url.origin}/api/auth/callback/${provider}`;
      const profile = await exchangeOAuthCode(ctx.env, provider, code, redirectUri, transaction, firstPartyProfile, ctx.fetcher || fetch);
      const user = await upsertUserFromProfile(store(ctx), ctx.env, provider, profile);
      return {
        status: 302,
        redirect: `${redirect}${redirect.includes("?") ? "&" : "?"}auth=success`,
        cookies: [await issueSession(ctx, user), clearStateCookie],
      };
    } catch (error) {
      if (error?.code === "ACCOUNT_DELETION_PENDING") {
        return { status: 302, redirect: authErrorRedirect("deletion_pending", provider), cookies: [clearStateCookie] };
      }
      console.error(`${provider} OAuth callback failed`, { name: error?.name, message: error?.message });
      return { status: 302, redirect: authErrorRedirect("callback_error", provider), cookies: [clearStateCookie] };
    }
  }

  if (path === "/api/auth/dev-login" && method === "POST") {
    if (!devLoginAllowed(ctx.env)) return { status: 403, json: { error: "데모 로그인이 비활성화되어 있어요." } };
    const body = await ctx.readJson();
    const provider = String(body.provider || "");
    if (!PROVIDERS[provider]) return { status: 400, json: { error: "지원하지 않는 로그인 방식이에요." } };
    const name = String(body.name || "").trim().slice(0, 20);
    const email = String(body.email || "").trim().slice(0, 60).toLowerCase();
    if (!name) return { status: 400, json: { error: "이름을 입력해 주세요." } };

    // 같은 이름+이메일 조합이면 같은 데모 계정으로 다시 로그인되게 안정적인 ID를 만든다.
    const providerUserId = `dev-${base64UrlEncode(textEncoder.encode(`${name}|${email}`)).slice(0, 24)}`;
    const user = await upsertUserFromProfile(store(ctx), ctx.env, provider, { providerUserId, name, email, avatar: "" });
    return { status: 200, json: { user: publicUser(user) }, cookies: [await issueSession(ctx, user)] };
  }

  if ((path === "/api/auth/me" || path === "/api/auth/session") && method === "GET") {
    const user = await currentSessionUser(ctx);
    return { status: 200, json: { user: publicUser(user) } };
  }

  if (path === "/api/auth/logout" && method === "POST") {
    await revokeCurrentSession(ctx);
    return { status: 200, json: { ok: true }, cookies: [cookie(SESSION_COOKIE, "", { maxAgeSeconds: 0, secure: ctx.secure })] };
  }

  if (path === "/api/account/state" && method === "GET") {
    const user = await currentSessionUser(ctx);
    if (!user) return { status: 401, json: { error: "로그인 후 동기화할 수 있어요." } };
    const record = typeof store(ctx).getAppState === "function" ? await store(ctx).getAppState(user.id) : null;
    return {
      status: 200,
      json: {
        state: record?.state || {},
        revision: Number(record?.revision || 0),
        updatedAt: Number(record?.updatedAt || 0),
      },
    };
  }

  if (path === "/api/account/state" && method === "PUT") {
    const user = await currentSessionUser(ctx);
    if (!user) return { status: 401, json: { error: "로그인 후 동기화할 수 있어요." } };
    if (typeof store(ctx).getAppState !== "function" || typeof store(ctx).putAppState !== "function") {
      return { status: 503, json: { error: "동기화 저장소가 준비되지 않았어요." } };
    }
    const body = await ctx.readJson();
    if (String(body.userId || "") !== user.id) {
      return { status: 409, json: { error: "로그인 계정이 변경되어 동기화를 중단했습니다.", code: "ACCOUNT_CHANGED" } };
    }
    const state = normalizeSyncedAppState(body.state);
    if (!state) return { status: 413, json: { error: "동기화 데이터가 너무 크거나 올바르지 않아요." } };
    const existing = await store(ctx).getAppState(user.id);
    const serverRevision = Number(existing?.revision || 0);
    const baseRevision = Math.max(0, Number(body.baseRevision || 0));
    if (baseRevision !== serverRevision) {
      return {
        status: 409,
        json: {
          error: "다른 기기에서 데이터가 변경되었어요.",
          state: existing?.state || {},
          revision: serverRevision,
          updatedAt: Number(existing?.updatedAt || 0),
        },
      };
    }
    const record = {
      userId: user.id,
      state,
      revision: serverRevision + 1,
      updatedAt: Date.now(),
      deviceId: String(body.deviceId || "").slice(0, 80),
    };
    await store(ctx).putAppState(user.id, record);
    return { status: 200, json: { revision: record.revision, updatedAt: record.updatedAt } };
  }

  if (path === "/api/account/delete" && method === "POST") {
    const user = await currentSessionUser(ctx);
    if (!user) return { status: 401, json: { error: "로그인 후 계정을 삭제할 수 있어요." } };
    if (user.role === "admin" || user.id === "admin:password") {
      return { status: 403, json: { error: "관리자 계정은 관리자 권한을 해제한 뒤 삭제해 주세요." } };
    }
    const body = await ctx.readJson();
    if (String(body.confirmation || "").trim() !== "계정 삭제") {
      return { status: 400, json: { error: "확인란에 ‘계정 삭제’를 정확히 입력해 주세요." } };
    }
    const userStore = store(ctx);
    if (typeof userStore.deleteIdentitiesByUserId !== "function" || typeof userStore.deleteSessionsByUserId !== "function") {
      return { status: 503, json: { error: "계정 삭제 저장소가 준비되지 않았습니다." } };
    }

    const hasPaymentRecord = Boolean(user.billingKey || user.lastPaymentKey || user.lastOrderId || user.lastPaymentAt);
    if (hasPaymentRecord && !ctx.legalStore) {
      return { status: 503, json: { error: "법정 보관 저장소가 준비되지 않아 지금은 탈퇴를 처리할 수 없습니다." } };
    }

    if (user.billingKey && !billingConfig(ctx.env).configured) {
      return { status: 503, json: { error: "정기결제 해지 설정을 확인할 수 없어 탈퇴를 중단했습니다. 고객지원에 문의해 주세요." } };
    }
    if (user.billingKey) {
      try {
        await tossBillingRequest(ctx.env, `/v1/billing/${encodeURIComponent(user.billingKey)}`, {
          method: "DELETE",
          fetcher: ctx.fetcher || fetch,
        });
      } catch (error) {
        console.error("Billing cancellation before account deletion failed", { code: error?.code, message: error?.message });
        return { status: 502, json: { error: "정기결제 해지를 확인하지 못해 탈퇴를 중단했습니다. 잠시 후 다시 시도해 주세요." } };
      }
    }

    const now = Date.now();
    if (hasPaymentRecord) {
      const retainedUntil = now + LEGAL_PAYMENT_RETENTION_MS;
      await ctx.legalStore.put({
        id: `payment_${randomId(28)}`,
        subjectRef: (await hmacSign(`legal-retention:${user.id}`, String(ctx.env.IDENTITY_SECRET || sessionSecret(ctx.env)))).slice(0, 32),
        email: user.email || "",
        recordType: "payment_and_contract",
        subscriptionStatus: user.subscriptionStatus || null,
        proSince: user.proSince || null,
        currentPeriodEnd: user.currentPeriodEnd || null,
        lastPaymentKey: user.lastPaymentKey || null,
        lastOrderId: user.lastOrderId || null,
        lastPaymentAt: user.lastPaymentAt || null,
        deletionRequestedAt: now,
        retainedUntil,
      }, retainedUntil);
    }

    const deletionScheduledAt = now + ACCOUNT_DELETION_GRACE_MS;
    const deleted = await withAiCreditUserLock(user.id, async () => {
      const latestUser = await userStore.getUser(user.id);
      if (!latestUser || (latestUser.status && latestUser.status !== "active")) return false;
      await ensureAiTrialAbuseMarker({
        store: userStore,
        userId: latestUser.id,
        usedAt: latestUser.aiCredits?.trial?.usedAt || latestUser.trialUsedAt,
        now,
      });
      await userStore.deleteIdentitiesByUserId(user.id);
      await userStore.deleteSessionsByUserId(user.id);
      if (typeof userStore.deleteAppState === "function") await userStore.deleteAppState(user.id);
      await userStore.putUser({
        id: user.id,
        status: "deletion_pending",
        deletionRequestedAt: now,
        deletionScheduledAt,
      }, { expiresAt: deletionScheduledAt });
      return true;
    });
    if (!deleted) return { status: 409, json: { error: "계정 상태가 변경되어 탈퇴 요청을 다시 확인해야 합니다." } };
    return {
      status: 202,
      json: { ok: true, deletionScheduledAt },
      cookies: [cookie(SESSION_COOKIE, "", { maxAgeSeconds: 0, secure: ctx.secure })],
    };
  }

  if (path === "/api/admin/login" && method === "POST") {
    const setting = await adminPasswordSetting(ctx);
    if (!setting && !ctx.env.ADMIN_PASSWORD) return { status: 503, json: { error: "관리자 로그인이 아직 설정되지 않았습니다." } };
    const body = await ctx.readJson();
    const supplied = String(body.password || "");
    if (!(await verifyAdminPassword(ctx, supplied))) return { status: 401, json: { error: "관리자 비밀번호가 올바르지 않습니다." } };
    const adminUser = { id: "admin:password", role: "admin" };
    return {
      status: 200,
      json: { user: { id: adminUser.id, name: "관리자", role: "admin", plan: "pro", provider: "password" } },
      cookies: [await issueSession(ctx, adminUser)],
    };
  }

  if (path === "/api/admin/password" && method === "POST") {
    const admin = await currentSessionUser(ctx);
    if (admin?.role !== "admin") return { status: 403, json: { error: "관리자만 비밀번호를 변경할 수 있습니다." } };
    if (typeof store(ctx).putSetting !== "function") return { status: 503, json: { error: "비밀번호 저장소가 준비되지 않았습니다." } };
    const body = await ctx.readJson();
    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");
    if (!(await verifyAdminPassword(ctx, currentPassword))) return { status: 401, json: { error: "현재 비밀번호가 올바르지 않습니다." } };
    if (newPassword.length < 16 || newPassword.length > 128) return { status: 400, json: { error: "새 비밀번호는 16자 이상 128자 이하로 설정해 주세요." } };
    if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      return { status: 400, json: { error: "영문 대문자·소문자, 숫자, 특수문자를 각각 1개 이상 포함해 주세요." } };
    }
    const salt = randomId(32);
    await store(ctx).putSetting("admin_password", {
      algorithm: "HMAC-SHA256-PEPPERED",
      salt,
      hash: await deriveAdminPasswordHash(ctx, newPassword, salt),
      updatedAt: Date.now(),
    });
    return { status: 200, json: { ok: true } };
  }

  if (path === "/api/billing/subscribe" && method === "POST") {
    const user = await currentSessionUser(ctx);
    if (!user) return { status: 401, json: { error: "로그인 후 이용할 수 있어요." } };
    if (!demoBillingAllowed(ctx.env)) return { status: 409, json: { error: "결제창에서 카드 등록을 먼저 완료해 주세요." } };
    user.plan = "pro";
    user.proSince = user.proSince || Date.now();
    user.subscriptionStatus = "active";
    user.currentPeriodEnd = addBillingMonth(Date.now());
    await store(ctx).putUser(user);
    return { status: 200, json: { user: publicUser(user) } };
  }

  if (path === "/api/billing/config" && method === "GET") {
    const user = await currentSessionUser(ctx);
    if (!user) return { status: 401, json: { error: "로그인 후 이용할 수 있어요." } };
    const config = billingConfig(ctx.env);
    const customerKey = await ensureCustomerKey(ctx, user);
    return { status: 200, json: { configured: config.enabled, clientKey: config.enabled ? config.clientKey : null, customerKey, demo: demoBillingAllowed(ctx.env) } };
  }

  if (path === "/api/billing/activate" && method === "POST") {
    const user = await currentSessionUser(ctx);
    if (!user) return { status: 401, json: { error: "로그인 후 이용할 수 있어요." } };
    const body = await ctx.readJson();
    const authKey = String(body.authKey || "");
    const customerKey = String(body.customerKey || "");
    if (!authKey || !customerKey || customerKey !== user.customerKey) return { status: 400, json: { error: "자동결제 인증 정보가 올바르지 않습니다." } };
    if (!billingConfig(ctx.env).enabled) return { status: 503, json: { error: "결제 운영 승인이 완료되지 않았습니다." } };
    if (user.subscriptionStatus === "active" && user.billingKey) return { status: 200, json: { user: publicUser(user), alreadyActive: true } };

    if (!user.billingKey) {
      const issued = await tossBillingRequest(ctx.env, "/v1/billing/authorizations/issue", {
        body: { authKey, customerKey },
        fetcher: ctx.fetcher || fetch,
      });
      user.billingKey = issued.billingKey;
    }
    user.pendingOrderId = user.pendingOrderId || createPaymentOrderId();
    user.subscriptionStatus = "pending";
    await store(ctx).putUser(user);

    try {
      const payment = await chargeSubscription(ctx.env, user, { orderId: user.pendingOrderId, fetcher: ctx.fetcher || fetch });
      const now = Date.now();
      applySuccessfulPayment(user, payment, now);
      await store(ctx).putUser(user);
      return { status: 200, json: { user: publicUser(user) } };
    } catch (error) {
      const recovered = await recoverCompletedPayment(ctx.env, user.pendingOrderId, ctx.fetcher || fetch);
      if (recovered) {
        applySuccessfulPayment(user, recovered, Date.now());
        await store(ctx).putUser(user);
        return { status: 200, json: { user: publicUser(user), recovered: true } };
      }
      user.subscriptionStatus = "payment_failed";
      user.paymentFailure = { code: error.code || "BILLING_ERROR", at: Date.now() };
      await store(ctx).putUser(user);
      throw error;
    }
  }

  if (path === "/api/billing/cancel" && method === "POST") {
    const user = await currentSessionUser(ctx);
    if (!user) return { status: 401, json: { error: "로그인 후 이용할 수 있어요." } };
    if (user.billingKey && !billingConfig(ctx.env).configured) {
      return { status: 503, json: { error: "결제사 해지 설정을 확인할 수 없어 구독 상태를 유지했습니다." } };
    }
    if (user.billingKey) {
      try {
        await tossBillingRequest(ctx.env, `/v1/billing/${encodeURIComponent(user.billingKey)}`, { method: "DELETE", fetcher: ctx.fetcher || fetch });
      } catch {
        return { status: 502, json: { error: "결제사에서 해지를 확인하지 못해 구독 상태를 유지했습니다. 잠시 후 다시 시도해 주세요." } };
      }
    }
    user.billingKey = null;
    user.subscriptionStatus = "canceled";
    if (!user.currentPeriodEnd || Number(user.currentPeriodEnd) <= Date.now()) user.plan = "free";
    await store(ctx).putUser(user);
    return { status: 200, json: { user: publicUser(user) } };
  }

  if (path === "/api/admin/users" && method === "GET") {
    const user = await currentSessionUser(ctx);
    if (user?.role !== "admin") return { status: 403, json: { error: "관리자만 볼 수 있어요." } };
    const users = await store(ctx).listUsers();
    users.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    const publicUsers = await Promise.all(users.map(async (member) => ({
      ...publicUser(member),
      aiUsage: await getAiCreditUsage({ store: store(ctx), userId: member.id }).catch(() => null),
    })));
    return { status: 200, json: { users: publicUsers } };
  }

  if (path === "/api/admin/users/update" && method === "POST") {
    const admin = await currentSessionUser(ctx);
    if (admin?.role !== "admin") return { status: 403, json: { error: "관리자만 수정할 수 있어요." } };
    const body = await ctx.readJson();
    const target = await store(ctx).getUser(String(body.id || ""));
    if (!target) return { status: 404, json: { error: "회원을 찾을 수 없어요." } };

    if (body.plan === "pro" && target.plan !== "pro") {
      target.plan = "pro";
      target.proSince = Date.now();
      target.subscriptionStatus = target.billingKey ? "active" : "complimentary";
    } else if (body.plan === "free" || body.plan === "trial") {
      if (target.billingKey && !billingConfig(ctx.env).configured) {
        return { status: 503, json: { error: "결제사 해지 설정을 확인할 수 없어 회원 구독을 유지했습니다." } };
      }
      if (target.billingKey) {
        try {
          await tossBillingRequest(ctx.env, `/v1/billing/${encodeURIComponent(target.billingKey)}`, { method: "DELETE", fetcher: ctx.fetcher || fetch });
        } catch {
          return { status: 502, json: { error: "결제사 해지를 확인하지 못해 회원 구독을 유지했습니다." } };
        }
      }
      target.plan = "free";
      target.proSince = null;
      target.billingKey = null;
      target.subscriptionStatus = "canceled";
      target.currentPeriodEnd = Date.now();
    }
    if (body.role === "admin" || body.role === "member") {
      target.role = body.role;
      target.roleSource = body.role === "admin" ? "manual" : "default";
    }

    await store(ctx).putUser(target);
    return { status: 200, json: { user: publicUser(target) } };
  }

  return null;
}

export async function renewDueSubscriptions({ env, store: userStore, now = Date.now(), fetcher = fetch }) {
  const canCharge = billingConfig(env).enabled;
  const users = await userStore.listUsers();
  let processed = 0;
  let renewed = 0;
  let failed = 0;
  let retrying = 0;
  for (const user of users) {
    if (user.subscriptionStatus === "canceled" && user.plan === "pro" && Number(user.currentPeriodEnd || 0) <= now) {
      user.plan = "free";
      await userStore.putUser(user);
      processed += 1;
      continue;
    }
    if (!canCharge) continue;
    if (!["active", "past_due"].includes(user.subscriptionStatus) || !user.billingKey) continue;
    if (user.subscriptionStatus === "active" && Number(user.currentPeriodEnd || 0) > now) continue;
    if (user.subscriptionStatus === "past_due" && Number(user.nextPaymentRetryAt || 0) > now) continue;
    processed += 1;
    user.pendingRenewalOrderId = user.pendingRenewalOrderId || createPaymentOrderId();
    await userStore.putUser(user);
    try {
      const payment = await chargeSubscription(env, user, { orderId: user.pendingRenewalOrderId, fetcher });
      applySuccessfulPayment(user, payment, now);
      renewed += 1;
    } catch (error) {
      const recovered = await recoverCompletedPayment(env, user.pendingRenewalOrderId, fetcher);
      if (recovered) {
        applySuccessfulPayment(user, recovered, now);
        renewed += 1;
      } else {
        const retryCount = Number(user.paymentRetryCount || 0) + 1;
        user.paymentRetryCount = retryCount;
        user.paymentFailure = { code: error.code || "BILLING_ERROR", at: now };
        if (retryCount >= MAX_PAYMENT_RETRIES) {
          user.subscriptionStatus = "payment_failed";
          user.plan = "free";
          user.nextPaymentRetryAt = null;
          failed += 1;
        } else {
          user.subscriptionStatus = "past_due";
          user.plan = "pro";
          user.nextPaymentRetryAt = now + PAYMENT_RETRY_INTERVAL_MS;
          retrying += 1;
        }
      }
    }
    await userStore.putUser(user);
  }
  return { processed, renewed, failed, retrying };
}

export async function purgeDueAccountDeletions({ store: userStore, now = Date.now() }) {
  const users = await userStore.listUsers();
  let purged = 0;
  for (const user of users) {
    if (user.status !== "deletion_pending" || Number(user.deletionScheduledAt || 0) > now) continue;
    if (typeof userStore.deleteIdentitiesByUserId === "function") await userStore.deleteIdentitiesByUserId(user.id);
    if (typeof userStore.deleteSessionsByUserId === "function") await userStore.deleteSessionsByUserId(user.id);
    if (typeof userStore.deleteAppState === "function") await userStore.deleteAppState(user.id);
    if (typeof userStore.deleteUser === "function") await userStore.deleteUser(user.id);
    purged += 1;
  }
  return { purged };
}

export function parseCookies(header) {
  const cookies = {};
  String(header || "")
    .split(";")
    .forEach((part) => {
      const index = part.indexOf("=");
      if (index > 0) cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
    });
  return cookies;
}

// Cloudflare KV 저장소 (없으면 인메모리 폴백 — 배포 전 KV 바인딩 권장)
const memoryUsers = new Map();
const memorySettings = new Map();
const memoryIdentities = new Map();
const memorySessions = new Map();
const memoryOAuthTransactions = new Map();
const memoryAppStates = new Map();

function identityStorageKey(provider, providerUserId) {
  return `identity:${provider}:${encodeURIComponent(providerUserId)}`;
}

export function createKvStore(kv) {
  if (!kv) {
    return {
      async getUser(id) {
        return memoryUsers.get(id) || null;
      },
      async putUser(user) {
        memoryUsers.set(user.id, user);
      },
      async listUsers() {
        return [...memoryUsers.values()];
      },
      async deleteUser(id) {
        memoryUsers.delete(id);
      },
      async getAppState(userId) {
        return memoryAppStates.get(userId) || null;
      },
      async putAppState(userId, record) {
        memoryAppStates.set(userId, record);
      },
      async deleteAppState(userId) {
        memoryAppStates.delete(userId);
      },
      async getIdentity(provider, providerUserId) {
        return memoryIdentities.get(identityStorageKey(provider, providerUserId)) || null;
      },
      async putIdentity(identity) {
        memoryIdentities.set(identityStorageKey(identity.provider, identity.providerUserId), identity);
      },
      async deleteIdentitiesByUserId(userId) {
        for (const [key, identity] of memoryIdentities) if (identity.userId === userId) memoryIdentities.delete(key);
      },
      async getSession(id) {
        return memorySessions.get(id) || null;
      },
      async putSession(session) {
        memorySessions.set(session.id, session);
      },
      async deleteSession(id) {
        memorySessions.delete(id);
      },
      async deleteSessionsByUserId(userId) {
        for (const [key, session] of memorySessions) if (session.userId === userId) memorySessions.delete(key);
      },
      async getOAuthTransaction(state) {
        return memoryOAuthTransactions.get(state) || null;
      },
      async putOAuthTransaction(transaction) {
        memoryOAuthTransactions.set(transaction.state, transaction);
      },
      async deleteOAuthTransaction(state) {
        memoryOAuthTransactions.delete(state);
      },
      async getSetting(name) {
        return memorySettings.get(name) || null;
      },
      async putSetting(name, value) {
        if (value === null || value === undefined) memorySettings.delete(name);
        else memorySettings.set(name, value);
      },
      async deleteSetting(name) {
        memorySettings.delete(name);
      },
    };
  }
  return {
    async getUser(id) {
      return kv.get(`user:${id}`, "json");
    },
    async putUser(user, options = {}) {
      const expiresAt = Number(options.expiresAt);
      if (Number.isFinite(expiresAt)) {
        await kv.put(`user:${user.id}`, JSON.stringify(user), { expiration: Math.floor(expiresAt / 1000) });
      } else {
        await kv.put(`user:${user.id}`, JSON.stringify(user));
      }
    },
    async listUsers() {
      const users = [];
      let cursor;
      do {
        const page = await kv.list({ prefix: "user:", cursor });
        for (const key of page.keys) {
          const user = await kv.get(key.name, "json");
          if (user) users.push(user);
        }
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      return users;
    },
    async deleteUser(id) {
      await kv.delete(`user:${id}`);
    },
    async getAppState(userId) {
      return kv.get(`appstate:${userId}`, "json");
    },
    async putAppState(userId, record) {
      await kv.put(`appstate:${userId}`, JSON.stringify(record));
    },
    async deleteAppState(userId) {
      await kv.delete(`appstate:${userId}`);
    },
    async getIdentity(provider, providerUserId) {
      return kv.get(identityStorageKey(provider, providerUserId), "json");
    },
    async putIdentity(identity) {
      await kv.put(identityStorageKey(identity.provider, identity.providerUserId), JSON.stringify(identity));
    },
    async deleteIdentitiesByUserId(userId) {
      let cursor;
      do {
        const page = await kv.list({ prefix: "identity:", cursor });
        for (const key of page.keys) {
          const identity = await kv.get(key.name, "json");
          if (identity?.userId === userId) await kv.delete(key.name);
        }
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
    },
    async getSession(id) {
      return kv.get(`session:${id}`, "json");
    },
    async putSession(session) {
      const ttl = Math.max(60, Math.ceil((Number(session.expiresAt) - Date.now()) / 1000));
      await kv.put(`session:${session.id}`, JSON.stringify(session), { expirationTtl: ttl });
    },
    async deleteSession(id) {
      await kv.delete(`session:${id}`);
    },
    async deleteSessionsByUserId(userId) {
      let cursor;
      do {
        const page = await kv.list({ prefix: "session:", cursor });
        for (const key of page.keys) {
          const session = await kv.get(key.name, "json");
          if (session?.userId === userId) await kv.delete(key.name);
        }
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
    },
    async getOAuthTransaction(state) {
      return kv.get(`oauth:${state}`, "json");
    },
    async putOAuthTransaction(transaction) {
      await kv.put(`oauth:${transaction.state}`, JSON.stringify(transaction), { expirationTtl: 600 });
    },
    async deleteOAuthTransaction(state) {
      await kv.delete(`oauth:${state}`);
    },
    async getSetting(name) {
      return kv.get(`setting:${name}`, "json");
    },
    async putSetting(name, value, options = {}) {
      const key = `setting:${name}`;
      if (value === null || value === undefined) {
        await kv.delete(key);
        return;
      }
      const expiresAt = Number(options.expiresAt);
      if (Number.isFinite(expiresAt)) {
        await kv.put(key, JSON.stringify(value), { expiration: Math.floor(expiresAt / 1000) });
      } else {
        await kv.put(key, JSON.stringify(value));
      }
    },
    async deleteSetting(name) {
      await kv.delete(`setting:${name}`);
    },
  };
}

export function createLegalRetentionStore(kv) {
  if (!kv) return null;
  return {
    async put(record, retainedUntil) {
      const ttl = Math.max(60, Math.ceil((Number(retainedUntil) - Date.now()) / 1000));
      await kv.put(`legal:${record.id}`, JSON.stringify(record), { expirationTtl: ttl });
    },
  };
}
