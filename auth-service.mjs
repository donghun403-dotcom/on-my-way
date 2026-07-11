// On My Way 회원/인증 서비스 코어.
// Cloudflare Worker(worker.mjs)와 로컬 서버(serve-local.cjs)가 같은 로직을 공유한다.
// 카카오/네이버/구글 OAuth 키가 설정되면 실제 소셜 로그인으로, 없으면 데모 로그인 페이지로 동작한다.

const SESSION_COOKIE = "omw_session";
const STATE_COOKIE = "omw_oauth_state";
const SESSION_DAYS = 30;
const TRIAL_DURATION_MS = 24 * 60 * 60 * 1000;

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
  const body = base64UrlEncode(textEncoder.encode(JSON.stringify(payload)));
  const signature = await hmacSign(body, secret);
  return `v1.${body}.${signature}`;
}

export async function verifySessionToken(token, secret) {
  try {
    const [version, body, signature] = String(token || "").split(".");
    if (version !== "v1" || !body || !signature) return null;
    if (!(await hmacVerify(body, signature, secret))) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body)));
    if (!payload?.uid || Number(payload.exp || 0) < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function randomId(length = 24) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes).slice(0, length);
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
};

function providerConfig(env, provider) {
  const upper = provider.toUpperCase();
  const clientId = env[`${upper}_CLIENT_ID`] || "";
  const clientSecret = env[`${upper}_CLIENT_SECRET`] || "";
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
  const path = String(value || "/app.html");
  if (!path.startsWith("/") || path.startsWith("//")) return "/app.html";
  return path;
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
    plan: user.plan || "trial",
    trialStartedAt: user.trialStartedAt || null,
    trialExpiresAt: user.trialExpiresAt || null,
    proSince: user.proSince || null,
    subscriptionStatus: user.subscriptionStatus || null,
    currentPeriodEnd: user.currentPeriodEnd || null,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

async function upsertUserFromProfile(store, env, provider, profile) {
  const id = `${provider}:${profile.providerUserId}`;
  const now = Date.now();
  const existing = await store.getUser(id);
  const isAdminEmail = profile.email && adminEmails(env).includes(profile.email.toLowerCase());

  const user = existing || {
    id,
    provider,
    role: isAdminEmail ? "admin" : "member",
    roleSource: isAdminEmail ? "admin_email" : "default",
    plan: "trial",
    trialStartedAt: now,
    trialExpiresAt: now + TRIAL_DURATION_MS,
    createdAt: now,
  };

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

  await store.putUser(user);
  return user;
}

async function issueSession(ctx, user) {
  const token = await createSessionToken(
    { uid: user.id, role: user.role || "member", exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000 },
    sessionSecret(ctx.env),
  );
  return cookie(SESSION_COOKIE, token, { maxAgeSeconds: SESSION_DAYS * 24 * 60 * 60, secure: ctx.secure });
}

export async function currentSessionUser(ctx) {
  const token = ctx.getCookie(SESSION_COOKIE);
  if (!token) return null;
  const payload = await verifySessionToken(token, sessionSecret(ctx.env));
  if (!payload) return null;

  const user = await store(ctx).getUser(payload.uid);
  return user || null;
}

function store(ctx) {
  return ctx.store;
}

function devLoginAllowed(env) {
  return String(env.ALLOW_DEV_LOGIN || "").toLowerCase() === "true";
}

function demoBillingAllowed(env) {
  return String(env.ALLOW_DEMO_BILLING || "").toLowerCase() === "true";
}

function billingConfig(env) {
  const clientKey = String(env.TOSS_CLIENT_KEY || "");
  const secretKey = String(env.TOSS_SECRET_KEY || "");
  return { clientKey, secretKey, configured: Boolean(clientKey && secretKey) };
}

function addBillingMonth(value) {
  const date = new Date(Number(value) || Date.now());
  date.setMonth(date.getMonth() + 1);
  return date.getTime();
}

async function tossBillingRequest(env, path, { method = "POST", body } = {}) {
  const config = billingConfig(env);
  if (!config.configured) throw new Error("자동결제 환경 변수가 설정되지 않았습니다.");
  const response = await fetch(`https://api.tosspayments.com${path}`, {
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

async function chargeSubscription(env, user) {
  const orderId = `omw_${Date.now()}_${randomId(10)}`;
  return tossBillingRequest(env, `/v1/billing/${encodeURIComponent(user.billingKey)}`, {
    body: {
      customerKey: user.customerKey,
      amount: 2900,
      orderId,
      orderName: "On My Way PRO 월정액",
      customerEmail: user.email || undefined,
      customerName: user.name || undefined,
    },
  });
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

async function exchangeOAuthCode(env, provider, code, redirectUri, state) {
  const meta = PROVIDERS[provider];
  const { clientId, clientSecret } = providerConfig(env, provider);
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });
  if (provider === "naver") params.set("state", state);
  const tokenResponse = await fetch(meta.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) throw new Error(`${meta.label} 토큰 발급에 실패했어요.`);

  const profileResponse = await fetch(meta.profileUrl, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const profileData = await profileResponse.json();
  return meta.normalizeProfile(profileData);
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

  if (path === "/api/auth/start" && method === "GET") {
    const provider = String(url.searchParams.get("provider") || "");
    const redirect = safeRedirectPath(url.searchParams.get("redirect"));
    if (!PROVIDERS[provider]) return { status: 400, json: { error: "지원하지 않는 로그인 방식이에요." } };

    const config = providerConfig(ctx.env, provider);
    if (!config.configured) {
      if (!devLoginAllowed(ctx.env)) return { status: 503, json: { error: `${PROVIDERS[provider].label} 로그인이 아직 준비 중이에요.` } };
      return { status: 200, html: devLoginPage(provider, redirect) };
    }

    const state = `${randomId(20)}.${base64UrlEncode(textEncoder.encode(redirect))}`;
    const redirectUri = `${url.origin}/api/auth/callback/${provider}`;
    const authorize = new URL(PROVIDERS[provider].authorizeUrl);
    authorize.searchParams.set("client_id", config.clientId);
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("state", state);
    if (PROVIDERS[provider].scope) authorize.searchParams.set("scope", PROVIDERS[provider].scope);

    return {
      status: 302,
      redirect: authorize.toString(),
      cookies: [cookie(STATE_COOKIE, state, { maxAgeSeconds: 600, secure: ctx.secure })],
    };
  }

  const callbackMatch = path.match(/^\/api\/auth\/callback\/(kakao|naver|google)$/);
  if (callbackMatch && method === "GET") {
    const provider = callbackMatch[1];
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    const savedState = ctx.getCookie(STATE_COOKIE) || "";
    if (!code || !state || state !== savedState) {
      return { status: 302, redirect: "/app.html?auth=error", cookies: [cookie(STATE_COOKIE, "", { maxAgeSeconds: 0, secure: ctx.secure })] };
    }

    let redirect = "/app.html";
    try {
      redirect = safeRedirectPath(new TextDecoder().decode(base64UrlDecode(state.split(".")[1] || "")));
    } catch {
      redirect = "/app.html";
    }

    try {
      const redirectUri = `${url.origin}/api/auth/callback/${provider}`;
      const profile = await exchangeOAuthCode(ctx.env, provider, code, redirectUri, state);
      const user = await upsertUserFromProfile(store(ctx), ctx.env, provider, profile);
      return {
        status: 302,
        redirect: `${redirect}${redirect.includes("?") ? "&" : "?"}auth=success`,
        cookies: [await issueSession(ctx, user), cookie(STATE_COOKIE, "", { maxAgeSeconds: 0, secure: ctx.secure })],
      };
    } catch (error) {
      console.error(`${provider} OAuth callback failed`, error);
      return { status: 302, redirect: "/app.html?auth=error", cookies: [cookie(STATE_COOKIE, "", { maxAgeSeconds: 0, secure: ctx.secure })] };
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

  if (path === "/api/auth/me" && method === "GET") {
    const user = await currentSessionUser(ctx);
    return { status: 200, json: { user: publicUser(user) } };
  }

  if (path === "/api/auth/logout" && method === "POST") {
    return { status: 200, json: { ok: true }, cookies: [cookie(SESSION_COOKIE, "", { maxAgeSeconds: 0, secure: ctx.secure })] };
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
    return { status: 200, json: { configured: config.configured, clientKey: config.configured ? config.clientKey : null, customerKey, demo: demoBillingAllowed(ctx.env) } };
  }

  if (path === "/api/billing/activate" && method === "POST") {
    const user = await currentSessionUser(ctx);
    if (!user) return { status: 401, json: { error: "로그인 후 이용할 수 있어요." } };
    const body = await ctx.readJson();
    const authKey = String(body.authKey || "");
    const customerKey = String(body.customerKey || "");
    if (!authKey || !customerKey || customerKey !== user.customerKey) return { status: 400, json: { error: "자동결제 인증 정보가 올바르지 않습니다." } };
    if (user.subscriptionStatus === "active" && user.billingKey) return { status: 200, json: { user: publicUser(user), alreadyActive: true } };

    const issued = await tossBillingRequest(ctx.env, "/v1/billing/authorizations/issue", { body: { authKey, customerKey } });
    user.billingKey = issued.billingKey;
    user.subscriptionStatus = "pending";
    await store(ctx).putUser(user);

    try {
      const payment = await chargeSubscription(ctx.env, user);
      const now = Date.now();
      user.plan = "pro";
      user.proSince = user.proSince || now;
      user.subscriptionStatus = "active";
      user.currentPeriodEnd = addBillingMonth(now);
      user.lastPaymentKey = payment.paymentKey || null;
      user.lastOrderId = payment.orderId || null;
      user.lastPaymentAt = now;
      user.paymentFailure = null;
      await store(ctx).putUser(user);
      return { status: 200, json: { user: publicUser(user) } };
    } catch (error) {
      user.subscriptionStatus = "payment_failed";
      user.paymentFailure = { code: error.code || "BILLING_ERROR", at: Date.now() };
      await store(ctx).putUser(user);
      throw error;
    }
  }

  if (path === "/api/billing/cancel" && method === "POST") {
    const user = await currentSessionUser(ctx);
    if (!user) return { status: 401, json: { error: "로그인 후 이용할 수 있어요." } };
    if (user.billingKey && billingConfig(ctx.env).configured) {
      await tossBillingRequest(ctx.env, `/v1/billing/${encodeURIComponent(user.billingKey)}`, { method: "DELETE" }).catch(() => null);
    }
    user.billingKey = null;
    user.subscriptionStatus = "canceled";
    if (!user.currentPeriodEnd || Number(user.currentPeriodEnd) <= Date.now()) user.plan = "trial";
    await store(ctx).putUser(user);
    return { status: 200, json: { user: publicUser(user) } };
  }

  if (path === "/api/admin/users" && method === "GET") {
    const user = await currentSessionUser(ctx);
    if (user?.role !== "admin") return { status: 403, json: { error: "관리자만 볼 수 있어요." } };
    const users = await store(ctx).listUsers();
    users.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    return { status: 200, json: { users: users.map(publicUser) } };
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
    } else if (body.plan === "trial") {
      if (target.billingKey && billingConfig(ctx.env).configured) {
        await tossBillingRequest(ctx.env, `/v1/billing/${encodeURIComponent(target.billingKey)}`, { method: "DELETE" }).catch(() => null);
      }
      target.plan = "trial";
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

export async function renewDueSubscriptions({ env, store: userStore, now = Date.now() }) {
  const canCharge = billingConfig(env).configured;
  const users = await userStore.listUsers();
  let processed = 0;
  let renewed = 0;
  let failed = 0;
  for (const user of users) {
    if (user.subscriptionStatus === "canceled" && user.plan === "pro" && Number(user.currentPeriodEnd || 0) <= now) {
      user.plan = "trial";
      await userStore.putUser(user);
      processed += 1;
      continue;
    }
    if (!canCharge) continue;
    if (user.subscriptionStatus !== "active" || !user.billingKey || Number(user.currentPeriodEnd || 0) > now) continue;
    processed += 1;
    try {
      const payment = await chargeSubscription(env, user);
      user.plan = "pro";
      user.currentPeriodEnd = addBillingMonth(now);
      user.lastPaymentKey = payment.paymentKey || null;
      user.lastOrderId = payment.orderId || null;
      user.lastPaymentAt = now;
      user.paymentFailure = null;
      renewed += 1;
    } catch (error) {
      user.subscriptionStatus = "payment_failed";
      user.plan = "trial";
      user.paymentFailure = { code: error.code || "BILLING_ERROR", at: now };
      failed += 1;
    }
    await userStore.putUser(user);
  }
  return { processed, renewed, failed };
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
    };
  }
  return {
    async getUser(id) {
      return kv.get(`user:${id}`, "json");
    },
    async putUser(user) {
      await kv.put(`user:${user.id}`, JSON.stringify(user));
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
  };
}
