var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ai-goal-plan.mjs
var PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "personalitySummary",
    "planningStyle",
    "firstAction",
    "weekTitle",
    "weekPlan",
    "coachMessage",
    "dashboard",
    "fullSchedule",
    "todaySchedule",
    "checkInRules",
    "fallbackPlan"
  ],
  properties: {
    personalitySummary: { type: "string" },
    planningStyle: { type: "string" },
    firstAction: { type: "string" },
    weekTitle: { type: "string" },
    weekPlan: { type: "array", items: { type: "string" }, minItems: 5, maxItems: 7 },
    coachMessage: { type: "string" },
    dashboard: {
      type: "object",
      additionalProperties: false,
      required: ["goal", "progress", "pace"],
      properties: {
        goal: { type: "string" },
        progress: { type: "integer", minimum: 0, maximum: 100 },
        pace: { type: "string" }
      }
    },
    fullSchedule: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["phase", "days", "focus", "successMetric"],
        properties: {
          phase: { type: "string" },
          days: { type: "string" },
          focus: { type: "string" },
          successMetric: { type: "string" }
        }
      }
    },
    todaySchedule: {
      type: "array",
      minItems: 2,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["time", "durationMinutes", "task", "completionRule"],
        properties: {
          time: { type: "string" },
          durationMinutes: { type: "integer", minimum: 5, maximum: 180 },
          task: { type: "string" },
          completionRule: { type: "string" }
        }
      }
    },
    checkInRules: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
    fallbackPlan: { type: "string" }
  }
};
function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}
__name(cleanText, "cleanText");
function normalizeGoalInput(input = {}) {
  const periodDays = Number(input.periodDays);
  return {
    goal: cleanText(input.goal, 300),
    periodDays: Number.isFinite(periodDays) ? Math.max(7, Math.min(3650, Math.round(periodDays))) : 90,
    currentState: cleanText(input.currentState, 500),
    routine: {
      readiness: cleanText(input.routine?.readiness, 100),
      preferredTime: cleanText(input.routine?.preferredTime, 50),
      existingRoutine: cleanText(input.routine?.existingRoutine, 300)
    },
    birth: {
      date: cleanText(input.birth?.date, 20),
      time: cleanText(input.birth?.time, 20),
      place: cleanText(input.birth?.place, 100)
    },
    mbti: cleanText(input.mbti, 10),
    personalitySignals: {
      summary: cleanText(input.manseoryeok?.summary, 300),
      planningStyle: cleanText(input.recommendedPlanningStyle, 100)
    }
  };
}
__name(normalizeGoalInput, "normalizeGoalInput");
function validateGoalInput(input) {
  if (!input.goal) return "\uBAA9\uD45C\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  if (!input.routine.readiness || !input.routine.preferredTime) return "\uBAA9\uD45C \uAE30\uAC04\uACFC \uC2DC\uAC04\uB300\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  return "";
}
__name(validateGoalInput, "validateGoalInput");
function extractOutputText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}
__name(extractOutputText, "extractOutputText");
async function createAiGoalPlan(input, { apiKey, model = "gpt-5.4-mini", fetchImpl = fetch } = {}) {
  if (!apiKey) {
    const error = new Error("\uC11C\uBC84\uC5D0 OPENAI_API_KEY\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC5B4\uC694.");
    error.status = 503;
    throw error;
  }
  const normalized = normalizeGoalInput(input);
  const validationError = validateGoalInput(normalized);
  if (validationError) {
    const error = new Error(validationError);
    error.status = 400;
    throw error;
  }
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: "low" },
      instructions: [
        "\uB2F9\uC2E0\uC740 \uD589\uB3D9\uACFC\uD559 \uAE30\uBC18 \uBAA9\uD45C \uC124\uACC4 \uCF54\uCE58\uC785\uB2C8\uB2E4. \uBAA8\uB4E0 \uB2F5\uBCC0\uC740 \uC790\uC5F0\uC2A4\uB7EC\uC6B4 \uD55C\uAD6D\uC5B4\uB85C \uC791\uC131\uD558\uC138\uC694.",
        "\uC0AC\uC6A9\uC790\uC758 \uBAA9\uD45C, \uD604\uC7AC \uC218\uC900, \uC0AC\uC6A9 \uAC00\uB2A5 \uC2DC\uAC04, \uAE30\uC874 \uB8E8\uD2F4, \uC2E4\uD589 \uC131\uD5A5\uC744 \uCD5C\uC6B0\uC120 \uADFC\uAC70\uB85C \uC0AC\uC6A9\uD558\uC138\uC694.",
        "MBTI\uC640 \uC0DD\uB144\uC6D4\uC77C \uAE30\uBC18 \uC131\uD5A5 \uC2E0\uD638\uB294 \uC0AC\uC6A9\uC790\uAC00 \uC81C\uACF5\uD55C \uC120\uD638 \uC815\uBCF4\uB85C\uB9CC \uCC38\uACE0\uD558\uACE0 \uC0AC\uC2E4\uC774\uB098 \uC6B4\uBA85\uCC98\uB7FC \uB2E8\uC815\uD558\uC9C0 \uB9C8\uC138\uC694.",
        "\uD604\uC7AC \uC0C1\uD669, \uAE30\uC874 \uB8E8\uD2F4, MBTI, \uC0DD\uB144\uC6D4\uC77C \uAC12\uC774 \uBE44\uC5B4 \uC788\uC73C\uBA74 \uC784\uC758\uB85C \uCD94\uC815\uD558\uC9C0 \uB9D0\uACE0 \uBAA9\uD45C\uC640 \uAE30\uAC04, \uC120\uD638 \uC2DC\uAC04\uC744 \uC911\uC2EC\uC73C\uB85C \uC77C\uBC18\uC801\uC778 \uACC4\uD68D\uC744 \uC138\uC6B0\uC138\uC694.",
        "\uC804\uCCB4 \uAE30\uAC04\uC744 \uCE21\uC815 \uAC00\uB2A5\uD55C \uB2E8\uACC4\uB85C \uB098\uB204\uACE0, \uCCAB 7\uC77C\uC740 \uC2E4\uC81C\uB85C \uC2E4\uD589 \uAC00\uB2A5\uD55C \uBD84\uB7C9\uACFC \uC644\uB8CC \uAE30\uC900\uC744 \uC81C\uC2DC\uD558\uC138\uC694.",
        "\uC624\uB298 \uC77C\uC815\uC740 \uC120\uD638 \uC2DC\uAC04\uACFC \uAE30\uC874 \uB8E8\uD2F4\uC5D0 \uC5F0\uACB0\uD558\uACE0, \uC2E4\uD328\uD55C \uB0A0\uC744 \uC704\uD55C \uCD5C\uC18C \uD589\uB3D9\uACFC \uC7AC\uC2DC\uC791 \uADDC\uCE59\uC744 \uD3EC\uD568\uD558\uC138\uC694.",
        "\uACFC\uB3C4\uD55C \uC790\uC2E0\uAC10, \uC758\uB8CC\xB7\uC7AC\uC815\uC801 \uB2E8\uC815, \uBD88\uD544\uC694\uD558\uAC8C \uAE34 \uC124\uBA85\uC740 \uD53C\uD558\uC138\uC694."
      ].join("\n"),
      input: `\uB2E4\uC74C \uC0AC\uC6A9\uC790 \uC815\uBCF4\uB85C \uC815\uBC00 \uBAA9\uD45C \uACC4\uD68D\uC744 \uC124\uACC4\uD558\uC138\uC694.
${JSON.stringify(normalized, null, 2)}`,
      max_output_tokens: 3e3,
      text: {
        verbosity: "medium",
        format: {
          type: "json_schema",
          name: "personalized_goal_plan",
          strict: true,
          schema: PLAN_SCHEMA
        }
      }
    })
  });
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(responseBody.error?.message || "OpenAI API \uC694\uCCAD\uC5D0 \uC2E4\uD328\uD588\uC5B4\uC694.");
    error.status = response.status >= 400 && response.status < 500 ? 502 : response.status;
    throw error;
  }
  const outputText = extractOutputText(responseBody);
  if (!outputText) {
    const error = new Error("AI \uC751\uB2F5\uC5D0\uC11C \uACC4\uD68D\uC744 \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694.");
    error.status = 502;
    throw error;
  }
  try {
    return { plan: JSON.parse(outputText), usage: responseBody.usage || null, requestId: response.headers.get("x-request-id") || "" };
  } catch {
    const error = new Error("AI \uACC4\uD68D \uC751\uB2F5\uC744 \uD574\uC11D\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694.");
    error.status = 502;
    throw error;
  }
}
__name(createAiGoalPlan, "createAiGoalPlan");

