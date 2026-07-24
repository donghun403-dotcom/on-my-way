export const AI_CONTRACT_VERSIONS = Object.freeze({
  goalPlanSchema: "goal-plan-blueprint.v3",
  goalPlanPrompt: "goal-plan.prompt.v3",
  planRevisionSchema: "plan-revision-blueprint.v3",
  planRevisionPrompt: "plan-revision.prompt.v3",
  domainOutput: "typed-plan.v2",
});

const ERROR_MESSAGES = Object.freeze({
  AI_PROVIDER_TIMEOUT: "AI 응답 시간이 초과되었어요. 잠시 후 다시 시도해 주세요.",
  AI_PROVIDER_RATE_LIMITED: "AI 요청이 잠시 많아요. 잠시 후 다시 시도해 주세요.",
  AI_PROVIDER_UNAVAILABLE: "AI 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
  AI_OUTPUT_INCOMPLETE_MAX_TOKENS: "계획을 완성하지 못했어요. 입력 내용은 그대로 보관했어요.",
  AI_OUTPUT_INCOMPLETE_FILTER: "AI가 안전 기준 때문에 계획 작성을 완료하지 못했어요.",
  AI_OUTPUT_REFUSED: "AI가 이 요청에 대한 계획을 만들지 못했어요.",
  AI_OUTPUT_MESSAGE_MISSING: "AI 응답에서 계획을 확인하지 못했어요.",
  AI_OUTPUT_PARSE_FAILED: "AI 계획 응답을 해석하지 못했어요.",
  AI_OUTPUT_SCHEMA_INVALID: "AI 계획 응답 형식이 올바르지 않아요.",
  AI_OUTPUT_DOMAIN_INVALID: "계획을 완성하지 못했어요. 적어둔 내용은 그대로 보관했어요.",
});

const RETRYABLE_CODES = new Set([
  "AI_PROVIDER_TIMEOUT",
  "AI_PROVIDER_RATE_LIMITED",
  "AI_PROVIDER_UNAVAILABLE",
]);

const SAFE_EVENT_LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const SAFE_DOMAIN_RULE_ID = /^[A-Z][A-Z0-9_]{2,79}$/;
const SAFE_VALIDATION_RESULTS = new Set(["pass", "fail", "not_run", "unknown"]);

function safeEventLabel(value) {
  const label = typeof value === "string" ? value.trim() : "";
  return SAFE_EVENT_LABEL.test(label) ? label : "";
}

function safeValidationResult(value) {
  const result = typeof value === "string" ? value : "";
  return SAFE_VALIDATION_RESULTS.has(result) ? result : "unknown";
}

function safeDomainRuleIds(values, fallback = "") {
  const candidates = Array.isArray(values) ? values : [];
  const ids = candidates
    .map((value) => {
      if (typeof value === "string") return value;
      if (value && typeof value === "object") return value.ruleId || value.code || "";
      return "";
    })
    .filter((value) => typeof value === "string" && SAFE_DOMAIN_RULE_ID.test(value));
  if (!ids.length && SAFE_DOMAIN_RULE_ID.test(fallback)) ids.push(fallback);
  return [...new Set(ids)].slice(0, 12);
}

function safeUsageMetrics(usage) {
  const inputTokens = Number.isFinite(usage?.input_tokens) ? usage.input_tokens : null;
  const cachedInputTokens = Number.isFinite(usage?.input_tokens_details?.cached_tokens)
    ? usage.input_tokens_details.cached_tokens
    : (Number.isFinite(usage?.cached_input_tokens) ? usage.cached_input_tokens : null);
  const outputTokens = Number.isFinite(usage?.output_tokens) ? usage.output_tokens : null;
  const reasoningTokens = Number.isFinite(usage?.output_tokens_details?.reasoning_tokens)
    ? usage.output_tokens_details.reasoning_tokens
    : null;
  return { inputTokens, cachedInputTokens, outputTokens, reasoningTokens };
}

function measuredUtf8Bytes(value) {
  if (typeof value !== "string") return 0;
  return new TextEncoder().encode(value).byteLength;
}

function outputHeadroomPercent(outputTokens, maxOutputTokens) {
  if (!Number.isFinite(outputTokens) || !Number.isFinite(maxOutputTokens) || maxOutputTokens <= 0) {
    return "unknown";
  }
  const percent = Math.max(0, Math.min(100, ((maxOutputTokens - outputTokens) / maxOutputTokens) * 100));
  return Math.round(percent * 100) / 100;
}

