import test from "node:test";
import assert from "node:assert/strict";

import {
  parseStructuredResponse,
  providerHttpError,
  safeAiDiagnostics,
} from "./ai-output-contract.mjs";
import { GOAL_PLAN_SCHEMA } from "./ai-goal-plan.mjs";
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
    usage: { output_tokens: 27 },
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

test("generation and revision schemas keep strict required object contracts", () => {
  assertStrictObjectSchemas(GOAL_PLAN_SCHEMA);
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
    model: "gpt-fixture",
    latencyMs: 123.4,
  });
  assert.equal(diagnostics.errorCategory, "AI_OUTPUT_PARSE_FAILED");
  assert.equal(diagnostics.outputTextLength, 7);
  assert.deepEqual(diagnostics.contentItemTypes, ["output_text"]);
  assert.equal(JSON.stringify(diagnostics).includes("{broken"), false);
  assert.equal(Object.hasOwn(diagnostics, "responseBody"), false);
});
