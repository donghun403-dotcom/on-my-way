import test from "node:test";
import assert from "node:assert/strict";

import {
  parseStructuredResponse,
  providerHttpError,
  safeAiDiagnostics,
  safeAiSuccessDiagnostics,
  validateStructuredValue,
} from "./ai-output-contract.mjs";
import { PLAN_REVISION_SCHEMA } from "./ai-plan-revision.mjs";

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "durationMinutes"],
  properties: {
    name: { type: "string" },
    durationMinutes: { type: "integer", minimum: 5, maximum: 180 },
  },
};

function message(content) {
  return {
    status: "completed",
    output: [{ type: "message", role: "assistant", content }],
    usage: {
      input_tokens: 123,
      input_tokens_details: { cached_tokens: 45 },
      output_tokens: 27,
      output_tokens_details: { reasoning_tokens: 3 },
    },
  };
}

function parsedContent(value) {
  return [{ type: "output_text", text: "{not-used", parsed: value }];
}

function textContent(value) {
  return [{ type: "output_text", text: JSON.stringify(value) }];
}

function assertStrictObjectSchemas(node, path = "$") {
  if (!node || typeof node !== "object") return;
  if (node.type === "object") {
    assert.equal(node.additionalProperties, false, `${path} must reject additional properties`);
    assert.deepEqual(
      [...(node.required || [])].sort(),
      Object.keys(node.properties || {}).sort(),
      `${path} must require every declared property`,
    );
  }
  if (node.properties) {
    for (const [key, child] of Object.entries(node.properties)) assertStrictObjectSchemas(child, `${path}/${key}`);
  }
  if (node.items) assertStrictObjectSchemas(node.items, `${path}/*`);
  for (const [index, child] of (node.anyOf || []).entries()) assertStrictObjectSchemas(child, `${path}/anyOf/${index}`);
}

/* 생성(goal-plan) 스키마도 함께 검사했지만, 게스트 AI 라우트가 사라지면서 생성 경로가
   없어졌다. 남은 revision 스키마만 본다. */
test("revision schema keeps strict required object contracts", () => {
  assertStrictObjectSchemas(PLAN_REVISION_SCHEMA);
});

test("parsed structured output is used without reparsing text", () => {
  const value = { name: "첫 행동", durationMinutes: 20 };
  const result = parseStructuredResponse(message(parsedContent(value)), { schema });
  assert.deepEqual(result.value, value);
});

test("a non-message prefix does not hide the later message", () => {
  const value = { name: "첫 행동", durationMinutes: 20 };
  const response = message(textContent(value));
  response.output.unshift({ type: "reasoning", summary: [] });
  assert.deepEqual(parseStructuredResponse(response, { schema }).value, value);
});

for (const [reason, code] of [
  ["max_output_tokens", "AI_OUTPUT_INCOMPLETE_MAX_TOKENS"],
  ["content_filter", "AI_OUTPUT_INCOMPLETE_FILTER"],
]) {
  test(`incomplete ${reason} is classified before JSON parsing`, () => {
    assert.throws(
      () => parseStructuredResponse({
        status: "incomplete",
        incomplete_details: { reason },
        output: [{ type: "message", content: [{ type: "output_text", text: '{"partial":' }] }],
      }, { schema }),
      (error) => error.code === code && error.diagnostics.incompleteReason === reason,
    );
  });
}

test("refusal is classified without attempting to parse it", () => {
  assert.throws(
    () => parseStructuredResponse(message([{ type: "refusal", refusal: "not logged" }]), { schema }),
    (error) => error.code === "AI_OUTPUT_REFUSED",
  );
});

for (const [name, response] of [
  ["message missing", { status: "completed", output: [{ type: "reasoning" }] }],
  ["message content missing", { status: "completed", output: [{ type: "message" }] }],
  ["parsed and text missing", message([{ type: "output_text" }])],
]) {
  test(name, () => {
    assert.throws(
      () => parseStructuredResponse(response, { schema }),
      (error) => error.code === "AI_OUTPUT_MESSAGE_MISSING",
    );
  });
}

test("malformed legacy output_text is a parse failure without fence or substring recovery", () => {
  assert.throws(
    () => parseStructuredResponse({ status: "completed", output_text: "```json\n{\"name\":\"x\"}\n```" }, { schema }),
    (error) => error.code === "AI_OUTPUT_PARSE_FAILED",
  );
});

test("schema and domain failures remain distinct", () => {
  assert.throws(
    () => parseStructuredResponse(message(textContent({ name: "첫 행동" })), { schema }),
    (error) => (
      error.code === "AI_OUTPUT_SCHEMA_INVALID"
      && error.diagnostics.schemaErrorPath === "$/durationMinutes"
    ),
  );
  assert.throws(
    () => parseStructuredResponse(message(textContent({ name: "오답 정리", durationMinutes: 20 })), {
      schema,
      domainValidate: () => ["GOAL_FIELD_MISMATCH"],
    }),
    (error) => (
      error.code === "AI_OUTPUT_DOMAIN_INVALID"
      && error.diagnostics.domainValidationCode === "GOAL_FIELD_MISMATCH"
    ),
  );
});