function schemaPathShape(value) {
  if (typeof value !== "string" || !value.startsWith("$")) return "";
  const segments = value.split("/");
  return segments
    .map((segment, index) => {
      if (index === 0) return "$";
      return /^\d+$/.test(segment) ? segment : "*";
    })
    .join("/");
}

export function createAiContractError(code, diagnostics = {}, message = "") {
  const error = new Error(message || ERROR_MESSAGES[code] || "AI 요청을 처리하지 못했어요.");
  error.status = code === "AI_PROVIDER_TIMEOUT" ? 504 : 502;
  error.code = code;
  error.retryable = RETRYABLE_CODES.has(code);
  error.diagnostics = diagnostics;
  error.providerCalled = true;
  return error;
}

function responseDiagnostics(responseBody) {
  const output = Array.isArray(responseBody?.output) ? responseBody.output : [];
  const content = output.flatMap((item) => (Array.isArray(item?.content) ? item.content : []));
  const usage = safeUsageMetrics(responseBody?.usage);
  const contentTextLength = content.reduce(
    (total, item) => total + (item?.type === "output_text" && typeof item.text === "string" ? item.text.length : 0),
    0,
  );
  const contentTextBytes = content.reduce(
    (total, item) => total + (item?.type === "output_text" ? measuredUtf8Bytes(item.text) : 0),
    0,
  );
  const fallbackOutputText = typeof responseBody?.output_text === "string" ? responseBody.output_text : "";
  return {
    responseStatus: typeof responseBody?.status === "string" ? responseBody.status : "",
    incompleteReason: typeof responseBody?.incomplete_details?.reason === "string"
      ? responseBody.incomplete_details.reason
      : "",
    outputItemTypes: [...new Set(output.map((item) => String(item?.type || "unknown")))].slice(0, 12),
    contentItemTypes: [...new Set(content.map((item) => String(item?.type || "unknown")))].slice(0, 12),
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens,
    outputTextLength: contentTextLength || fallbackOutputText.length,
    outputBytes: contentTextBytes || measuredUtf8Bytes(fallbackOutputText),
    schemaResult: "not_run",
    domainResult: "not_run",
    domainRuleIds: [],
    retryCount: 0,
  };
}

function typeMatches(value, type) {
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "null") return value === null;
  return typeof value === type;
}

function validateSchemaNode(value, schema, path, errors) {
  if (!schema || typeof schema !== "object" || errors.length >= 12) return;
  if (Array.isArray(schema.anyOf)) {
    const valid = schema.anyOf.some((candidate) => {
      const candidateErrors = [];
      validateSchemaNode(value, candidate, path, candidateErrors);
      return candidateErrors.length === 0;
    });
    if (!valid) errors.push({ path, rule: "anyOf" });
    return;
  }

  if (schema.type && !typeMatches(value, schema.type)) {
    errors.push({ path, rule: "type" });
    return;
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) errors.push({ path, rule: "enum" });

  if (typeof value === "string") {
    if (Number.isFinite(schema.minLength) && value.length < schema.minLength) errors.push({ path, rule: "minLength" });
    if (Number.isFinite(schema.maxLength) && value.length > schema.maxLength) errors.push({ path, rule: "maxLength" });
    if (schema.pattern) {
      try {
        if (!new RegExp(schema.pattern).test(value)) errors.push({ path, rule: "pattern" });
      } catch {
        errors.push({ path, rule: "schema_pattern" });
      }
    }
    if (schema.format === "date-time" && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
      errors.push({ path, rule: "format" });
    }
  }

  if (typeof value === "number") {
    if (Number.isFinite(schema.minimum) && value < schema.minimum) errors.push({ path, rule: "minimum" });
    if (Number.isFinite(schema.maximum) && value > schema.maximum) errors.push({ path, rule: "maximum" });
  }

  if (Array.isArray(value)) {
    if (Number.isFinite(schema.minItems) && value.length < schema.minItems) errors.push({ path, rule: "minItems" });
    if (Number.isFinite(schema.maxItems) && value.length > schema.maxItems) errors.push({ path, rule: "maxItems" });
    value.forEach((item, index) => validateSchemaNode(item, schema.items, `${path}/${index}`, errors));
    return;
  }

  if (value !== null && typeof value === "object") {
    const properties = schema.properties || {};
    for (const required of schema.required || []) {
      if (!Object.hasOwn(value, required)) errors.push({ path: `${path}/${required}`, rule: "required" });
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) errors.push({ path: `${path}/${key}`, rule: "additionalProperties" });
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) validateSchemaNode(value[key], childSchema, `${path}/${key}`, errors);
    }
  }
}

