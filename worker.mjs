import { createAiGoalPlan } from "./ai-goal-plan.mjs";
import { createCompanionReply } from "./ai-companion-chat.mjs";
import { createAiPlanRevision } from "./ai-plan-revision.mjs";
import { handleAccountApi, parseCookies, createKvStore, currentSessionUser, renewDueSubscriptions } from "./auth-service.mjs";

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function accountResultToResponse(result) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  for (const value of result.cookies || []) headers.append("Set-Cookie", value);
  if (result.redirect) {
    headers.set("Location", result.redirect);
    return new Response(null, { status: result.status || 302, headers });
  }
  if (result.html) {
    headers.set("Content-Type", "text/html; charset=utf-8");
    return new Response(result.html, { status: result.status || 200, headers });
  }
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(result.json ?? {}), { status: result.status || 200, headers });
}

export async function createGoalPlanForUser({ input, env, userStore, user, generatePlan = createAiGoalPlan, now = Date.now() }) {
  const hasTrialLimit = user && user.role !== "admin" && user.plan !== "pro";
  if (hasTrialLimit && user.goalPlanGeneratedAt) {
    const error = new Error("무료 체험에서는 AI 목표 계획을 1개 만들 수 있어요. 기존 계획을 앱에서 이어가 주세요.");
    error.status = 409;
    error.code = "GOAL_PLAN_LIMIT_REACHED";
    throw error;
  }

  const result = await generatePlan(input, {
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL || "gpt-5.4-mini",
  });

  if (hasTrialLimit) {
    user.goalPlanGeneratedAt = now;
    await userStore.putUser(user);
  }
  return result;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cookies = parseCookies(request.headers.get("cookie"));
    const accountContext = {
      method: request.method,
      url,
      secure: url.protocol === "https:",
      getCookie: (name) => cookies[name],
      readJson: () => request.json().catch(() => ({})),
      env,
      store: createKvStore(env.USERS_KV),
    };

    if (url.pathname === "/admin.html" || url.pathname === "/admin") {
      if (!env.USERS_KV) return json({ error: "USERS_KV 바인딩이 필요합니다." }, 503);
      try {
        const user = await currentSessionUser(accountContext);
        if (user?.role !== "admin") {
          const location = user ? "/app.html?admin=denied" : "/app.html?auth=login&redirect=admin";
          return Response.redirect(new URL(location, url.origin), 302);
        }
        if (url.pathname === "/admin") return Response.redirect(new URL("/admin.html", url.origin), 302);
      } catch (error) {
        console.error("Admin access check failed", error);
        return json({ error: "관리자 접근을 확인하지 못했습니다." }, 500);
      }
    }

    if (url.pathname.startsWith("/api/auth/") || url.pathname.startsWith("/api/billing/") || url.pathname.startsWith("/api/admin/")) {
      if (!env.USERS_KV && url.pathname !== "/api/auth/providers") return json({ error: "회원 저장소 설정이 필요합니다." }, 503);
      try {
        if (url.pathname === "/api/admin/login" && request.method === "POST" && env.AI_RATE_LIMITER) {
          const actor = request.headers.get("cf-connecting-ip") || "anonymous";
          const { success } = await env.AI_RATE_LIMITER.limit({ key: `admin-login:${actor}` });
          if (!success) return json({ error: "로그인 시도가 잠시 많습니다. 1분 후 다시 시도해 주세요." }, 429);
        }
        const result = await handleAccountApi(accountContext);
        if (result) return accountResultToResponse(result);
        return json({ error: "요청을 처리할 수 없어요." }, 404);
      } catch (error) {
        console.error("Account API failed", error);
        return json({ error: "요청 처리 중 문제가 생겼어요." }, 500);
      }
    }

    if (url.pathname === "/api/ai/goal-plan") {
      if (request.method !== "POST") return json({ error: "POST 요청만 사용할 수 있어요." }, 405);

      if (env.AI_RATE_LIMITER) {
        const actor = request.headers.get("cf-connecting-ip") || "anonymous";
        const { success } = await env.AI_RATE_LIMITER.limit({ key: `goal-plan:${actor}` });
        if (!success) return json({ error: "AI 요청이 잠시 많아요. 1분 후 다시 시도해 주세요." }, 429);
      }

      const contentLength = Number(request.headers.get("content-length") || 0);
      if (contentLength > 50000) return json({ error: "요청 내용이 너무 커요." }, 413);

      try {
        const input = await request.json();
        const userStore = createKvStore(env.USERS_KV);
        const user = await currentSessionUser({ ...accountContext, store: userStore });
        const result = await createGoalPlanForUser({ input, env, userStore, user });
        return json(result);
      } catch (error) {
        console.error("AI goal plan request failed", error);
        const message = error.status === 503 ? "올리가 계획을 준비하는 동안 연결이 지연되고 있어요." : error.message || "AI 계획을 만들지 못했어요.";
        return json({ error: message, code: error.code || undefined }, error.status || 500);
      }
    }

    if (url.pathname === "/api/ai/companion-chat") {
      if (request.method !== "POST") return json({ error: "POST 요청만 사용할 수 있어요." }, 405);

      if (env.AI_RATE_LIMITER) {
        const actor = request.headers.get("cf-connecting-ip") || "anonymous";
        const { success } = await env.AI_RATE_LIMITER.limit({ key: `companion-chat:${actor}` });
        if (!success) return json({ error: "올리가 잠시 바빠요. 1분 후 다시 말 걸어주세요." }, 429);
      }

      const contentLength = Number(request.headers.get("content-length") || 0);
      if (contentLength > 5000) return json({ error: "메시지가 너무 길어요." }, 413);

      try {
        const input = await request.json();
        const result = await createCompanionReply(input, {
          apiKey: env.OPENAI_API_KEY,
          model: env.OPENAI_MODEL || "gpt-5.4-mini",
        });
        return json(result);
      } catch (error) {
        console.error("Companion chat request failed", error);
        return json({ error: error.message || "올리의 답을 만들지 못했어요." }, error.status || 500);
      }
    }

    if (url.pathname === "/api/ai/plan-revision") {
      if (request.method !== "POST") return json({ error: "POST 요청만 사용할 수 있어요." }, 405);

      if (env.AI_RATE_LIMITER) {
        const actor = request.headers.get("cf-connecting-ip") || "anonymous";
        const { success } = await env.AI_RATE_LIMITER.limit({ key: `plan-revision:${actor}` });
        if (!success) return json({ error: "AI 수정 요청이 잠시 많아요. 1분 후 다시 시도해 주세요." }, 429);
      }

      const contentLength = Number(request.headers.get("content-length") || 0);
      if (contentLength > 20000) return json({ error: "수정 요청 내용이 너무 커요." }, 413);

      try {
        const input = await request.json();
        const result = await createAiPlanRevision(input, {
          apiKey: env.OPENAI_API_KEY,
          model: env.OPENAI_MODEL || "gpt-5.4-mini",
        });
        return json(result);
      } catch (error) {
        console.error("AI plan revision request failed", error);
        return json({ error: error.message || "AI 변경안을 만들지 못했어요." }, error.status || 500);
      }
    }

    return env.ASSETS.fetch(request);
  },
  async scheduled(_controller, env, ctx) {
    if (!env.USERS_KV) return;
    ctx.waitUntil(
      renewDueSubscriptions({ env, store: createKvStore(env.USERS_KV) }).then((result) => console.log("Subscription renewal completed", result)),
    );
  },
};
