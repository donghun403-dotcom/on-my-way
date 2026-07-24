export const MATERIAL_RULES = Object.freeze({
  MATERIAL_RANGE_AMBIGUOUS: Object.freeze({ classification: "SOFT" }),
  MATERIAL_UNIT_UNKNOWN: Object.freeze({ classification: "SOFT" }),
  MATERIAL_TARGET_START_INFERRED: Object.freeze({ classification: "SOFT" }),
  MATERIAL_RANGE_REVERSED: Object.freeze({ classification: "HARD" }),
  MATERIAL_TARGET_BEFORE_CURRENT: Object.freeze({ classification: "HARD" }),
  MATERIAL_UNIT_MISMATCH: Object.freeze({ classification: "HARD" }),
  MATERIAL_ACTION_RANGE_MISSING: Object.freeze({ classification: "HARD" }),
  MATERIAL_ACTION_RANGE_OUTSIDE_TARGET: Object.freeze({ classification: "HARD" }),
  MATERIAL_ACTION_UNIT_MISMATCH: Object.freeze({ classification: "HARD" }),
  MATERIAL_SOURCE_REFERENCE_MISMATCH: Object.freeze({ classification: "HARD" }),
  SOURCE_REFERENCE_MISSING: Object.freeze({ classification: "HARD" }),
});

const UNIT_ALIASES = Object.freeze([
  ["unit", /\bunits?\b|유닛|단원/i],
  ["page", /\bpages?\b|\bp\.?\s*(?=\d)|페이지|쪽/i],
  ["lecture", /\blectures?\b|강의|강(?=\s*\d|\s*$)/i],
  ["chapter", /\bchapters?\b|\bchap\.?\b|장(?=\s*\d|\s*$)/i],
  ["item", /\bitems?\b|문제|항목|개(?=\s*\d|\s*$)/i],
]);

const MATERIAL_UNIT_LABELS = Object.freeze({
  unit: "Unit",
  page: "페이지",
  lecture: "강의",
  chapter: "장",
  item: "항목",
});

function cleanText(value, maxLength = 240) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function unitTypeFrom(...values) {
  const text = values.map((value) => cleanText(value, 200)).filter(Boolean).join(" ");
  for (const [unitType, pattern] of UNIT_ALIASES) {
    if (pattern.test(text)) return unitType;
  }
  return text ? "custom" : "unknown";
}

function resolvedUnitType(detected, fallback) {
  return ["unknown", "custom"].includes(detected) ? fallback : detected;
}