export function validateStructuredValue(value, schema) {
  const errors = [];
  validateSchemaNode(value, schema, "$", errors);
  return errors.slice(0, 12);
}

function parsedCandidates(responseBody, messageItems) {
  const candidates = [];
  if (responseBody?.output_parsed !== undefined && responseBody.output_parsed !== null) {
    candidates.push(responseBody.output_parsed);
  }
  for (const item of messageItems) {
    for (const content of item.content || []) {
      if (content?.parsed !== undefined && content.parsed !== null) candidates.push(content.parsed);
    }
  }
  return candidates;
}

function textCandidates(responseBody, messageItems) {
  const candidates = [];
  for (const item of messageItems) {
    for (const content of item.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") candidates.push(content.text);
    }
  }
  // Kept only for direct REST/legacy fixture compatibility. Production parsing never
  // strips fences or extracts JSON substrings.
  if (typeof responseBody?.output_text === "string") candidates.push(responseBody.output_text);
  return candidates;
}

export function parseStructuredResponse(responseBody, {
  schema,
  domainValidate = () => [],
  domainValidationCode = "DOMAIN_VALIDATION_FAILED",
  maxParsedBytes = 0,
  countItems = () => 0,
} = {}) {
  const diagnostics = responseDiagnostics(responseBody);
  const status = diagnostics.responseStatus;
  if (status === "incomplete") {
    if (diagnostics.incompleteReason === "max_output_tokens") {
      throw createAiContractError("AI_OUTPUT_INCOMPLETE_MAX_TOKENS", diagnostics);
    }
    if (diagnostics.incompleteReason === "content_filter") {
      throw createAiContractError("AI_OUTPUT_INCOMPLETE_FILTER", diagnostics);
    }
    throw createAiContractError("AI_OUTPUT_MESSAGE_MISSING", diagnostics);
  }
  if (status && status !== "completed") {
    throw createAiContractError("AI_PROVIDER_UNAVAILABLE", diagnostics);
  }

  const output = Array.isArray(responseBody?.output) ? responseBody.output : [];
  const messages = output.filter((item) => item?.type === "message");
  const hasTopLevelParsed = responseBody?.output_parsed !== undefined && responseBody.output_parsed !== null;
  const hasLegacyText = typeof responseBody?.output_text === "string";
  if (!messages.length && !hasTopLevelParsed && !hasLegacyText) {
    throw createAiContractError("AI_OUTPUT_MESSAGE_MISSING", diagnostics);
  }

  const refusals = messages.flatMap((item) => item.content || []).filter((content) => content?.type === "refusal");
  if (refusals.length) throw createAiContractError("AI_OUTPUT_REFUSED", diagnostics);

  const parsed = parsedCandidates(responseBody, messages);
  let value;
  if (parsed.length) {
    value = parsed[0];
  } else {
    const texts = textCandidates(responseBody, messages);
    if (!texts.length) throw createAiContractError("AI_OUTPUT_MESSAGE_MISSING", diagnostics);
    const outputText = texts[0];
    diagnostics.outputTextLength = outputText.length;
    try {
      value = JSON.parse(outputText);
    } catch {
      throw createAiContractError("AI_OUTPUT_PARSE_FAILED", diagnostics);
    }
  }

  let parsedPayloadBytes = 0;
  try {
    parsedPayloadBytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    throw createAiContractError("AI_OUTPUT_PARSE_FAILED", diagnostics);
  }
  diagnostics.parsedPayloadBytes = parsedPayloadBytes;
  if (!diagnostics.outputBytes) diagnostics.outputBytes = parsedPayloadBytes;
  diagnostics.parsedItemCount = Math.max(0, Number(countItems(value)) || 0);
  if (Number.isFinite(maxParsedBytes) && maxParsedBytes > 0 && parsedPayloadBytes > maxParsedBytes) {
    throw createAiContractError("AI_OUTPUT_DOMAIN_INVALID", {
      ...diagnostics,
      schemaResult: "not_run",
      domainResult: "fail",
      domainValidationCode: "AI_OUTPUT_PAYLOAD_TOO_LARGE",
      domainRuleIds: ["AI_OUTPUT_PAYLOAD_TOO_LARGE"],
      domainErrorCount: 1,
    });
  }

  const schemaErrors = validateStructuredValue(value, schema);
  if (schemaErrors.length) {
    throw createAiContractError("AI_OUTPUT_SCHEMA_INVALID", {
      ...diagnostics,
      schemaResult: "fail",
      domainResult: "not_run",
      schemaErrorPath: schemaErrors[0].path,
      schemaErrorRule: schemaErrors[0].rule,
    });
  }

  diagnostics.schemaResult = "pass";
  const domainErrors = domainValidate(value) || [];
  if (domainErrors.length) {
    const ruleIds = safeDomainRuleIds(domainErrors, domainValidationCode);
    const firstDomainCode = ruleIds[0] || domainValidationCode;
    throw createAiContractError("AI_OUTPUT_DOMAIN_INVALID", {
      ...diagnostics,
      domainResult: "fail",
      domainValidationCode: firstDomainCode,
      domainRuleIds: ruleIds,
      domainErrorCount: Math.min(domainErrors.length, 12),
    });
  }

  diagnostics.domainResult = "pass";
  return { value, diagnostics };
}