// ai-companion-chat.mjs
var REPLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "reply"],
  properties: {
    headline: { type: "string" },
    reply: { type: "string" }
  }
};
function cleanText2(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}
__name(cleanText2, "cleanText");
function extractOutputText2(response) {
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}
__name(extractOutputText2, "extractOutputText");
async function createCompanionReply(input, { apiKey, model = "gpt-5.4-mini", fetchImpl = fetch } = {}) {
  if (!apiKey) {
    const error = new Error("\uC11C\uBC84\uC5D0 OPENAI_API_KEY\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC5B4\uC694.");
    error.status = 503;
    throw error;
  }
  const message = cleanText2(input?.message, 500);
  if (!message) {
    const error = new Error("\uC62C\uB9AC\uC5D0\uAC8C \uBCF4\uB0BC \uBA54\uC2DC\uC9C0\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
    error.status = 400;
    throw error;
  }
  const context = {
    goal: cleanText2(input?.context?.goal, 200),
    energy: cleanText2(input?.context?.energy, 20),
    todayFocus: cleanText2(input?.context?.todayFocus, 200)
  };
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: "low" },
      instructions: [
        "\uB2F9\uC2E0\uC740 \uBAA9\uD45C \uC2E4\uD589\uC744 \uB3D5\uB294 \uB2E4\uC815\uD55C \uBAA9\uD45C \uBA54\uC774\uD2B8 \uCE90\uB9AD\uD130 '\uC62C\uB9AC'\uC785\uB2C8\uB2E4.",
        "headline: \uB300\uB2F5\uC758 \uD575\uC2EC\uC744 \uB2F4\uC740 \uC9E7\uC740 \uD55C \uC904(8~20\uC790, \uB9D0\uD48D\uC120\uC758 \uAD75\uC740 \uC81C\uBAA9). reply: 2~3\uBB38\uC7A5\uC758 \uBCF8\uBB38.",
        "\uC790\uC5F0\uC2A4\uB7EC\uC6B4 \uD55C\uAD6D\uC5B4 '~\uD574\uC694'\uCCB4\uB85C, \uC9E7\uACE0 \uB530\uB73B\uD558\uAC8C \uB2F5\uD558\uC138\uC694.",
        "\uC0AC\uC6A9\uC790\uB97C \uC808\uB300 \uD63C\uB0B4\uC9C0 \uB9D0\uACE0, \uACF5\uAC10\uC774\uB098 \uC751\uC6D0\uACFC \uD568\uAED8 \uC624\uB298 \uBC14\uB85C \uD560 \uC218 \uC788\uB294 \uC544\uC8FC \uC791\uC740 \uD589\uB3D9 \uD558\uB098\uB97C \uC81C\uC548\uD558\uC138\uC694.",
        "\uC0AC\uC6A9\uC790 \uC815\uBCF4(\uBAA9\uD45C, \uC624\uB298 \uCEE8\uB514\uC158)\uAC00 \uC788\uC73C\uBA74 \uB2F5\uBCC0\uC5D0 \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uBC18\uC601\uD558\uC138\uC694.",
        "\uC758\uB8CC\xB7\uBC95\uB960\xB7\uC7AC\uC815 \uBB38\uC81C\uB294 \uB2E8\uC815\uD558\uC9C0 \uB9D0\uACE0 \uD544\uC694\uD558\uBA74 \uC804\uBB38\uAC00\uC640 \uC0C1\uC758\uD558\uB3C4\uB85D \uBD80\uB4DC\uB7FD\uAC8C \uC548\uB0B4\uD558\uC138\uC694."
      ].join("\n"),
      input: `\uC0AC\uC6A9\uC790 \uC815\uBCF4: ${JSON.stringify(context)}
\uC0AC\uC6A9\uC790\uC758 \uB9D0: ${message}`,
      max_output_tokens: 700,
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "companion_reply",
          strict: true,
          schema: REPLY_SCHEMA
        }
      }
    })
  });
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(responseBody.error?.message || "OpenAI API \uC694\uCCAD\uC5D0 \uC2E4\uD328\uD588\uC5B4\uC694.");
    error.status = response.status >= 400 && response.status < 500 ? 502 : response.status;
    throw error;
  }
  const outputText = extractOutputText2(responseBody);
  if (!outputText) {
    const error = new Error("\uC62C\uB9AC\uC758 \uB2F5\uC744 \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694.");
    error.status = 502;
    throw error;
  }
  try {
    const parsed = JSON.parse(outputText);
    const reply = cleanText2(parsed.reply, 400);
    const headline = cleanText2(parsed.headline, 60);
    if (!reply) throw new Error("empty reply");
    return { headline, reply, usage: responseBody.usage || null };
  } catch {
    const error = new Error("\uC62C\uB9AC\uC758 \uB2F5\uC744 \uD574\uC11D\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694.");
    error.status = 502;
    throw error;
  }
}
__name(createCompanionReply, "createCompanionReply");

