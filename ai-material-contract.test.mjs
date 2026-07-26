import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMaterialOccurrenceContract,
  materialSemanticHashInput,
  normalizeMaterialContract,
  validateMaterialActionContract,
  validateMaterialContract,
  validateMaterialScheduleContract,
} from "./ai-material-contract.mjs";

function normalized(currentProgress, targetRange, unit = "") {
  return normalizeMaterialContract({
    hasMaterial: true,
    name: "Fixture Book",
    currentProgress,
    targetRange,
    unit,
    completionRule: "범위를 끝내면 완료",
  });
}

test("자료 단위와 현재·목표 범위를 구조화한다", () => {
  const cases = [
    ["Unit 12까지 완료", "Unit 13~30", "unit", 12, 13, 30],
    ["0쪽", "Page 1-100", "page", 0, 1, 100],
    ["Lecture 2 완료", "강의 3~10", "lecture", 2, 3, 10],
  ];
  for (const [current, target, unitType, currentPosition, targetStart, targetEnd] of cases) {
    const material = normalized(current, target);
    assert.equal(material.semanticRange.unitType, unitType);
    assert.equal(material.semanticRange.currentPosition, currentPosition);
    assert.equal(material.semanticRange.targetStart, targetStart);
    assert.equal(material.semanticRange.targetEnd, targetEnd);
    assert.deepEqual(validateMaterialContract(material).hard, []);
  }
});

test("역전 범위와 복습 의도 없는 이전 범위만 hard rule로 거부한다", () => {
  const reversed = normalized("Unit 2 완료", "Unit 10~3");
  assert.deepEqual(validateMaterialContract(reversed).hard, ["MATERIAL_RANGE_REVERSED"]);

  const prior = normalized("Unit 12 완료", "Unit 1~10");
  assert.deepEqual(validateMaterialContract(prior).hard, ["MATERIAL_TARGET_BEFORE_CURRENT"]);

  const review = normalized("Unit 12 완료", "복습 Unit 1~10");
  assert.deepEqual(validateMaterialContract(review).hard, []);
  assert.equal(review.semanticRange.mode, "review");
});

test("모호한 범위와 자료 없음은 terminal domain failure가 아니다", () => {
  const ambiguous = normalized("중간 정도", "가능한 만큼", "교재 구간");
  assert.deepEqual(validateMaterialContract(ambiguous).hard, []);
  assert.ok(validateMaterialContract(ambiguous).soft.includes("MATERIAL_RANGE_AMBIGUOUS"));

  const none = normalizeMaterialContract({ hasMaterial: false });
  assert.deepEqual(validateMaterialContract(none), { hard: [], soft: [] });
});

test("동일 의미 표기는 같은 semantic hash input이 된다", () => {
  const first = normalized("Unit 12까지 완료", "Unit 13~30");
  const second = normalized("유닛 12 완료", "유닛 13 - 30");
  assert.deepEqual(materialSemanticHashInput(first), materialSemanticHashInput(second));
});

test("not-started and inferred progression positions are normalized explicitly", () => {
  const notStarted = normalized("Unit 1 시작 전", "Unit 1~12");
  assert.equal(notStarted.semanticRange.currentPosition, null);
  assert.equal(notStarted.semanticRange.currentState, "not_started");

  const notStartedSingleTarget = normalized("not started", "Unit 20");
  assert.equal(notStartedSingleTarget.semanticRange.targetStart, 1);
  assert.equal(notStartedSingleTarget.semanticRange.targetEnd, 20);
  assert.ok(validateMaterialContract(notStartedSingleTarget).soft.includes("MATERIAL_TARGET_START_INFERRED"));

  const inferred = normalized("Unit 12까지 완료", "Unit 30");
  assert.equal(inferred.semanticRange.targetStart, 13);
  assert.equal(inferred.semanticRange.targetEnd, 30);
  assert.ok(validateMaterialContract(inferred).soft.includes("MATERIAL_TARGET_START_INFERRED"));
});

test("completed progress trims an overlapping progression target but leaves explicit review ranges intact", () => {
  const progression = normalized("Unit 12까지 완료", "Unit 1~60");
  assert.equal(progression.semanticRange.targetStart, 13);
  assert.equal(progression.semanticRange.targetEnd, 60);
  assert.ok(validateMaterialContract(progression).soft.includes("MATERIAL_TARGET_START_INFERRED"));
  assert.deepEqual(
    validateMaterialActionContract(progression, { quantityOrRange: "Unit 1~12" }),
    ["MATERIAL_ACTION_RANGE_OUTSIDE_TARGET"],
  );

  const review = normalized("Unit 12까지 완료", "복습 Unit 1~60");
  assert.equal(review.semanticRange.mode, "review");
  assert.equal(review.semanticRange.targetStart, 1);
  assert.deepEqual(validateMaterialActionContract(review, { quantityOrRange: "Unit 1~12" }), []);
});

test("explicitly different material units are rejected without weakening ambiguous input", () => {
  const mismatch = normalized("Page 12까지 완료", "Unit 13~30", "Unit");
  assert.deepEqual(validateMaterialContract(mismatch).hard, ["MATERIAL_UNIT_MISMATCH"]);

  const missingSource = normalizeMaterialContract({
    hasMaterial: true,
    name: "",
    currentProgress: "Unit 2까지 완료",
    targetRange: "Unit 3~5",
  });
  assert.ok(validateMaterialContract(missingSource).hard.includes("SOURCE_REFERENCE_MISSING"));
});