export function providerHttpError(response, responseBody = {}) {
  const status = Number(response?.status) || 502;
  const code = status === 429
    ? "AI_PROVIDER_RATE_LIMITED"
    : "AI_PROVIDER_UNAVAILABLE";
  const usage = safeUsageMetrics(responseBody?.usage);
  const error = createAiContractError(code, {
    responseStatus: `http_${status}`,
    incompleteReason: "",
    outputItemTypes: [],
    contentItemTypes: [],
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens,
    outputTextLength: 0,
    outputBytes: 0,
    schemaResult: "not_run",
    domainResult: "not_run",
    domainRuleIds: [],
    retryCount: 0,
  });
  error.providerUsage = responseBody?.usage || null;
  error.providerRequestId = response?.headers?.get?.("x-request-id") || "";
  return error;
}

export function attachProviderContext(error, { responseBody = {}, requestId = "" } = {}) {
  error.providerUsage = responseBody?.usage || error.providerUsage || null;
  error.providerRequestId = requestId || error.providerRequestId || "";
  error.providerCalled = true;
  return error;
}

export function safeAiDiagnostics(error, {
  correlationId = "",
  environment = "",
  model = "",
  operation = "",
  latencyMs = 0,
  maxOutputTokens = 0,
  cached,
  providerCalled,
  retryCount,
} = {}) {
  const diagnostics = error?.diagnostics || {};
  const usage = safeUsageMetrics(error?.providerUsage);
  const metric = (value) => (Number.isFinite(value) ? value : "unknown");
  const configuredMaxOutputTokens = Number(maxOutputTokens) || 0;
  const inputTokens = Number.isFinite(diagnostics.inputTokens) ? diagnostics.inputTokens : usage.inputTokens;
  const cachedInputTokens = Number.isFinite(diagnostics.cachedInputTokens)
    ? diagnostics.cachedInputTokens
    : usage.cachedInputTokens;
  const outputTokens = Number.isFinite(diagnostics.outputTokens) ? diagnostics.outputTokens : usage.outputTokens;
  const reasoningTokens = Number.isFinite(diagnostics.reasoningTokens)
    ? diagnostics.reasoningTokens
    : usage.reasoningTokens;
  const ruleIds = safeDomainRuleIds(
    diagnostics.domainRuleIds,
    SAFE_DOMAIN_RULE_ID.test(diagnostics.domainValidationCode) ? diagnostics.domainValidationCode : "",
  );
  const cachedResult = typeof cached === "boolean" ? cached : Boolean(error?.cached);
  const providerCalledResult = typeof providerCalled === "boolean"
    ? providerCalled
    : Boolean(error?.providerCalled);
  return {
    correlationId: safeEventLabel(correlationId),
    providerRequestId: safeEventLabel(error?.providerRequestId),
    environment: safeEventLabel(environment),
    operation: safeEventLabel(operation),
    errorCategory: safeEventLabel(error?.code) || "AI_REQUEST_FAILED",
    responseStatus: safeEventLabel(diagnostics.responseStatus),
    incompleteReason: safeEventLabel(diagnostics.incompleteReason),
    model: safeEventLabel(model),
    configuredMaxOutputTokens,
    maxOutputTokens: configuredMaxOutputTokens,
    outputItemTypes: Array.isArray(diagnostics.outputItemTypes)
      ? diagnostics.outputItemTypes.map(safeEventLabel).filter(Boolean).slice(0, 12)
      : [],
    contentItemTypes: Array.isArray(diagnostics.contentItemTypes)
      ? diagnostics.contentItemTypes.map(safeEventLabel).filter(Boolean).slice(0, 12)
      : [],
    inputTokens: metric(inputTokens),
    cachedInputTokens: metric(cachedInputTokens),
    outputTokens: metric(outputTokens),
    reasoningTokens: metric(reasoningTokens),
    headroomPercent: outputHeadroomPercent(outputTokens, configuredMaxOutputTokens),
    outputTextLength: metric(diagnostics.outputTextLength),
    outputBytes: metric(diagnostics.outputBytes),
    parsedPayloadBytes: metric(diagnostics.parsedPayloadBytes),
    parsedItemCount: metric(diagnostics.parsedItemCount),
    schemaResult: safeValidationResult(diagnostics.schemaResult),
    domainResult: safeValidationResult(diagnostics.domainResult),
    schemaErrorPath: schemaPathShape(diagnostics.schemaErrorPath),
    schemaErrorRule: safeEventLabel(diagnostics.schemaErrorRule),
    domainValidationCode: ruleIds[0] || "",
    domainRuleIds: ruleIds,
    latencyMs: Math.max(0, Math.round(Number(latencyMs) || 0)),
    cached: cachedResult,
    providerCalled: providerCalledResult,
    retryCount: Number.isFinite(retryCount) ? retryCount : (Number(diagnostics.retryCount) || 0),
  };
}

