import { createAiGoalPlan } from "./ai-goal-plan.mjs";
import { createCompanionReply } from "./ai-companion-chat.mjs";
import { createAiPlanRevision } from "./ai-plan-revision.mjs";

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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
        const result = await createAiGoalPlan(input, {
          apiKey: env.OPENAI_API_KEY,
          model: env.OPENAI_MODEL || "gpt-5.4-mini",
        });
        return json(result);
      } catch (error) {
        console.error("AI goal plan request failed", error);
        return json({ error: error.message || "AI 계획을 만들지 못했어요." }, error.status || 500);
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
};
