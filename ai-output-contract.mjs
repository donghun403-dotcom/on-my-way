export const AI_CONTRACT_VERSIONS = Object.freeze({
  goalPlanSchema: "goal-plan.v1",
  goalPlanPrompt: "goal-plan.prompt.v1",
  planRevisionSchema: "plan-revision.v1",
  planRevisionPrompt: "plan-revision.prompt.v1",
  domainOutput: "typed-plan.v1",
});

const ERROR_MESSAGES = Object.freeze({
  AI_PROVIDER_TIMEOUT: "AI 응답 시간이 초과되었어요. 잠시 후 다시 시도해 주세요.",
  AI_PROVIDER_RATE_LIMITED: "AI 요청이 잠시 많아요. 잠시 후 다시 시도해 주세요.",
  AI_PROVIDER_UNAVAILABLE: "AI 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
  AI_OUTPUT_INCOMPLETE_MAX_TOKENS: "AI가 계획 작성을 끝내지 못했어요. 기존 내용은 그대로 유지했어요.",
  AI_OUTPUT_INCOMPLETE_FILTER: "AI가 안전 기준 때문에 계획 작성을 완료하지 못했어요.",
  AI_OUTPUT_REFUSED: "AI가 이 요청에 대한 계획을 만들지 못했어요.",
  AI_OUTPUT_MESSAGE_MISSING: "AI 응답에서 계획을 확인하지 못했어요.",
  AI_OUTPUT_PARSE_FAILED: "AI 계획 응답을 해석하지 못했어요.",
  AI_OUTPUT_SCHEMA_INVALID: "AI 계획 응답 형식이 올바르지 않아요.",
  AI_OUTPUT_DOMAIN_INVALID: "AI 계획이 입력 조건을 충족하지 못했어요.",
});

const RETRYABLE_CODES = new Set([
  "AI_PROVIDER_TIMEOUT",
  "AI_PROVIDER_RATE_LIMITED",
  "AI_PROVIDER_UNAVAILABLE",
]);

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
  const contentTextLength = content.reduce(
    (total, item) => total + (item?.type === "output_text" && typeof item.text === "string" ? item.text.length : 0),
    0,
  );
  return {
    responseStatus: typeof responseBody?.status === "string" ? responseBody.status : "",
    incompleteReason: typeof responseBody?.incomplete_details?.reason === "string"
      ? responseBody.incomplete_details.reason
      : "",
    outputItemTypes: [...new Set(output.map((item) => String(item?.type || "unknown")))].slice(0, 12),
    contentItemTypes: [...new Set(content.map((item) => String(item?.type || "unknown")))].slice(0, 12),
    outputTokens: Number(responseBody?.usage?.output_tokens) || 0,
    outputTextLength: contentTextLength || (typeof responseBody?.output_text === "string" ? responseBody.output_text.length : 0),
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

  const schemaErrors = validateStructuredValue(value, schema);
  if (schemaErrors.length) {
    throw createAiContractError("AI_OUTPUT_SCHEMA_INVALID", {
      ...diagnostics,
      schemaErrorPath: schemaErrors[0].path,
      schemaErrorRule: schemaErrors[0].rule,
    });
  }

  const domainErrors = domainValidate(value) || [];
  if (domainErrors.length) {
    const firstDomainCode = typeof domainErrors[0] === "string" && /^[A-Z0-9_]{3,80}$/.test(domainErrors[0])
      ? domainErrors[0]
      : domainValidationCode;
    throw createAiContractError("AI_OUTPUT_DOMAIN_INVALID", {
      ...diagnostics,
      domainValidationCode: firstDomainCode,
      domainErrorCount: Math.min(domainErrors.length, 12),
    });
  }

  return { value, diagnostics };
}

export function providerHttpError(response, responseBody = {}) {
  const status = Number(response?.status) || 502;
  const code = status === 429
    ? "AI_PROVIDER_RATE_LIMITED"
    : "AI_PROVIDER_UNAVAILABLE";
  const error = createAiContractError(code, {
    responseStatus: `http_${status}`,
    incompleteReason: "",
    outputItemTypes: [],
    contentItemTypes: [],
    outputTokens: Number(responseBody?.usage?.output_tokens) || 0,
    outputTextLength: 0,
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
  model = "",
  latencyMs = 0,
} = {}) {
  const diagnostics = error?.diagnostics || {};
  return {
    correlationId,
    providerRequestId: String(error?.providerRequestId || "").slice(0, 160),
    errorCategory: error?.code || "AI_REQUEST_FAILED",
    responseStatus: String(diagnostics.responseStatus || ""),
    incompleteReason: String(diagnostics.incompleteReason || ""),
    model,
    outputItemTypes: Array.isArray(diagnostics.outputItemTypes) ? diagnostics.outputItemTypes : [],
    contentItemTypes: Array.isArray(diagnostics.contentItemTypes) ? diagnostics.contentItemTypes : [],
    outputTokens: Number(diagnostics.outputTokens) || 0,
    outputTextLength: Number(diagnostics.outputTextLength) || 0,
    schemaErrorPath: String(diagnostics.schemaErrorPath || ""),
    schemaErrorRule: String(diagnostics.schemaErrorRule || ""),
    domainValidationCode: String(diagnostics.domainValidationCode || ""),
    latencyMs: Math.max(0, Math.round(Number(latencyMs) || 0)),
    retryCount: Number(diagnostics.retryCount) || 0,
  };
}