export function safeAiSuccessDiagnostics(result, {
  correlationId = "",
  environment = "",
  model = "",
  operation = "",
  latencyMs = 0,
  maxOutputTokens,
  cached,
  providerCalled,
  retryCount,
} = {}) {
  const diagnostics = result?.diagnostics || {};
  const usage = safeUsageMetrics(result?.usage);
  const metric = (value) => (Number.isFinite(value) ? value : "unknown");
  const configuredMaxOutputTokens = Number.isFinite(maxOutputTokens)
    ? Number(maxOutputTokens)
    : (Number(result?.contract?.maxOutputTokens) || 0);
  const inputTokens = Number.isFinite(diagnostics.inputTokens) ? diagnostics.inputTokens : usage.inputTokens;
  const cachedInputTokens = Number.isFinite(diagnostics.cachedInputTokens)
    ? diagnostics.cachedInputTokens
    : usage.cachedInputTokens;
  const outputTokens = Number.isFinite(diagnostics.outputTokens) ? diagnostics.outputTokens : usage.outputTokens;
  const reasoningTokens = Number.isFinite(diagnostics.reasoningTokens)
    ? diagnostics.reasoningTokens
    : usage.reasoningTokens;
  const ruleIds = safeDomainRuleIds(
    diagnostics.domainRuleIds,
    SAFE_DOMAIN_RULE_ID.test(diagnostics.domainValidationCode) ? diagnostics.domainValidationCode : "",
  );
  const cachedResult = typeof cached === "boolean" ? cached : Boolean(result?.cached);
  const providerCalledResult = typeof providerCalled === "boolean"
    ? providerCalled
    : (typeof result?.providerCalled === "boolean" ? result.providerCalled : !cachedResult);
  return {
    correlationId: safeEventLabel(correlationId),
    providerRequestId: safeEventLabel(result?.requestId),
    environment: safeEventLabel(environment),
    operation: safeEventLabel(operation),
    errorCategory: "",
    responseStatus: safeEventLabel(diagnostics.responseStatus || "completed"),
    incompleteReason: safeEventLabel(diagnostics.incompleteReason),
    model: safeEventLabel(model),
    configuredMaxOutputTokens,
    maxOutputTokens: configuredMaxOutputTokens,
    inputTokens: metric(inputTokens),
    cachedInputTokens: metric(cachedInputTokens),
    outputTokens: metric(outputTokens),
    reasoningTokens: metric(reasoningTokens),
    headroomPercent: outputHeadroomPercent(outputTokens, configuredMaxOutputTokens),
    outputTextLength: metric(diagnostics.outputTextLength),
    outputBytes: metric(diagnostics.outputBytes),
    parsedPayloadBytes: metric(diagnostics.parsedPayloadBytes),
    parsedItemCount: metric(diagnostics.parsedItemCount),
    schemaResult: safeValidationResult(diagnostics.schemaResult),
    domainResult: safeValidationResult(diagnostics.domainResult),
    domainValidationCode: ruleIds[0] || "",
    domainRuleIds: ruleIds,
    latencyMs: Math.max(0, Math.round(Number(latencyMs) || 0)),
    cached: cachedResult,
    providerCalled: providerCalledResult,
    retryCount: Number.isFinite(retryCount) ? retryCount : (Number(diagnostics.retryCount) || 0),
  };
}