test("ambiguous progress text participates in semantic identity while equivalent source formatting does not", () => {
  const first = normalized("중간쯤", "가능한 만큼", "교재 구간");
  const second = normalized("첫 절반", "가능한 만큼", "교재 구간");
  assert.notDeepEqual(materialSemanticHashInput(first), materialSemanticHashInput(second));

  const sourceA = normalizeMaterialContract({
    hasMaterial: true,
    name: "  Fixture   Book ",
    currentProgress: "Unit 2 완료",
    targetRange: "Unit 3~5",
  });
  const sourceB = normalizeMaterialContract({
    hasMaterial: true,
    name: "fixture book",
    currentProgress: "유닛 2 완료",
    targetRange: "유닛 3~5",
  });
  assert.deepEqual(materialSemanticHashInput(sourceA), materialSemanticHashInput(sourceB));
});

test("material ACTION ranges must stay inside the requested semantic target", () => {
  const material = normalized("Unit 12까지 완료", "Unit 13~30");
  assert.deepEqual(validateMaterialActionContract(material, { quantityOrRange: "Unit 13~15" }), []);
  assert.deepEqual(
    validateMaterialActionContract(material, { quantityOrRange: "Unit 1~5" }),
    ["MATERIAL_ACTION_RANGE_OUTSIDE_TARGET"],
  );
  assert.deepEqual(
    validateMaterialActionContract(material, { quantityOrRange: "Page 13~15" }),
    ["MATERIAL_ACTION_UNIT_MISMATCH"],
  );
  assert.deepEqual(
    validateMaterialActionContract(material, { quantityOrRange: "첫 구간" }),
    ["MATERIAL_ACTION_RANGE_MISSING"],
  );
});

test("progression allocates each requested unit once and converts surplus slots to REVIEW", () => {
  const material = normalized("Unit 12까지 완료", "Unit 13~15");
  const contract = buildMaterialOccurrenceContract(material, 10);
  assert.deepEqual(
    contract.allocations.map(({ type, quantityOrRange }) => [type, quantityOrRange]),
    [
      ["ACTION", "Unit 13"],
      ["ACTION", "Unit 14"],
      ["ACTION", "Unit 15"],
      ["REVIEW", "Unit 13"],
      ["REVIEW", "Unit 14"],
      ["REVIEW", "Unit 15"],
      ["REVIEW", "Unit 13"],
      ["REVIEW", "Unit 14"],
      ["REVIEW", "Unit 15"],
      ["REVIEW", "Unit 13"],
    ],
  );

  const schedule = [{
    items: contract.allocations.map((allocation) => ({
      type: allocation.type,
      quantityOrRange: allocation.quantityOrRange,
    })),
  }];
  assert.deepEqual(validateMaterialScheduleContract(material, schedule), []);
});

test("progression partitions a larger range into ordered gapless ACTION ranges", () => {
  const material = normalized("Unit 12까지 완료", "Unit 13~20");
  const contract = buildMaterialOccurrenceContract(material, 3);
  assert.deepEqual(
    contract.allocations.map(({ type, quantityOrRange }) => [type, quantityOrRange]),
    [
      ["ACTION", "Unit 13~15"],
      ["ACTION", "Unit 16~18"],
      ["ACTION", "Unit 19~20"],
    ],
  );
  assert.deepEqual(validateMaterialScheduleContract(material, [{
    items: contract.allocations.map((allocation) => ({
      type: allocation.type,
      quantityOrRange: allocation.quantityOrRange,
    })),
  }]), []);
});

test("review mode completes a full deterministic pass before repeating units", () => {
  const material = normalized("Unit 3까지 완료", "복습 Unit 1~3");
  const first = buildMaterialOccurrenceContract(material, 8);
  const second = buildMaterialOccurrenceContract(material, 8);
  assert.deepEqual(second, first);
  assert.deepEqual(
    first.allocations.map(({ type, quantityOrRange, reviewPass }) => [type, quantityOrRange, reviewPass]),
    [
      ["ACTION", "Unit 1", 1],
      ["ACTION", "Unit 2", 1],
      ["ACTION", "Unit 3", 1],
      ["ACTION", "Unit 1", 2],
      ["ACTION", "Unit 2", 2],
      ["ACTION", "Unit 3", 2],
      ["ACTION", "Unit 1", 3],
      ["ACTION", "Unit 2", 3],
    ],
  );
  assert.deepEqual(validateMaterialScheduleContract(material, [{
    items: first.allocations.map((allocation) => ({
      type: allocation.type,
      quantityOrRange: allocation.quantityOrRange,
    })),
  }]), []);
});

test("material schedule validation rejects gaps, repeats, and incomplete coverage", () => {
  const material = normalized("Unit 12까지 완료", "Unit 13~15");
  assert.deepEqual(validateMaterialScheduleContract(material, [{
    items: [
      { type: "ACTION", quantityOrRange: "Unit 13" },
      { type: "ACTION", quantityOrRange: "Unit 15" },
    ],
  }]), [
    "MATERIAL_SCHEDULE_SEQUENCE_INVALID",
    "MATERIAL_TARGET_COVERAGE_INCOMPLETE",
  ]);
  assert.deepEqual(validateMaterialScheduleContract(material, [{
    items: [
      { type: "ACTION", quantityOrRange: "Unit 13" },
      { type: "ACTION", quantityOrRange: "Unit 13" },
      { type: "ACTION", quantityOrRange: "Unit 14~15" },
    ],
  }]), [
    "MATERIAL_SCHEDULE_SEQUENCE_INVALID",
    "MATERIAL_TARGET_COVERAGE_INCOMPLETE",
  ]);
});
