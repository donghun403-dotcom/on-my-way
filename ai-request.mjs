const DEFAULT_AI_TIMEOUT_MS = 45_000;

export async function fetchAiResponse(url, options, { fetchImpl = fetch, timeoutMs = DEFAULT_AI_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  let timeoutId;
  const timeoutError = new Error("AI 응답 시간이 초과됐어요. 잠시 후 다시 시도해 주세요.");
  timeoutError.status = 504;
  timeoutError.code = "AI_TIMEOUT";

  try {
    return await Promise.race([
      fetchImpl(url, { ...options, signal: controller.signal }),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          reject(timeoutError);
        }, Math.max(1, Number(timeoutMs) || DEFAULT_AI_TIMEOUT_MS));
      }),
    ]);
  } catch (error) {
    if (error === timeoutError || error?.name === "AbortError") throw timeoutError;
    if (error?.status) throw error;
    const networkError = new Error("AI 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
    networkError.status = 502;
    networkError.code = "AI_NETWORK_ERROR";
    throw networkError;
  } finally {
    clearTimeout(timeoutId);
  }
}