// ai-plan-revision.mjs
var REVISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "revisionSummary", "weeklySchedule", "revisedTasks", "changes", "ollieMessage"],
  properties: {
    summary: { type: "string" },
    revisionSummary: {
      type: "object",
      additionalProperties: false,
      required: ["goalAlignment", "resourcePlan", "timePlan", "weeklyRule", "assumptions"],
      properties: {
        goalAlignment: { type: "string" },
        resourcePlan: { type: "string" },
        timePlan: { type: "string" },
        weeklyRule: { type: "string" },
        assumptions: { type: "array", items: { type: "string" }, minItems: 0, maxItems: 4 }
      }
    },
    weeklySchedule: {
      type: "array",
      minItems: 7,
      maxItems: 7,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["day", "isRestDay", "tasks"],
        properties: {
          day: { type: "string", enum: ["\uC6D4", "\uD654", "\uC218", "\uBAA9", "\uAE08", "\uD1A0", "\uC77C"] },
          isRestDay: { type: "boolean" },
          tasks: {
            type: "array",
            minItems: 0,
            maxItems: 5,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["time", "durationMinutes", "task", "completionRule"],
              properties: {
                time: { type: "string" },
                durationMinutes: { type: "integer", minimum: 5, maximum: 360 },
                task: { type: "string" },
                completionRule: { type: "string" }
              }
            }
          }
        }
      }
    },
    revisedTasks: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 14 },
    changes: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
    ollieMessage: { type: "string" }
  }
};
function cleanText3(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}
__name(cleanText3, "cleanText");
function normalizeRevisionInput(input = {}) {
  const details = input.revisionDetails || {};
  const schedule = details.schedule || {};
  const priority = details.priorityAdjustment || details.focusAdjustment || {};
  const normalizeMinutes = /* @__PURE__ */ __name((value) => {
    const minutes = Number(value);
    return Number.isFinite(minutes) && minutes > 0 ? Math.max(10, Math.min(720, Math.round(minutes))) : null;
  }, "normalizeMinutes");
  return {
    goal: cleanText3(input.goal, 300),
    periodDays: Math.max(7, Math.min(3650, Number(input.periodDays) || 30)),
    currentState: cleanText3(input.currentState, 500),
    planningStyle: cleanText3(input.planningStyle, 100),
    routine: {
      readiness: cleanText3(input.routine?.readiness, 100),
      preferredTime: cleanText3(input.routine?.preferredTime, 50),
      existingRoutine: cleanText3(input.routine?.existingRoutine, 300)
    },
    currentPlanText: cleanText3(input.currentPlanText, 5e3),
    revisionRequest: cleanText3(input.revisionRequest, 1600),
    revisionDetails: {
      goalType: cleanText3(details.goalType, 30) || "general",
      resources: cleanText3(details.resources || details.materials, 1200),
      targetOutcome: cleanText3(details.targetOutcome || details.targetCoverage, 1200),
      schedule: {
        weekdayMinutes: normalizeMinutes(schedule.weekdayMinutes),
        weekendMinutes: normalizeMinutes(schedule.weekendMinutes),
        preferredTime: cleanText3(schedule.preferredTime, 80),
        availableDays: Array.isArray(schedule.availableDays) ? schedule.availableDays.slice(0, 7).map((day) => cleanText3(day, 10)).filter(Boolean) : []
      },
      priorityAdjustment: {
        increase: cleanText3(priority.increase, 600),
        decrease: cleanText3(priority.decrease, 600),
        keepRules: cleanText3(priority.keepRules, 900)
      },
      constraints: cleanText3(details.constraints, 1e3)
    },
    completedTasks: Array.isArray(input.completedTasks) ? input.completedTasks.slice(-30).map((task) => cleanText3(task, 240)).filter(Boolean) : []
  };
}
__name(normalizeRevisionInput, "normalizeRevisionInput");
function hasRevisionIntent(input) {
  const details = input.revisionDetails;
  return Boolean(
    input.revisionRequest || details.resources || details.targetOutcome || details.schedule.weekdayMinutes || details.schedule.weekendMinutes || details.schedule.preferredTime || details.schedule.availableDays.length || details.priorityAdjustment.increase || details.priorityAdjustment.decrease || details.priorityAdjustment.keepRules || details.constraints
  );
}
__name(hasRevisionIntent, "hasRevisionIntent");
function extractOutputText3(response) {
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}
__name(extractOutputText3, "extractOutputText");
async function createAiPlanRevision(input, { apiKey, model = "gpt-5.4-mini", fetchImpl = fetch } = {}) {
  if (!apiKey) {
    const error = new Error("\uC11C\uBC84\uC5D0 OPENAI_API_KEY\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC5B4\uC694.");
    error.status = 503;
    throw error;
  }
  const normalized = normalizeRevisionInput(input);
  if (!normalized.goal || !normalized.currentPlanText || !hasRevisionIntent(normalized)) {
    const error = new Error("\uBAA9\uD45C, \uD604\uC7AC \uACC4\uD68D\uACFC \uD55C \uAC00\uC9C0 \uC774\uC0C1\uC758 \uC0C1\uC138 \uC218\uC815 \uC870\uAC74\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
    error.status = 400;
    throw error;
  }
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: "low" },
      instructions: [
        "\uB2F9\uC2E0\uC740 \uD589\uB3D9\uACFC\uD559 \uAE30\uBC18 \uBAA9\uD45C \uACC4\uD68D \uC218\uC815 \uCF54\uCE58\uC774\uBA70, \uBAA8\uB4E0 \uB2F5\uBCC0\uC740 \uC790\uC5F0\uC2A4\uB7EC\uC6B4 \uD55C\uAD6D\uC5B4\uB85C \uC791\uC131\uD569\uB2C8\uB2E4.",
        "\uBAA9\uD45C \uC720\uD615\uC740 \uC2DC\uD5D8\xB7\uD559\uC2B5, \uCC3D\uC5C5\xB7\uC0AC\uC5C5, \uCDE8\uC5C5\xB7\uCEE4\uB9AC\uC5B4, \uC6B4\uB3D9\xB7\uAC74\uAC15, \uC2B5\uAD00\xB7\uC0DD\uD65C, \uCF58\uD150\uCE20\xB7\uD504\uB85C\uC81D\uD2B8, \uC7AC\uBB34\xB7\uC800\uCD95 \uB610\uB294 \uAE30\uD0C0\uC77C \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uACF5\uBD80 \uACC4\uD68D\uC73C\uB85C \uAC00\uC815\uD558\uC9C0 \uB9D0\uACE0 revisionDetails.goalType\uACFC \uC2E4\uC81C \uBAA9\uD45C \uBB38\uB9E5\uC5D0 \uB9DE\uB294 \uC804\uBB38 \uC6A9\uC5B4\uC640 \uC644\uB8CC \uAE30\uC900\uC744 \uC0AC\uC6A9\uD558\uC138\uC694.",
        "\uC0AC\uC6A9\uC790\uAC00 \uC694\uCCAD\uD55C \uC218\uC815 \uC870\uAC74\uC744 \uAC00\uC7A5 \uC6B0\uC120\uD558\uACE0, \uCD5C\uC885 \uACB0\uACFC\uC5D0 \uC9C1\uC811 \uB3C4\uC6C0\uC774 \uB418\uB294 \uAC80\uC99D \uAC00\uB2A5\uD558\uACE0 \uAD6C\uCCB4\uC801\uC778 \uD589\uB3D9\uB9CC \uB0A8\uAE30\uC138\uC694.",
        "\uC644\uB8CC\uD55C \uD0DC\uC2A4\uD06C\uB294 \uC131\uCDE8 \uAE30\uB85D\uC73C\uB85C \uBCF4\uD638\uD558\uACE0 \uB2E4\uC2DC \uC218\uD589\uD558\uB3C4\uB85D \uC694\uAD6C\uD558\uC9C0 \uB9C8\uC138\uC694.",
        "resources\uB294 \uBAA9\uD45C\uC5D0 \uB530\uB77C \uAD50\uC7AC, \uB3C4\uAD6C, \uACE0\uAC1D, \uC0AC\uB78C, \uC608\uC0B0, \uCC44\uB110, \uC7A5\uBE44, \uACC4\uC88C \uB610\uB294 \uAE30\uC874 \uACB0\uACFC\uBB3C\uC77C \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uC0AC\uC6A9\uC790\uAC00 \uC81C\uACF5\uD558\uC9C0 \uC54A\uC740 \uC218\uB7C9\xB7\uC0AC\uC591\xB7\uC131\uACFC\uB97C \uC9C0\uC5B4\uB0B4\uC9C0 \uB9D0\uACE0 \uD544\uC694\uD55C \uACBD\uC6B0 assumptions\uC5D0 \uAC00\uC815\uC744 \uBA85\uC2DC\uD558\uC138\uC694.",
        "targetOutcome\uC744 \uC810\uC218, \uC644\uB8CC \uBC94\uC704, \uACE0\uAC1D \uAC80\uC99D, MVP, \uB9E4\uCD9C, \uC9C0\uC6D0 \uACB0\uACFC, \uC2E0\uCCB4 \uC9C0\uD45C, \uBC18\uBCF5 \uBE48\uB3C4, \uACF5\uAC1C \uACB0\uACFC\uBB3C \uB610\uB294 \uAE08\uC561\uCC98\uB7FC \uBAA9\uD45C \uC720\uD615\uC5D0 \uB9DE\uB294 \uCE21\uC815 \uAC00\uB2A5\uD55C \uC644\uB8CC \uAE30\uC900\uC73C\uB85C \uD574\uC11D\uD558\uC138\uC694.",
        "\uD3C9\uC77C\xB7\uC8FC\uB9D0 \uAC00\uC6A9 \uC2DC\uAC04\uACFC \uC120\uD0DD \uC694\uC77C\uC744 \uB118\uC9C0 \uC54A\uAC8C \uCD1D\uBD84\uB7C9\uC744 \uBC30\uCE58\uD558\uACE0, \uC2DC\uAC04\uC774 \uBD80\uC871\uD558\uBA74 \uC6B0\uC120\uC21C\uC704\uB97C \uC815\uD574 \uBC94\uC704 \uB610\uB294 \uBE48\uB3C4 \uC870\uC815\uC548\uC744 changes\uC640 assumptions\uC5D0 \uBD84\uBA85\uD788 \uC4F0\uC138\uC694.",
        "\uB354 \uBE44\uC911\uC744 \uB458 \uC77C, \uC904\uC774\uAC70\uB098 \uC81C\uC678\uD560 \uC77C, \uBC18\uB4DC\uC2DC \uC720\uC9C0\uD560 \uC870\uAC74\uC744 \uC11C\uB85C \uC0C1\uC1C4\uD558\uC9C0 \uB9D0\uACE0 \uC2E4\uC81C \uC2DC\uAC04 \uBC30\uBD84\uACFC \uC8FC\uAC04 \uBE48\uB3C4\uC5D0 \uC218\uCE58\uB85C \uBC18\uC601\uD558\uC138\uC694.",
        "\uAC01 revisedTasks \uD56D\uBAA9\uC740 \uB300\uC0C1, \uAD6C\uCCB4\uC801\uC778 \uD589\uB3D9\uACFC \uBD84\uB7C9, \uC18C\uC694 \uC2DC\uAC04, \uBE48\uB3C4\uB098 \uC694\uC77C, \uC644\uB8CC \uAE30\uC900 \uC911 \uAD00\uB828 \uC815\uBCF4\uB97C \uD3EC\uD568\uD55C \uC2E4\uD589 \uAC00\uB2A5\uD55C \uD55C \uBB38\uC7A5\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.",
        "\uCC3D\uC5C5 \uBAA9\uD45C\uB77C\uBA74 \uC870\uC0AC\uB9CC \uBC18\uBCF5\uD558\uC9C0 \uB9D0\uACE0 \uACE0\uAC1D \uC811\uCD09\xB7\uAC00\uC124 \uAC80\uC99D\xB7\uC81C\uC791\xB7\uD310\uB9E4 \uAC19\uC740 \uC2E4\uC81C \uC2DC\uC7A5 \uD589\uB3D9\uC744 \uBAA9\uD45C \uB2E8\uACC4\uC5D0 \uB9DE\uAC8C \uBC30\uCE58\uD558\uC138\uC694. \uC6B4\uB3D9\uC740 \uC548\uC804\uACFC \uD68C\uBCF5\uC744, \uC7AC\uBB34\uB294 \uD604\uC2E4\uC801 \uC81C\uC57D\uACFC \uC704\uD5D8\uC744 \uACE0\uB824\uD558\uC138\uC694.",
        "weeklySchedule\uC740 \uC6D4\uC694\uC77C\uBD80\uD130 \uC77C\uC694\uC77C\uAE4C\uC9C0 \uC815\uD655\uD788 7\uAC1C\uB97C \uC21C\uC11C\uB300\uB85C \uBC18\uD658\uD558\uC138\uC694. \uC120\uD0DD\uD558\uC9C0 \uC54A\uC740 \uC694\uC77C\uC740 isRestDay=true, tasks=[]\uB85C \uB450\uACE0, \uC2E4\uD589\uC77C\uC758 tasks \uC18C\uC694 \uC2DC\uAC04 \uD569\uACC4\uB294 \uC0AC\uC6A9\uC790\uC758 \uD3C9\uC77C\xB7\uC8FC\uB9D0 \uAC00\uC6A9 \uC2DC\uAC04\uC744 \uB118\uC9C0 \uB9C8\uC138\uC694.",
        "\uBD80\uB2F4\uC774 \uD06C\uB2E4\uACE0 \uAE30\uB85D\uB41C \uACBD\uC6B0 \uCCAB \uD589\uB3D9\uC744 \uB354 \uC27D\uAC8C \uC2DC\uC791\uD560 \uC218 \uC788\uB3C4\uB85D \uB098\uB204\uB418 '\uC791\uAC8C' \uAC19\uC740 \uBAA8\uD638\uD55C \uD45C\uD604\uB9CC \uC4F0\uC9C0 \uB9C8\uC138\uC694.",
        "\uD604\uC7AC \uACC4\uD68D\uC758 \uC7A5\uC810\uC740 \uBCF4\uC874\uD558\uACE0 \uC218\uC815 \uC694\uCCAD\uACFC \uCDA9\uB3CC\uD558\uB294 \uBD80\uBD84\uB9CC \uBC14\uAFB8\uC138\uC694.",
        "revisionSummary\uC5D0\uB294 \uBAA9\uD45C \uC5F0\uACB0, \uC790\uC6D0 \uD65C\uC6A9\uACFC \uC9C4\uD589 \uBC29\uC2DD, \uD3C9\uC77C\xB7\uC8FC\uB9D0 \uC2DC\uAC04 \uBC30\uBD84, \uC8FC\uAC04 \uC6B4\uC601 \uADDC\uCE59\uC744 \uAC01\uAC01 \uD55C\uB208\uC5D0 \uAC80\uD1A0\uD560 \uC218 \uC788\uB3C4\uB85D \uAD6C\uCCB4\uC801\uC73C\uB85C \uC694\uC57D\uD558\uC138\uC694."
      ].join("\n"),
      input: `\uB2E4\uC74C \uAE30\uB85D\uC744 \uBC14\uD0D5\uC73C\uB85C \uC801\uC6A9 \uC804 \uD655\uC778\uD560 \uACC4\uD68D \uBCC0\uACBD\uC548\uC744 \uB9CC\uB4DC\uC138\uC694.
${JSON.stringify(normalized, null, 2)}`,
      max_output_tokens: 2800,
      text: {
        verbosity: "medium",
        format: {
          type: "json_schema",
          name: "goal_plan_revision",
          strict: true,
          schema: REVISION_SCHEMA
        }
      }
    })
  });
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(responseBody.error?.message || "OpenAI API \uC694\uCCAD\uC5D0 \uC2E4\uD328\uD588\uC5B4\uC694.");
    error.status = response.status >= 400 && response.status < 500 ? 502 : response.status;
    throw error;
  }
  const outputText = extractOutputText3(responseBody);
  if (!outputText) {
    const error = new Error("AI \uC751\uB2F5\uC5D0\uC11C \uBCC0\uACBD\uC548\uC744 \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694.");
    error.status = 502;
    throw error;
  }
  try {
    return { revision: JSON.parse(outputText), usage: responseBody.usage || null, requestId: response.headers.get("x-request-id") || "" };
  } catch {
    const error = new Error("AI \uBCC0\uACBD\uC548\uC744 \uD574\uC11D\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694.");
    error.status = 502;
    throw error;
  }
}
__name(createAiPlanRevision, "createAiPlanRevision");