test("local structured validator enforces string bounds used by compact contracts", () => {
  const bounded = {
    type: "object",
    additionalProperties: false,
    required: ["name"],
    properties: { name: { type: "string", minLength: 2, maxLength: 4 } },
  };
  assert.equal(validateStructuredValue({ name: "가" }, bounded)[0].rule, "minLength");
  assert.equal(validateStructuredValue({ name: "가나다라마" }, bounded)[0].rule, "maxLength");
  assert.deepEqual(validateStructuredValue({ name: "가나다" }, bounded), []);
});

for (const [status, code] of [
  [429, "AI_PROVIDER_RATE_LIMITED"],
  [500, "AI_PROVIDER_UNAVAILABLE"],
]) {
  test(`HTTP ${status} maps to ${code} without provider response text`, () => {
    const response = new Response(JSON.stringify({ error: { message: "raw provider detail" } }), {
      status,
      headers: { "x-request-id": "req_fixture" },
    });
    const error = providerHttpError(response, { error: { message: "raw provider detail" } });
    assert.equal(error.code, code);
    assert.equal(error.retryable, true);
    assert.equal(error.message.includes("raw provider detail"), false);
  });
}

test("safe diagnostics include metadata but exclude raw input and response fields", () => {
  const response = message([{ type: "output_text", text: "{broken" }]);
  let caught;
  try {
    parseStructuredResponse(response, { schema });
  } catch (error) {
    caught = error;
  }
  caught.providerRequestId = "req_fixture";
  const diagnostics = safeAiDiagnostics(caught, {
    correlationId: "correlation-fixture",
    environment: "staging",
    model: "gpt-fixture",
    operation: "goal_generation",
    latencyMs: 123.4,
    maxOutputTokens: 100,
  });
  assert.equal(diagnostics.errorCategory, "AI_OUTPUT_PARSE_FAILED");
  assert.equal(diagnostics.environment, "staging");
  assert.equal(diagnostics.operation, "goal_generation");
  assert.equal(diagnostics.configuredMaxOutputTokens, 100);
  assert.equal(diagnostics.inputTokens, 123);
  assert.equal(diagnostics.cachedInputTokens, 45);
  assert.equal(diagnostics.outputTokens, 27);
  assert.equal(diagnostics.reasoningTokens, 3);
  assert.equal(diagnostics.headroomPercent, 73);
  assert.equal(diagnostics.schemaResult, "not_run");
  assert.equal(diagnostics.domainResult, "not_run");
  assert.equal(diagnostics.providerCalled, true);
  assert.equal(diagnostics.cached, false);
  assert.equal(diagnostics.outputTextLength, 7);
  assert.equal(diagnostics.outputBytes, 7);
  assert.deepEqual(diagnostics.contentItemTypes, ["output_text"]);
  assert.equal(JSON.stringify(diagnostics).includes("{broken"), false);
  assert.equal(Object.hasOwn(diagnostics, "responseBody"), false);
});

test("success diagnostics expose only bounded metadata and mark absent usage as unknown", () => {
  const diagnostics = safeAiSuccessDiagnostics({
    requestId: "req_success",
    diagnostics: {
      responseStatus: "completed",
      schemaResult: "pass",
      domainResult: "pass",
      outputTokens: 123,
      reasoningTokens: null,
      outputTextLength: 456,
      outputBytes: 700,
      parsedPayloadBytes: 789,
      parsedItemCount: 12,
    },
    usage: {
      input_tokens: 321,
      input_tokens_details: { cached_tokens: 210 },
      output_tokens: 123,
    },
    contract: { maxOutputTokens: 6000 },
    plan: { rawGoal: "로그에 나오면 안 되는 목표" },
  }, {
    correlationId: "correlation-success",
    environment: "staging",
    model: "gpt-fixture",
    operation: "goal_generation",
    latencyMs: 45,
  });
  assert.equal(diagnostics.configuredMaxOutputTokens, 6000);
  assert.equal(diagnostics.maxOutputTokens, 6000);
  assert.equal(diagnostics.inputTokens, 321);
  assert.equal(diagnostics.cachedInputTokens, 210);
  assert.equal(diagnostics.outputTokens, 123);
  assert.equal(diagnostics.reasoningTokens, "unknown");
  assert.equal(diagnostics.headroomPercent, 97.95);
  assert.equal(diagnostics.schemaResult, "pass");
  assert.equal(diagnostics.domainResult, "pass");
  assert.equal(diagnostics.providerCalled, true);
  assert.equal(diagnostics.cached, false);
  assert.equal(diagnostics.outputBytes, 700);
  assert.equal(diagnostics.parsedItemCount, 12);
  assert.equal(JSON.stringify(diagnostics).includes("로그에 나오면 안 되는 목표"), false);
  assert.equal(Object.hasOwn(diagnostics, "plan"), false);
});