function numericPositions(value) {
  return [...cleanText(value, 240).matchAll(/(?:^|[^\d])(\d{1,7})(?=$|[^\d])/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite)
    .slice(0, 3);
}

function containsReviewIntent(...values) {
  return /복습|다시\s*(?:보기|읽기|풀기|듣기)|review/i.test(values.map((value) => cleanText(value)).join(" "));
}

function canonicalSourceKey(value) {
  return cleanText(value, 200).toLocaleLowerCase("en-US");
}

function formatMaterialRange(unitLabel, start, end) {
  return start === end ? `${unitLabel} ${start}` : `${unitLabel} ${start}~${end}`;
}

function partitionInclusive(start, end, count) {
  const unitCount = end - start + 1;
  const partitionCount = Math.max(0, Math.min(unitCount, Math.floor(Number(count) || 0)));
  if (!partitionCount) return [];
  const quotient = Math.floor(unitCount / partitionCount);
  const remainder = unitCount % partitionCount;
  let cursor = start;
  return Array.from({ length: partitionCount }, (_, index) => {
    const span = quotient + (index < remainder ? 1 : 0);
    const partition = { start: cursor, end: cursor + span - 1 };
    cursor += span;
    return partition;
  });
}

function parsedActionRange(material, action) {
  const target = material?.semanticRange || {};
  const actionRange = normalizeMaterialContract({
    hasMaterial: true,
    name: material?.sourceDisplayText,
    targetRange: action?.quantityOrRange,
    unit: target.unitType,
  }).semanticRange;
  return {
    start: Number.isFinite(actionRange.targetStart)
      ? actionRange.targetStart
      : actionRange.targetEnd,
    end: actionRange.targetEnd,
  };
}

export function buildMaterialOccurrenceContract(material = {}, occurrenceCount = 0) {
  const normalized = material?.semanticRange ? material : normalizeMaterialContract(material);
  const range = normalized?.semanticRange || {};
  const unitLabel = MATERIAL_UNIT_LABELS[range.unitType];
  const count = Math.max(0, Math.floor(Number(occurrenceCount) || 0));
  if (
    normalized?.hasMaterial !== true
    || !unitLabel
    || !["progression", "review"].includes(range.mode)
    || !Number.isInteger(range.targetStart)
    || !Number.isInteger(range.targetEnd)
    || range.targetStart > range.targetEnd
    || count === 0
  ) {
    return { mode: String(range.mode || "ambiguous"), allocations: [] };
  }

  const unitCount = range.targetEnd - range.targetStart + 1;
  if (range.mode === "progression") {
    const actionPartitions = partitionInclusive(
      range.targetStart,
      range.targetEnd,
      Math.min(count, unitCount),
    );
    const allocations = actionPartitions.map(({ start, end }) => ({
      type: "ACTION",
      start,
      end,
      quantityOrRange: formatMaterialRange(unitLabel, start, end),
      reviewPass: 0,
    }));
    for (let index = actionPartitions.length; index < count; index += 1) {
      const reviewIndex = index - actionPartitions.length;
      const unit = range.targetStart + (reviewIndex % unitCount);
      allocations.push({
        type: "REVIEW",
        start: unit,
        end: unit,
        quantityOrRange: formatMaterialRange(unitLabel, unit, unit),
        reviewPass: Math.floor(reviewIndex / unitCount) + 1,
      });
    }
    return { mode: range.mode, allocations };
  }

  if (count <= unitCount) {
    return {
      mode: range.mode,
      allocations: partitionInclusive(range.targetStart, range.targetEnd, count)
        .map(({ start, end }) => ({
          type: "ACTION",
          start,
          end,
          quantityOrRange: formatMaterialRange(unitLabel, start, end),
          reviewPass: 1,
        })),
    };
  }

  return {
    mode: range.mode,
    allocations: Array.from({ length: count }, (_, index) => {
      const unit = range.targetStart + (index % unitCount);
      return {
        type: "ACTION",
        start: unit,
        end: unit,
        quantityOrRange: formatMaterialRange(unitLabel, unit, unit),
        reviewPass: Math.floor(index / unitCount) + 1,
      };
    }),
  };
}

export function validateMaterialScheduleContract(material = {}, scheduleOccurrences = []) {
  const normalized = material?.semanticRange ? material : normalizeMaterialContract(material);
  const range = normalized?.semanticRange || {};
  if (
    normalized?.hasMaterial !== true
    || !["progression", "review"].includes(range.mode)
    || !Number.isInteger(range.targetStart)
    || !Number.isInteger(range.targetEnd)
    || range.targetStart > range.targetEnd
  ) {
    return [];
  }

  const actions = (Array.isArray(scheduleOccurrences) ? scheduleOccurrences : [])
    .flatMap((day) => Array.isArray(day?.items) ? day.items : [])
    .filter((item) => item?.type === "ACTION");
  if (!actions.length) return ["MATERIAL_TARGET_COVERAGE_INCOMPLETE"];
  if (range.mode === "progression" && actions.length > range.targetEnd - range.targetStart + 1) {
    return ["MATERIAL_SCHEDULE_SEQUENCE_INVALID"];
  }

  const expected = buildMaterialOccurrenceContract(normalized, actions.length).allocations;
  const actual = actions.map((item) => parsedActionRange(normalized, item));
  const sequenceInvalid = (
    expected.length !== actual.length
    || actual.some(({ start, end }, index) => (
      !Number.isInteger(start)
      || !Number.isInteger(end)
      || start !== expected[index]?.start
      || end !== expected[index]?.end
    ))
  );
  const unitCount = range.targetEnd - range.targetStart + 1;
  const progressionCoverageIncomplete = range.mode === "progression" && (
    actual[0]?.start !== range.targetStart
    || actual.at(-1)?.end !== range.targetEnd
    || actual.some((current, index) => (
      index > 0 && current.start !== actual[index - 1].end + 1
    ))
  );
  const reviewCoverageIncomplete = range.mode === "review" && (
    actions.length <= unitCount
      ? actual[0]?.start !== range.targetStart || actual.at(-1)?.end !== range.targetEnd
      : actual.slice(0, unitCount).some((current, index) => (
          current.start !== range.targetStart + index || current.end !== current.start
        ))
  );
  return [
    ...(sequenceInvalid ? ["MATERIAL_SCHEDULE_SEQUENCE_INVALID"] : []),
    ...(progressionCoverageIncomplete || reviewCoverageIncomplete
      ? ["MATERIAL_TARGET_COVERAGE_INCOMPLETE"]
      : []),
  ];
}

export function normalizeMaterialContract(material = {}) {
  const hasMaterial = material?.hasMaterial === true;
  const sourceDisplayText = cleanText(material?.name || material?.sourceDisplayText, 200);
  const currentText = cleanText(material?.currentProgress, 200);
  const targetText = cleanText(material?.targetRange, 200);
  const explicitUnit = cleanText(material?.unit, 80);
  if (!hasMaterial) {
    return {
      hasMaterial: false,
      sourceId: "",
      sourceKey: "",
      sourceDisplayText: "",
      completionRule: "",
      semanticRange: {
        unitType: "unknown",
        currentPosition: null,
        currentState: "unknown",
        targetStart: null,
        targetEnd: null,
        inclusive: true,
        mode: "ambiguous",
        displayText: "",
      },
    };
  }

  const currentNumbers = numericPositions(currentText);
  const targetNumbers = numericPositions(targetText);
  const explicitlyNotStarted = /시작\s*전|미시작|not\s*started/i.test(currentText);
  const currentPosition = explicitlyNotStarted ? null : (currentNumbers.length ? currentNumbers.at(-1) : null);
  const currentState = explicitlyNotStarted
    ? "not_started"
    : currentPosition === null
      ? "unknown"
    : (/완료|까지|through|finished/i.test(currentText) ? "completed_through" : "in_progress");
  const explicitUnitType = unitTypeFrom(explicitUnit);
  const currentDetectedUnitType = unitTypeFrom(currentText);
  const targetDetectedUnitType = unitTypeFrom(targetText);
  const currentUnitType = resolvedUnitType(currentDetectedUnitType, explicitUnitType);
  const targetUnitType = resolvedUnitType(targetDetectedUnitType, explicitUnitType);
  const unitType = resolvedUnitType(
    targetDetectedUnitType,
    resolvedUnitType(currentDetectedUnitType, explicitUnitType),
  );
  const mode = containsReviewIntent(currentText, targetText, material?.completionRule)
    ? "review"
    : targetNumbers.length
      ? "progression"
      : "ambiguous";

  let targetStart = targetNumbers.length >= 2 ? targetNumbers[0] : null;
  const targetEnd = targetNumbers.length ? targetNumbers.at(-1) : null;
  let targetStartInferred = false;
  if (targetStart === null && targetEnd !== null && currentState === "not_started" && mode === "progression") {
    targetStart = 1;
    targetStartInferred = true;
  }
  if (targetStart === null && targetEnd !== null && currentPosition !== null && mode === "progression") {
    targetStart = currentState === "completed_through" ? currentPosition + 1 : currentPosition;
    targetStartInferred = true;
  }
  if (
    mode === "progression"
    && currentState === "completed_through"
    && Number.isFinite(currentPosition)
    && Number.isFinite(targetStart)
    && Number.isFinite(targetEnd)
    && targetStart <= currentPosition
    && targetEnd > currentPosition
  ) {
    targetStart = currentPosition + 1;
    targetStartInferred = true;
  }

  return {
    hasMaterial: true,
    sourceId: "primary",
    sourceKey: canonicalSourceKey(sourceDisplayText),
    sourceDisplayText,
    completionRule: cleanText(material?.completionRule, 300),
    semanticRange: {
      unitType,
      currentUnitType,
      targetUnitType,
      currentPosition,
      currentState,
      currentDisplayText: currentText,
      targetStart,
      targetEnd,
      targetStartInferred,
      inclusive: true,
      mode,
      displayText: targetText,
    },
  };
}

export function validateMaterialContract(material = {}) {
  if (material?.hasMaterial !== true) return { hard: [], soft: [] };
  const range = material.semanticRange || {};
  const hard = [];
  const soft = [];

  if (!material.sourceKey || !material.sourceDisplayText) hard.push("SOURCE_REFERENCE_MISSING");
  if (range.unitType === "unknown" || range.unitType === "custom") soft.push("MATERIAL_UNIT_UNKNOWN");
  if (range.mode === "ambiguous" || range.targetEnd === null) soft.push("MATERIAL_RANGE_AMBIGUOUS");
  if (range.targetStartInferred) soft.push("MATERIAL_TARGET_START_INFERRED");
  if (
    range.currentUnitType
    && range.targetUnitType
    && !["unknown", "custom"].includes(range.currentUnitType)
    && !["unknown", "custom"].includes(range.targetUnitType)
    && range.currentUnitType !== range.targetUnitType
  ) {
    hard.push("MATERIAL_UNIT_MISMATCH");
  }
  if (Number.isFinite(range.targetStart) && Number.isFinite(range.targetEnd) && range.targetStart > range.targetEnd) {
    hard.push("MATERIAL_RANGE_REVERSED");
  }
  if (
    range.mode === "progression"
    && Number.isFinite(range.currentPosition)
    && Number.isFinite(range.targetEnd)
    && range.targetEnd <= range.currentPosition
  ) {
    hard.push("MATERIAL_TARGET_BEFORE_CURRENT");
  }
  return {
    hard: [...new Set(hard)],
    soft: [...new Set(soft)],
  };
}

export function validateMaterialActionContract(material = {}, action = {}) {
  const normalized = material?.semanticRange ? material : normalizeMaterialContract(material);
  if (!normalized.hasMaterial) return [];
  const target = normalized.semanticRange || {};
  if (!Number.isFinite(target.targetEnd)) return [];

  const actionRange = normalizeMaterialContract({
    hasMaterial: true,
    name: normalized.sourceDisplayText,
    targetRange: action.quantityOrRange,
    unit: target.unitType,
  }).semanticRange;
  const actionStart = Number.isFinite(actionRange.targetStart)
    ? actionRange.targetStart
    : actionRange.targetEnd;
  const actionEnd = actionRange.targetEnd;
  const rules = [];
  if (!Number.isFinite(actionStart) || !Number.isFinite(actionEnd)) {
    rules.push("MATERIAL_ACTION_RANGE_MISSING");
  }
  if (
    !["unknown", "custom"].includes(String(target.unitType || "unknown"))
    && !["unknown", "custom"].includes(String(actionRange.targetUnitType || actionRange.unitType || "unknown"))
    && (actionRange.targetUnitType || actionRange.unitType) !== target.unitType
  ) {
    rules.push("MATERIAL_ACTION_UNIT_MISMATCH");
  }
  if (
    Number.isFinite(actionStart)
    && Number.isFinite(actionEnd)
    && (
      (Number.isFinite(target.targetStart) && actionStart < target.targetStart)
      || actionEnd > target.targetEnd
    )
  ) {
    rules.push("MATERIAL_ACTION_RANGE_OUTSIDE_TARGET");
  }
  return [...new Set(rules)];
}

export function materialSemanticHashInput(material = {}) {
  const normalized = material?.semanticRange ? material : normalizeMaterialContract(material);
  if (!normalized.hasMaterial) return { hasMaterial: false };
  const range = normalized.semanticRange || {};
  const ambiguousSemanticKey = (
    range.mode === "ambiguous"
    || ["unknown", "custom"].includes(String(range.unitType || "unknown"))
  )
    ? canonicalSourceKey([
      normalized.currentProgress,
      range.displayText,
      normalized.targetRange,
    ].filter(Boolean).join("|"))
    : "";
  return {
    hasMaterial: true,
    sourceId: normalized.sourceId || "primary",
    sourceKey: canonicalSourceKey(normalized.sourceKey || normalized.sourceDisplayText),
    completionRule: cleanText(normalized.completionRule, 300),
    semanticRange: {
      unitType: String(range.unitType || "unknown"),
      currentPosition: Number.isFinite(range.currentPosition) ? range.currentPosition : null,
      currentState: String(range.currentState || "unknown"),
      currentSemanticKey: Number.isFinite(range.currentPosition)
        ? ""
        : canonicalSourceKey(range.currentDisplayText),
      targetStart: Number.isFinite(range.targetStart) ? range.targetStart : null,
      targetEnd: Number.isFinite(range.targetEnd) ? range.targetEnd : null,
      inclusive: range.inclusive !== false,
      mode: String(range.mode || "ambiguous"),
      ambiguousSemanticKey,
    },
  };
}