// auth-service.mjs
var SESSION_COOKIE = "omw_session";
var STATE_COOKIE = "omw_oauth_state";
var SESSION_DAYS = 30;
var TRIAL_DURATION_MS = 24 * 60 * 60 * 1e3;
var textEncoder = new TextEncoder();
function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(base64UrlEncode, "base64UrlEncode");
function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
__name(base64UrlDecode, "base64UrlDecode");
async function hmacSign(payload, secret) {
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}
__name(hmacSign, "hmacSign");
async function hmacVerify(payload, signature, secret) {
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, base64UrlDecode(signature), textEncoder.encode(payload));
}
__name(hmacVerify, "hmacVerify");
async function createSessionToken(payload, secret) {
  const body = base64UrlEncode(textEncoder.encode(JSON.stringify(payload)));
  const signature = await hmacSign(body, secret);
  return `v1.${body}.${signature}`;
}
__name(createSessionToken, "createSessionToken");
async function verifySessionToken(token, secret) {
  try {
    const [version, body, signature] = String(token || "").split(".");
    if (version !== "v1" || !body || !signature) return null;
    if (!await hmacVerify(body, signature, secret)) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body)));
    if (!payload?.uid || Number(payload.exp || 0) < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
__name(verifySessionToken, "verifySessionToken");
function randomId(length = 24) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes).slice(0, length);
}
__name(randomId, "randomId");
function constantTimeEqual(left, right) {
  const leftBytes = textEncoder.encode(String(left || ""));
  const rightBytes = textEncoder.encode(String(right || ""));
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  return difference === 0;
}
__name(constantTimeEqual, "constantTimeEqual");
async function deriveAdminPasswordHash(ctx, password, salt) {
  return hmacSign(`${salt}:${String(password || "")}`, sessionSecret(ctx.env));
}
__name(deriveAdminPasswordHash, "deriveAdminPasswordHash");
async function adminPasswordSetting(ctx) {
  return typeof store(ctx).getSetting === "function" ? store(ctx).getSetting("admin_password") : null;
}
__name(adminPasswordSetting, "adminPasswordSetting");
async function verifyAdminPassword(ctx, supplied) {
  const setting = await adminPasswordSetting(ctx);
  if (setting?.salt && setting?.hash) {
    return constantTimeEqual(await deriveAdminPasswordHash(ctx, supplied, setting.salt), setting.hash);
  }
  const temporaryPassword = String(ctx.env.ADMIN_PASSWORD || "");
  return temporaryPassword ? constantTimeEqual(supplied, temporaryPassword) : false;
}
__name(verifyAdminPassword, "verifyAdminPassword");
var PROVIDERS = {
  kakao: {
    label: "\uCE74\uCE74\uC624",
    authorizeUrl: "https://kauth.kakao.com/oauth/authorize",
    tokenUrl: "https://kauth.kakao.com/oauth/token",
    profileUrl: "https://kapi.kakao.com/v2/user/me",
    scope: "",
    normalizeProfile(data) {
      return {
        providerUserId: String(data.id),
        name: data.kakao_account?.profile?.nickname || "\uCE74\uCE74\uC624 \uD68C\uC6D0",
        email: data.kakao_account?.email || "",
        avatar: data.kakao_account?.profile?.thumbnail_image_url || ""
      };
    }
  },
  naver: {
    label: "\uB124\uC774\uBC84",
    authorizeUrl: "https://nid.naver.com/oauth2.0/authorize",
    tokenUrl: "https://nid.naver.com/oauth2.0/token",
    profileUrl: "https://openapi.naver.com/v1/nid/me",
    scope: "",
    normalizeProfile(data) {
      const body = data.response || {};
      return {
        providerUserId: String(body.id),
        name: body.nickname || body.name || "\uB124\uC774\uBC84 \uD68C\uC6D0",
        email: body.email || "",
        avatar: body.profile_image || ""
      };
    }
  },
  google: {
    label: "\uAD6C\uAE00",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    profileUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
    normalizeProfile(data) {
      return {
        providerUserId: String(data.sub),
        name: data.name || "\uAD6C\uAE00 \uD68C\uC6D0",
        email: data.email || "",
        avatar: data.picture || ""
      };
    }
  }
};
function providerConfig(env, provider) {
  const upper = provider.toUpperCase();
  const clientId = env[`${upper}_CLIENT_ID`] || "";
  const clientSecret = env[`${upper}_CLIENT_SECRET`] || "";
  return { clientId, clientSecret, configured: Boolean(clientId && clientSecret) };
}
__name(providerConfig, "providerConfig");
function sessionSecret(env) {
  const secret = String(env.SESSION_SECRET || "");
  if (secret) {
    if (!devLoginAllowed(env) && secret.length < 32) throw new Error("SESSION_SECRET\uC740 32\uC790 \uC774\uC0C1\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.");
    return secret;
  }
  if (devLoginAllowed(env)) return "omw-local-development-session-secret";
  throw new Error("SESSION_SECRET \uD658\uACBD \uBCC0\uC218\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.");
}
__name(sessionSecret, "sessionSecret");
function adminEmails(env) {
  return String(env.ADMIN_EMAILS || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}
__name(adminEmails, "adminEmails");
function cookie(name, value, { maxAgeSeconds, path = "/", httpOnly = true, secure }) {
  const parts = [`${name}=${value}`, `Path=${path}`, "SameSite=Lax"];
  if (httpOnly) parts.push("HttpOnly");
  if (secure) parts.push("Secure");
  if (Number.isFinite(maxAgeSeconds)) parts.push(`Max-Age=${maxAgeSeconds}`);
  return parts.join("; ");
}
__name(cookie, "cookie");
function safeRedirectPath(value) {
  const path = String(value || "/app.html");
  if (!path.startsWith("/") || path.startsWith("//")) return "/app.html";
  return path;
}
__name(safeRedirectPath, "safeRedirectPath");
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
    goalPlanGeneratedAt: user.goalPlanGeneratedAt || null,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt
  };
}
__name(publicUser, "publicUser");
async function upsertUserFromProfile(store2, env, provider, profile) {
  const id = `${provider}:${profile.providerUserId}`;
  const now = Date.now();
  const existing = await store2.getUser(id);
  const isAdminEmail = profile.email && adminEmails(env).includes(profile.email.toLowerCase());
  const user = existing || {
    id,
    provider,
    role: isAdminEmail ? "admin" : "member",
    roleSource: isAdminEmail ? "admin_email" : "default",
    plan: "trial",
    trialStartedAt: now,
    trialExpiresAt: now + TRIAL_DURATION_MS,
    createdAt: now
  };
  user.name = profile.name || user.name || "\uD68C\uC6D0";
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
  await store2.putUser(user);
  return user;
}
__name(upsertUserFromProfile, "upsertUserFromProfile");
async function issueSession(ctx, user) {
  const token = await createSessionToken(
    { uid: user.id, role: user.role || "member", exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1e3 },
    sessionSecret(ctx.env)
  );
  return cookie(SESSION_COOKIE, token, { maxAgeSeconds: SESSION_DAYS * 24 * 60 * 60, secure: ctx.secure });
}
__name(issueSession, "issueSession");
async function currentSessionUser(ctx) {
  const token = ctx.getCookie(SESSION_COOKIE);
  if (!token) return null;
  const payload = await verifySessionToken(token, sessionSecret(ctx.env));
  if (!payload) return null;
  if (payload.uid === "admin:password") {
    return { id: "admin:password", provider: "password", name: "\uAD00\uB9AC\uC790", email: "", role: "admin", plan: "pro", createdAt: 0, lastLoginAt: Date.now() };
  }
  const user = await store(ctx).getUser(payload.uid);
  return user || null;
}
__name(currentSessionUser, "currentSessionUser");
function store(ctx) {
  return ctx.store;
}
__name(store, "store");
function devLoginAllowed(env) {
  return String(env.ALLOW_DEV_LOGIN || "").toLowerCase() === "true";
}
__name(devLoginAllowed, "devLoginAllowed");
function demoBillingAllowed(env) {
  return String(env.ALLOW_DEMO_BILLING || "").toLowerCase() === "true";
}
__name(demoBillingAllowed, "demoBillingAllowed");
function billingConfig(env) {
  const clientKey = String(env.TOSS_CLIENT_KEY || "");
  const secretKey = String(env.TOSS_SECRET_KEY || "");
  return { clientKey, secretKey, configured: Boolean(clientKey && secretKey) };
}
__name(billingConfig, "billingConfig");
function addBillingMonth(value) {
  const date = new Date(Number(value) || Date.now());
  date.setMonth(date.getMonth() + 1);
  return date.getTime();
}
__name(addBillingMonth, "addBillingMonth");
async function tossBillingRequest(env, path, { method = "POST", body } = {}) {
  const config = billingConfig(env);
  if (!config.configured) throw new Error("\uC790\uB3D9\uACB0\uC81C \uD658\uACBD \uBCC0\uC218\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
  const response = await fetch(`https://api.tosspayments.com${path}`, {
    method,
    headers: {
      Authorization: `Basic ${btoa(`${config.secretKey}:`)}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : void 0
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || "\uACB0\uC81C\uC0AC \uC694\uCCAD\uC744 \uCC98\uB9AC\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
    error.status = response.status >= 500 ? 502 : 400;
    error.code = data.code || "BILLING_ERROR";
    throw error;
  }
  return data;
}
__name(tossBillingRequest, "tossBillingRequest");
async function ensureCustomerKey(ctx, user) {
  if (!user.customerKey) {
    user.customerKey = `omw_${randomId(30)}`;
    await store(ctx).putUser(user);
  }
  return user.customerKey;
}
__name(ensureCustomerKey, "ensureCustomerKey");
async function chargeSubscription(env, user) {
  const orderId = `omw_${Date.now()}_${randomId(10)}`;
  return tossBillingRequest(env, `/v1/billing/${encodeURIComponent(user.billingKey)}`, {
    body: {
      customerKey: user.customerKey,
      amount: 2900,
      orderId,
      orderName: "On My Way PRO \uC6D4\uC815\uC561",
      customerEmail: user.email || void 0,
      customerName: user.name || void 0
    }
  });
}
__name(chargeSubscription, "chargeSubscription");
function devLoginPage(provider, redirect) {
  const meta = PROVIDERS[provider];
  const colors = { kakao: "#fee500", naver: "#03c75a", google: "#f3f5f9" };
  const textColors = { kakao: "#38290a", naver: "#ffffff", google: "#3a4763" };
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${meta.label} \uB85C\uADF8\uC778 (\uB370\uBAA8)</title>
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
  <span class="badge">${meta.label} \uB85C\uADF8\uC778 \uB370\uBAA8</span>
  <h1>${meta.label} \uACC4\uC815\uC73C\uB85C \uACC4\uC18D\uD558\uAE30</h1>
  <p>\uC544\uC9C1 ${meta.label} \uAC1C\uBC1C\uC790 \uD0A4\uAC00 \uC5F0\uACB0\uB418\uC9C0 \uC54A\uC544 \uB370\uBAA8 \uB85C\uADF8\uC778\uC73C\uB85C \uC9C4\uD589\uB3FC\uC694. \uD0A4\uB97C \uC5F0\uACB0\uD558\uBA74 \uC774 \uD654\uBA74 \uB300\uC2E0 \uC2E4\uC81C ${meta.label} \uB85C\uADF8\uC778\uC774 \uC5F4\uB9BD\uB2C8\uB2E4.</p>
  <label>\uC774\uB984(\uB2C9\uB124\uC784)<input id="devName" type="text" maxlength="20" placeholder="\uC608: \uC62C\uB9AC\uCE5C\uAD6C" required /></label>
  <label>\uC774\uBA54\uC77C (\uC120\uD0DD)<input id="devEmail" type="email" maxlength="60" placeholder="\uC608: me@example.com" /></label>
  <button type="submit">\uB3D9\uC758\uD558\uACE0 \uACC4\uC18D\uD558\uAE30</button>
  <small>\uC785\uB825\uD55C \uC815\uBCF4\uB294 \uC774 \uC11C\uBE44\uC2A4\uC758 \uD68C\uC6D0 \uC815\uBCF4\uB85C\uB9CC \uC800\uC7A5\uB429\uB2C8\uB2E4.</small>
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
  else alert('\uB85C\uADF8\uC778\uC5D0 \uC2E4\uD328\uD588\uC5B4\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.');
});
<\/script></body></html>`;
}
__name(devLoginPage, "devLoginPage");
async function exchangeOAuthCode(env, provider, code, redirectUri, state) {
  const meta = PROVIDERS[provider];
  const { clientId, clientSecret } = providerConfig(env, provider);
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code
  });
  if (provider === "naver") params.set("state", state);
  const tokenResponse = await fetch(meta.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });
  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) throw new Error(`${meta.label} \uD1A0\uD070 \uBC1C\uAE09\uC5D0 \uC2E4\uD328\uD588\uC5B4\uC694.`);
  const profileResponse = await fetch(meta.profileUrl, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  const profileData = await profileResponse.json();
  return meta.normalizeProfile(profileData);
}
__name(exchangeOAuthCode, "exchangeOAuthCode");
async function handleAccountApi(ctx) {
  const { method, url } = ctx;
  const path = url.pathname;
  if (path === "/api/auth/providers" && method === "GET") {
    return {
      status: 200,
      json: {
        providers: Object.keys(PROVIDERS).map((id) => ({
          id,
          label: PROVIDERS[id].label,
          configured: providerConfig(ctx.env, id).configured
        })),
        devLoginEnabled: devLoginAllowed(ctx.env)
      }
    };
  }
  if (path === "/api/auth/start" && method === "GET") {
    const provider = String(url.searchParams.get("provider") || "");
    const redirect = safeRedirectPath(url.searchParams.get("redirect"));
    if (!PROVIDERS[provider]) return { status: 400, json: { error: "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uB85C\uADF8\uC778 \uBC29\uC2DD\uC774\uC5D0\uC694." } };
    const config = providerConfig(ctx.env, provider);
    if (!config.configured) {
      if (!devLoginAllowed(ctx.env)) return { status: 503, json: { error: `${PROVIDERS[provider].label} \uB85C\uADF8\uC778\uC774 \uC544\uC9C1 \uC900\uBE44 \uC911\uC774\uC5D0\uC694.` } };
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
      cookies: [cookie(STATE_COOKIE, state, { maxAgeSeconds: 600, secure: ctx.secure })]
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
        cookies: [await issueSession(ctx, user), cookie(STATE_COOKIE, "", { maxAgeSeconds: 0, secure: ctx.secure })]
      };
    } catch (error) {
      console.error(`${provider} OAuth callback failed`, error);
      return { status: 302, redirect: "/app.html?auth=error", cookies: [cookie(STATE_COOKIE, "", { maxAgeSeconds: 0, secure: ctx.secure })] };
    }
  }
  if (path === "/api/auth/dev-login" && method === "POST") {
    if (!devLoginAllowed(ctx.env)) return { status: 403, json: { error: "\uB370\uBAA8 \uB85C\uADF8\uC778\uC774 \uBE44\uD65C\uC131\uD654\uB418\uC5B4 \uC788\uC5B4\uC694." } };
    const body = await ctx.readJson();
    const provider = String(body.provider || "");
    if (!PROVIDERS[provider]) return { status: 400, json: { error: "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uB85C\uADF8\uC778 \uBC29\uC2DD\uC774\uC5D0\uC694." } };
    const name = String(body.name || "").trim().slice(0, 20);
    const email = String(body.email || "").trim().slice(0, 60).toLowerCase();
    if (!name) return { status: 400, json: { error: "\uC774\uB984\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694." } };
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
  if (path === "/api/admin/login" && method === "POST") {
    const setting = await adminPasswordSetting(ctx);
    if (!setting && !ctx.env.ADMIN_PASSWORD) return { status: 503, json: { error: "\uAD00\uB9AC\uC790 \uB85C\uADF8\uC778\uC774 \uC544\uC9C1 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." } };
    const body = await ctx.readJson();
    const supplied = String(body.password || "");
    if (!await verifyAdminPassword(ctx, supplied)) return { status: 401, json: { error: "\uAD00\uB9AC\uC790 \uBE44\uBC00\uBC88\uD638\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." } };
    const adminUser = { id: "admin:password", role: "admin" };
    return {
      status: 200,
      json: { user: { id: adminUser.id, name: "\uAD00\uB9AC\uC790", role: "admin", plan: "pro", provider: "password" } },
      cookies: [await issueSession(ctx, adminUser)]
    };
  }
  if (path === "/api/admin/password" && method === "POST") {
    const admin = await currentSessionUser(ctx);
    if (admin?.role !== "admin") return { status: 403, json: { error: "\uAD00\uB9AC\uC790\uB9CC \uBE44\uBC00\uBC88\uD638\uB97C \uBCC0\uACBD\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." } };
    if (typeof store(ctx).putSetting !== "function") return { status: 503, json: { error: "\uBE44\uBC00\uBC88\uD638 \uC800\uC7A5\uC18C\uAC00 \uC900\uBE44\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." } };
    const body = await ctx.readJson();
    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");
    if (!await verifyAdminPassword(ctx, currentPassword)) return { status: 401, json: { error: "\uD604\uC7AC \uBE44\uBC00\uBC88\uD638\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." } };
    if (newPassword.length < 16 || newPassword.length > 128) return { status: 400, json: { error: "\uC0C8 \uBE44\uBC00\uBC88\uD638\uB294 16\uC790 \uC774\uC0C1 128\uC790 \uC774\uD558\uB85C \uC124\uC815\uD574 \uC8FC\uC138\uC694." } };
    if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      return { status: 400, json: { error: "\uC601\uBB38 \uB300\uBB38\uC790\xB7\uC18C\uBB38\uC790, \uC22B\uC790, \uD2B9\uC218\uBB38\uC790\uB97C \uAC01\uAC01 1\uAC1C \uC774\uC0C1 \uD3EC\uD568\uD574 \uC8FC\uC138\uC694." } };
    }
    const salt = randomId(32);
    await store(ctx).putSetting("admin_password", {
      algorithm: "HMAC-SHA256-PEPPERED",
      salt,
      hash: await deriveAdminPasswordHash(ctx, newPassword, salt),
      updatedAt: Date.now()
    });
    return { status: 200, json: { ok: true } };
  }
  if (path === "/api/billing/subscribe" && method === "POST") {
    const user = await currentSessionUser(ctx);
    if (!user) return { status: 401, json: { error: "\uB85C\uADF8\uC778 \uD6C4 \uC774\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694." } };
    if (!demoBillingAllowed(ctx.env)) return { status: 409, json: { error: "\uACB0\uC81C\uCC3D\uC5D0\uC11C \uCE74\uB4DC \uB4F1\uB85D\uC744 \uBA3C\uC800 \uC644\uB8CC\uD574 \uC8FC\uC138\uC694." } };
    user.plan = "pro";
    user.proSince = user.proSince || Date.now();
    user.subscriptionStatus = "active";
    user.currentPeriodEnd = addBillingMonth(Date.now());
    await store(ctx).putUser(user);
    return { status: 200, json: { user: publicUser(user) } };
  }
  if (path === "/api/billing/config" && method === "GET") {
    const user = await currentSessionUser(ctx);
    if (!user) return { status: 401, json: { error: "\uB85C\uADF8\uC778 \uD6C4 \uC774\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694." } };
    const config = billingConfig(ctx.env);
    const customerKey = await ensureCustomerKey(ctx, user);
    return { status: 200, json: { configured: config.configured, clientKey: config.configured ? config.clientKey : null, customerKey, demo: demoBillingAllowed(ctx.env) } };
  }
  if (path === "/api/billing/activate" && method === "POST") {
    const user = await currentSessionUser(ctx);
    if (!user) return { status: 401, json: { error: "\uB85C\uADF8\uC778 \uD6C4 \uC774\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694." } };
    const body = await ctx.readJson();
    const authKey = String(body.authKey || "");
    const customerKey = String(body.customerKey || "");
    if (!authKey || !customerKey || customerKey !== user.customerKey) return { status: 400, json: { error: "\uC790\uB3D9\uACB0\uC81C \uC778\uC99D \uC815\uBCF4\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." } };
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
    if (!user) return { status: 401, json: { error: "\uB85C\uADF8\uC778 \uD6C4 \uC774\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694." } };
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
    if (user?.role !== "admin") return { status: 403, json: { error: "\uAD00\uB9AC\uC790\uB9CC \uBCFC \uC218 \uC788\uC5B4\uC694." } };
    const users = await store(ctx).listUsers();
    users.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    return { status: 200, json: { users: users.map(publicUser) } };
  }
  if (path === "/api/admin/users/update" && method === "POST") {
    const admin = await currentSessionUser(ctx);
    if (admin?.role !== "admin") return { status: 403, json: { error: "\uAD00\uB9AC\uC790\uB9CC \uC218\uC815\uD560 \uC218 \uC788\uC5B4\uC694." } };
    const body = await ctx.readJson();
    const target = await store(ctx).getUser(String(body.id || ""));
    if (!target) return { status: 404, json: { error: "\uD68C\uC6D0\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694." } };
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
__name(handleAccountApi, "handleAccountApi");
async function renewDueSubscriptions({ env, store: userStore, now = Date.now() }) {
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
__name(renewDueSubscriptions, "renewDueSubscriptions");
function parseCookies(header) {
  const cookies = {};
  String(header || "").split(";").forEach((part) => {
    const index = part.indexOf("=");
    if (index > 0) cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  });
  return cookies;
}
__name(parseCookies, "parseCookies");
var memoryUsers = /* @__PURE__ */ new Map();
var memorySettings = /* @__PURE__ */ new Map();
function createKvStore(kv) {
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
      async getSetting(name) {
        return memorySettings.get(name) || null;
      },
      async putSetting(name, value) {
        memorySettings.set(name, value);
      }
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
        cursor = page.list_complete ? void 0 : page.cursor;
      } while (cursor);
      return users;
    },
    async getSetting(name) {
      return kv.get(`setting:${name}`, "json");
    },
    async putSetting(name, value) {
      await kv.put(`setting:${name}`, JSON.stringify(value));
    }
  };
}
__name(createKvStore, "createKvStore");