test("domain failures expose only stable rule IDs and measured usage", () => {
  let caught;
  try {
    parseStructuredResponse(message(textContent({ name: "task", durationMinutes: 20 })), {
      schema,
      domainValidate: () => [
        "EXCLUDED_WEEKDAY_ACTION",
        { ruleId: "AVAILABILITY_OVER_CAPACITY", rawValue: "RAW-DOMAIN-SENTINEL" },
        "not safe raw detail",
      ],
    });
  } catch (error) {
    caught = error;
  }
  const diagnostics = safeAiDiagnostics(caught, {
    correlationId: "correlation-domain",
    environment: "staging",
    operation: "goal_generation",
    model: "gpt-fixture",
    maxOutputTokens: 6000,
  });
  assert.deepEqual(diagnostics.domainRuleIds, [
    "EXCLUDED_WEEKDAY_ACTION",
    "AVAILABILITY_OVER_CAPACITY",
  ]);
  assert.equal(diagnostics.domainValidationCode, "EXCLUDED_WEEKDAY_ACTION");
  assert.equal(diagnostics.schemaResult, "pass");
  assert.equal(diagnostics.domainResult, "fail");
  assert.equal(diagnostics.inputTokens, 123);
  assert.equal(diagnostics.cachedInputTokens, 45);
  assert.equal(diagnostics.outputTokens, 27);
  assert.equal(diagnostics.headroomPercent, 99.55);
  assert.equal(JSON.stringify(diagnostics).includes("RAW-DOMAIN-SENTINEL"), false);
  assert.equal(JSON.stringify(diagnostics).includes("not safe raw detail"), false);
});

test("safe telemetry never spreads raw PII or accepts unsafe labels", () => {
  const sentinel = "RAW-PII user@example.test Authorization=Bearer-secret";
  const error = new Error(sentinel);
  error.code = "AI_OUTPUT_DOMAIN_INVALID";
  error.providerCalled = false;
  error.cached = true;
  error.providerRequestId = sentinel;
  error.diagnostics = {
    responseStatus: sentinel,
    incompleteReason: sentinel,
    outputItemTypes: ["message", sentinel],
    contentItemTypes: ["output_text", sentinel],
    inputTokens: null,
    cachedInputTokens: null,
    outputTokens: null,
    reasoningTokens: null,
    outputTextLength: null,
    outputBytes: null,
    parsedPayloadBytes: null,
    parsedItemCount: null,
    schemaResult: "not_run",
    domainResult: "fail",
    schemaErrorPath: `$/properties/${sentinel}`,
    schemaErrorRule: sentinel,
    domainValidationCode: sentinel,
    domainRuleIds: [sentinel, "SOURCE_REFERENCE_MISSING"],
    retryCount: 0,
    rawInput: sentinel,
    rawResponse: sentinel,
  };
  const diagnostics = safeAiDiagnostics(error, {
    correlationId: sentinel,
    environment: sentinel,
    operation: sentinel,
    model: sentinel,
    maxOutputTokens: 6000,
  });
  const serialized = JSON.stringify(diagnostics);
  assert.equal(serialized.includes(sentinel), false);
  assert.deepEqual(diagnostics.outputItemTypes, ["message"]);
  assert.deepEqual(diagnostics.contentItemTypes, ["output_text"]);
  assert.deepEqual(diagnostics.domainRuleIds, ["SOURCE_REFERENCE_MISSING"]);
  assert.equal(diagnostics.providerCalled, false);
  assert.equal(diagnostics.cached, true);
  assert.equal(diagnostics.inputTokens, "unknown");
  assert.equal(diagnostics.headroomPercent, "unknown");
  assert.equal(Object.hasOwn(diagnostics, "rawInput"), false);
  assert.equal(Object.hasOwn(diagnostics, "rawResponse"), false);
});

test("headroom is unknown without real provider output usage", () => {
  const diagnostics = safeAiSuccessDiagnostics({
    requestId: "req_no_usage",
    diagnostics: {
      responseStatus: "completed",
      schemaResult: "pass",
      domainResult: "pass",
    },
    contract: { maxOutputTokens: 4500 },
  }, {
    environment: "staging",
    operation: "plan_revision",
  });
  assert.equal(diagnostics.outputTokens, "unknown");
  assert.equal(diagnostics.headroomPercent, "unknown");
});
