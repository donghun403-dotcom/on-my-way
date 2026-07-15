import test from "node:test";
import assert from "node:assert/strict";
import { fetchAiResponse } from "./ai-request.mjs";

test("AI 제공자가 응답하지 않으면 제한 시간 뒤 명시적인 504 오류를 반환한다", async () => {
  await assert.rejects(
    fetchAiResponse("https://example.test", {}, { fetchImpl: () => new Promise(() => {}), timeoutMs: 5 }),
    (error) => error.status === 504 && error.code === "AI_TIMEOUT",
  );
});

test("AI 제공자 네트워크 오류를 안전한 502 오류로 변환한다", async () => {
  await assert.rejects(
    fetchAiResponse("https://example.test", {}, { fetchImpl: async () => { throw new TypeError("secret network detail"); } }),
    (error) => error.status === 502 && error.code === "AI_NETWORK_ERROR" && !error.message.includes("secret"),
  );
});