// worker.mjs
function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}
__name(json, "json");
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
__name(accountResultToResponse, "accountResultToResponse");
var CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://js.tosspayments.com",
  "style-src 'self' 'unsafe-inline' https://fastly.jsdelivr.net",
  "font-src 'self' data: https://fastly.jsdelivr.net",
  "img-src 'self' data: https:",
  "connect-src 'self' https://*.tosspayments.com",
  "frame-src https://*.tosspayments.com",
  "upgrade-insecure-requests"
].join("; ");
function secureResponse(response) {
  const secured = new Response(response.body, response);
  secured.headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  secured.headers.set("Referrer-Policy", "no-referrer");
  secured.headers.set("X-Content-Type-Options", "nosniff");
  secured.headers.set("X-Frame-Options", "DENY");
  secured.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(self)");
  secured.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  if (secured.headers.get("Content-Type")?.includes("text/html")) {
    secured.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  }
  return secured;
}
__name(secureResponse, "secureResponse");
var FUNNEL_STEPS = /* @__PURE__ */ new Set(["step1_enter", "step2_enter", "step3_enter", "step4_enter", "trial_start"]);
function funnelDateKey(now = Date.now()) {
  return new Date(now + 9 * 60 * 60 * 1e3).toISOString().slice(0, 10);
}
__name(funnelDateKey, "funnelDateKey");
async function recordFunnelEvent({ step, kv, now = Date.now() }) {
  const name = String(step || "").replace(/^funnel:/, "");
  if (!FUNNEL_STEPS.has(name)) return null;
  const key = `funnel:${funnelDateKey(now)}`;
  let counts = {};
  try {
    counts = JSON.parse(await kv.get(key) || "{}") || {};
  } catch (error) {
    counts = {};
  }
  counts[name] = Number(counts[name] || 0) + 1;
  await kv.put(key, JSON.stringify(counts), { expirationTtl: 60 * 60 * 24 * 90 });
  return { key, counts };
}
__name(recordFunnelEvent, "recordFunnelEvent");
async function createGoalPlanForUser({ input, env, userStore, user, generatePlan = createAiGoalPlan, now = Date.now() }) {
  const hasTrialLimit = user && user.role !== "admin" && user.plan !== "pro";
  if (hasTrialLimit && user.goalPlanGeneratedAt) {
    const error = new Error("\uBB34\uB8CC \uCCB4\uD5D8\uC5D0\uC11C\uB294 AI \uBAA9\uD45C \uACC4\uD68D\uC744 1\uAC1C \uB9CC\uB4E4 \uC218 \uC788\uC5B4\uC694. \uAE30\uC874 \uACC4\uD68D\uC744 \uC571\uC5D0\uC11C \uC774\uC5B4\uAC00 \uC8FC\uC138\uC694.");
    error.status = 409;
    error.code = "GOAL_PLAN_LIMIT_REACHED";
    throw error;
  }
  const result = await generatePlan(input, {
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL || "gpt-5.4-mini"
  });
  if (hasTrialLimit) {
    user.goalPlanGeneratedAt = now;
    await userStore.putUser(user);
  }
  return result;
}
__name(createGoalPlanForUser, "createGoalPlanForUser");
async function handleFetch(request, env) {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) {
    const origin = request.headers.get("origin");
    if (origin && origin !== url.origin) return json({ error: "\uD5C8\uC6A9\uB418\uC9C0 \uC54A\uC740 \uC694\uCCAD \uCD9C\uCC98\uC785\uB2C8\uB2E4." }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: "GET, POST, OPTIONS" } });
  }
  const cookies = parseCookies(request.headers.get("cookie"));
  const accountContext = {
    method: request.method,
    url,
    secure: url.protocol === "https:",
    getCookie: /* @__PURE__ */ __name((name) => cookies[name], "getCookie"),
    readJson: /* @__PURE__ */ __name(() => request.json().catch(() => ({})), "readJson"),
    env,
    store: createKvStore(env.USERS_KV)
  };
  if (url.pathname === "/admin.html" || url.pathname === "/admin") {
    if (!env.USERS_KV) return json({ error: "USERS_KV \uBC14\uC778\uB529\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." }, 503);
    try {
      const user = await currentSessionUser(accountContext);
      if (user?.role !== "admin") {
        const location = user ? "/app.html?admin=denied" : "/app.html?auth=login&redirect=admin";
        return Response.redirect(new URL(location, url.origin), 302);
      }
      if (url.pathname === "/admin") return Response.redirect(new URL("/admin.html", url.origin), 302);
    } catch (error) {
      console.error("Admin access check failed", error);
      return json({ error: "\uAD00\uB9AC\uC790 \uC811\uADFC\uC744 \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." }, 500);
    }
  }
  if (url.pathname.startsWith("/api/auth/") || url.pathname.startsWith("/api/billing/") || url.pathname.startsWith("/api/admin/")) {
    if (!env.USERS_KV && url.pathname !== "/api/auth/providers") return json({ error: "\uD68C\uC6D0 \uC800\uC7A5\uC18C \uC124\uC815\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." }, 503);
    try {
      if (url.pathname === "/api/admin/login" && request.method === "POST" && env.AI_RATE_LIMITER) {
        const actor = request.headers.get("cf-connecting-ip") || "anonymous";
        const { success } = await env.AI_RATE_LIMITER.limit({ key: `admin-login:${actor}` });
        if (!success) return json({ error: "\uB85C\uADF8\uC778 \uC2DC\uB3C4\uAC00 \uC7A0\uC2DC \uB9CE\uC2B5\uB2C8\uB2E4. 1\uBD84 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694." }, 429);
      }
      const result = await handleAccountApi(accountContext);
      if (result) return accountResultToResponse(result);
      return json({ error: "\uC694\uCCAD\uC744 \uCC98\uB9AC\uD560 \uC218 \uC5C6\uC5B4\uC694." }, 404);
    } catch (error) {
      console.error("Account API failed", error);
      return json({ error: "\uC694\uCCAD \uCC98\uB9AC \uC911 \uBB38\uC81C\uAC00 \uC0DD\uACBC\uC5B4\uC694." }, 500);
    }
  }
  if (url.pathname === "/api/ai/goal-plan") {
    if (request.method !== "POST") return json({ error: "POST \uC694\uCCAD\uB9CC \uC0AC\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694." }, 405);
    if (!env.USERS_KV) return json({ error: "\uD68C\uC6D0 \uC800\uC7A5\uC18C \uC124\uC815\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." }, 503);
    const userStore = createKvStore(env.USERS_KV);
    const user = await currentSessionUser({ ...accountContext, store: userStore });
    if (!user) return json({ error: "\uB85C\uADF8\uC778 \uD6C4 AI \uAE30\uB2A5\uC744 \uC774\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694." }, 401);
    if (env.AI_RATE_LIMITER) {
      const actor = `${user.id}:${request.headers.get("cf-connecting-ip") || "unknown"}`;
      const { success } = await env.AI_RATE_LIMITER.limit({ key: `goal-plan:${actor}` });
      if (!success) return json({ error: "AI \uC694\uCCAD\uC774 \uC7A0\uC2DC \uB9CE\uC544\uC694. 1\uBD84 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694." }, 429);
    }
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 5e4) return json({ error: "\uC694\uCCAD \uB0B4\uC6A9\uC774 \uB108\uBB34 \uCEE4\uC694." }, 413);
    try {
      const input = await request.json();
      const result = await createGoalPlanForUser({ input, env, userStore, user });
      return json(result);
    } catch (error) {
      console.error("AI goal plan request failed", error);
      const message = error.status === 503 ? "\uC62C\uB9AC\uAC00 \uACC4\uD68D\uC744 \uC900\uBE44\uD558\uB294 \uB3D9\uC548 \uC5F0\uACB0\uC774 \uC9C0\uC5F0\uB418\uACE0 \uC788\uC5B4\uC694." : error.message || "AI \uACC4\uD68D\uC744 \uB9CC\uB4E4\uC9C0 \uBABB\uD588\uC5B4\uC694.";
      return json({ error: message, code: error.code || void 0 }, error.status || 500);
    }
  }
  if (url.pathname === "/api/ai/companion-chat") {
    if (request.method !== "POST") return json({ error: "POST \uC694\uCCAD\uB9CC \uC0AC\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694." }, 405);
    if (!env.USERS_KV) return json({ error: "\uD68C\uC6D0 \uC800\uC7A5\uC18C \uC124\uC815\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." }, 503);
    const user = await currentSessionUser(accountContext);
    if (!user) return json({ error: "\uB85C\uADF8\uC778 \uD6C4 AI \uAE30\uB2A5\uC744 \uC774\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694." }, 401);
    if (env.AI_RATE_LIMITER) {
      const actor = `${user.id}:${request.headers.get("cf-connecting-ip") || "unknown"}`;
      const { success } = await env.AI_RATE_LIMITER.limit({ key: `companion-chat:${actor}` });
      if (!success) return json({ error: "\uC62C\uB9AC\uAC00 \uC7A0\uC2DC \uBC14\uBE60\uC694. 1\uBD84 \uD6C4 \uB2E4\uC2DC \uB9D0 \uAC78\uC5B4\uC8FC\uC138\uC694." }, 429);
    }
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 5e3) return json({ error: "\uBA54\uC2DC\uC9C0\uAC00 \uB108\uBB34 \uAE38\uC5B4\uC694." }, 413);
    try {
      const input = await request.json();
      const result = await createCompanionReply(input, {
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL || "gpt-5.4-mini"
      });
      return json(result);
    } catch (error) {
      console.error("Companion chat request failed", error);
      return json({ error: error.message || "\uC62C\uB9AC\uC758 \uB2F5\uC744 \uB9CC\uB4E4\uC9C0 \uBABB\uD588\uC5B4\uC694." }, error.status || 500);
    }
  }
  if (url.pathname === "/api/ai/plan-revision") {
    if (request.method !== "POST") return json({ error: "POST \uC694\uCCAD\uB9CC \uC0AC\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694." }, 405);
    if (!env.USERS_KV) return json({ error: "\uD68C\uC6D0 \uC800\uC7A5\uC18C \uC124\uC815\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." }, 503);
    const user = await currentSessionUser(accountContext);
    if (!user) return json({ error: "\uB85C\uADF8\uC778 \uD6C4 AI \uAE30\uB2A5\uC744 \uC774\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694." }, 401);
    if (env.AI_RATE_LIMITER) {
      const actor = `${user.id}:${request.headers.get("cf-connecting-ip") || "unknown"}`;
      const { success } = await env.AI_RATE_LIMITER.limit({ key: `plan-revision:${actor}` });
      if (!success) return json({ error: "AI \uC218\uC815 \uC694\uCCAD\uC774 \uC7A0\uC2DC \uB9CE\uC544\uC694. 1\uBD84 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694." }, 429);
    }
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 2e4) return json({ error: "\uC218\uC815 \uC694\uCCAD \uB0B4\uC6A9\uC774 \uB108\uBB34 \uCEE4\uC694." }, 413);
    try {
      const input = await request.json();
      const result = await createAiPlanRevision(input, {
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL || "gpt-5.4-mini"
      });
      return json(result);
    } catch (error) {
      console.error("AI plan revision request failed", error);
      return json({ error: error.message || "AI \uBCC0\uACBD\uC548\uC744 \uB9CC\uB4E4\uC9C0 \uBABB\uD588\uC5B4\uC694." }, error.status || 500);
    }
  }
  if (url.pathname === "/api/funnel") {
    if (request.method !== "POST") return json({ error: "POST \uC694\uCCAD\uB9CC \uC0AC\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694." }, 405);
    try {
      const body = await request.json().catch(() => ({}));
      if (env.USERS_KV) await recordFunnelEvent({ step: body.step, kv: env.USERS_KV });
    } catch (error) {
      console.error("Funnel event failed", error);
    }
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
  return env.ASSETS.fetch(request);
}
__name(handleFetch, "handleFetch");
var worker_default = {
  async fetch(request, env) {
    return secureResponse(await handleFetch(request, env));
  },
  async scheduled(_controller, env, ctx) {
    if (!env.USERS_KV) return;
    ctx.waitUntil(
      renewDueSubscriptions({ env, store: createKvStore(env.USERS_KV) }).then((result) => console.log("Subscription renewal completed", result))
    );
  }
};
export {
  createGoalPlanForUser,
  worker_default as default,
  recordFunnelEvent
};
//# sourceMappingURL=worker.js.map
