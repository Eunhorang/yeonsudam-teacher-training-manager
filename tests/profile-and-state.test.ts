import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultTrainings, type TrainingRecord } from "@/lib/training-data";
import {
  applyProfileRecommendations,
  createEmptyProfile,
  getSchoolSafetySummary,
  recommendApplicability,
  type DutyCode,
} from "@/lib/training-profile";
import {
  mergeTrainingStates,
  parseTrainingState,
  selectStoredTrainingState,
  STATE_VERSION,
  type TrainingAppState,
} from "@/lib/training-state";

function safetyRecord(year: number, hours: number, status: TrainingRecord["status"] = "completed") {
  const record = createDefaultTrainings(year).find(
    (item) => item.templateKey === "school-safety",
  );
  assert.ok(record);
  return { ...record, title: "사용자가 바꿈 제목", completedHours: hours, status };
}

test("학교안전교육은 제목이 아닌 고정 키로 최근 3개 연도만 합산한다", () => {
  const summary = getSchoolSafetySummary(
    {
      "2023": [safetyRecord(2023, 20)],
      "2024": [safetyRecord(2024, 5)],
      "2025": [safetyRecord(2025, 6)],
      "2026": [safetyRecord(2026, 4)],
    },
    2026,
  );

  assert.equal(summary.startYear, 2024);
  assert.equal(summary.totalHours, 15);
  assert.equal(summary.remainingHours, 0);
  assert.equal(summary.requirementMet, true);
  assert.deepEqual(summary.byYear.map((item) => item.completedHours), [5, 6, 4]);
});

test("해당 없음 기록은 3년 합산에서 빼고 3년 미만 기간제는 확인 모드로 표시한다", () => {
  const profile = {
    ...createEmptyProfile(2026),
    configured: true,
    educationOffice: "seoul" as const,
    schoolType: "public" as const,
    employmentType: "contract-teacher" as const,
    contractUnderThreeYears: true,
  };
  const summary = getSchoolSafetySummary(
    {
      "2024": [safetyRecord(2024, 8)],
      "2025": [safetyRecord(2025, 7, "not-applicable")],
      "2026": [safetyRecord(2026, 7)],
    },
    2026,
    profile,
  );

  assert.equal(summary.totalHours, 15);
  assert.equal(summary.mode, "contract-check");
  assert.equal(summary.requirementMet, false);
});

test("3년 미만 계약이 아닌 기간제 교원은 학교안전 3년 누적을 적용한다", () => {
  const profile = {
    ...createEmptyProfile(2026),
    configured: true,
    educationOffice: "seoul" as const,
    schoolType: "public" as const,
    employmentType: "contract-teacher" as const,
    contractUnderThreeYears: false,
  };

  assert.equal(recommendApplicability("school-safety", profile).decision, "applies");
  assert.equal(getSchoolSafetySummary({}, 2026, profile).mode, "rolling");
});

test("학교안전 동일 연도의 여러 기록을 합산하되 명시적 제외는 빼는다", () => {
  const excluded = {
    ...safetyRecord(2026, 20),
    id: "excluded-safety",
    applicabilityOverride: "not-applicable" as const,
  };
  const summary = getSchoolSafetySummary(
    {
      "2026": [
        { ...safetyRecord(2026, 3), id: "safety-a" },
        excluded,
        { ...safetyRecord(2026, 4), id: "safety-b" },
      ],
    },
    2026,
  );

  assert.equal(summary.totalHours, 7);
});

test("근무 조건은 연수 상태를 덮어쓰지 않고 추천과 담당업무 목록만 추가한다", () => {
  const profile = {
    ...createEmptyProfile(2026),
    configured: true,
    educationOffice: "gyeonggi" as const,
    schoolType: "private" as const,
    employmentType: "regular-teacher" as const,
    handlesPersonalData: true,
    duties: ["learning-support"] as DutyCode[],
  };
  const records = createDefaultTrainings(2026);
  records[0] = { ...records[0], status: "completed", completedHours: 1 };
  const evaluated = applyProfileRecommendations(records, profile, 2026);

  assert.equal(evaluated[0].status, "completed");
  assert.ok(evaluated.some((record) => record.templateKey === "duty-learning-support"));
  assert.equal(recommendApplicability("privacy", profile).decision, "applies");
  assert.equal(
    recommendApplicability("public-official-conduct", profile).decision,
    "not-applicable",
  );
});

test("기존 v2 형식을 v3로 읽으며 손상된 항목을 안전하게 걸러낸다", () => {
  const record = safetyRecord(2026, 2.5);
  const migrated = parseTrainingState({
    version: 2,
    activeYear: 2026,
    recordsByYear: { "2026": [record, { id: "broken" }] },
  });

  assert.ok(migrated);
  assert.equal(migrated.version, STATE_VERSION);
  assert.equal(migrated.recordsByYear["2026"].length, 1);
  assert.equal(migrated.recordsByYear["2026"][0].completedHours, 2.5);
  assert.deepEqual(migrated.profilesByYear, {});
});

test("손상된 v3가 있어도 읽을 수 있는 v2를 다음 순서로 복구한다", () => {
  const fallback = JSON.stringify({
    version: 2,
    activeYear: 2026,
    recordsByYear: { "2026": [safetyRecord(2026, 3)] },
  });
  const selected = selectStoredTrainingState(["{broken", fallback], 2026);

  assert.equal(selected.hadInvalidValue, true);
  assert.ok(selected.state);
  assert.equal(selected.state.recordsByYear["2026"][0].completedHours, 3);
});

test("로컬과 클라우드 병합 시 기본 연수는 중복을 제거하고 개인 연수는 보존한다", () => {
  const base = createDefaultTrainings(2026)[0];
  const cloudRecord = { ...base, memo: "cloud", updatedAt: "2026-01-01T00:00:00.000Z" };
  const localRecord = { ...base, memo: "local", updatedAt: "2026-02-01T00:00:00.000Z" };
  const personal = (id: string): TrainingRecord => ({
    ...base,
    id,
    templateKey: undefined,
    title: "같은 제목의 개인 연수",
    kind: "personal",
  });
  const state = (records: TrainingRecord[]): TrainingAppState => ({
    version: STATE_VERSION,
    activeYear: 2026,
    recordsByYear: { "2026": records },
    profilesByYear: {},
  });

  const merged = mergeTrainingStates(
    state([localRecord, personal("local-personal")]),
    state([cloudRecord, personal("cloud-personal")]),
  );
  const records = merged.recordsByYear["2026"];
  assert.equal(records.filter((record) => record.templateKey === base.templateKey).length, 1);
  assert.equal(records.find((record) => record.templateKey === base.templateKey)?.memo, "local");
  assert.equal(records.filter((record) => record.kind === "personal").length, 2);
});

test("미래 연도의 손대지 않은 기본값이 실제 수정본을 덮어쓰지 않는다", () => {
  const untouched = createDefaultTrainings(2028)[0];
  const edited = {
    ...untouched,
    memo: "2026년에 미리 적은 실제 계획",
    updatedAt: "2026-07-12T12:00:00.000Z",
  };
  const state = (record: TrainingRecord): TrainingAppState => ({
    version: STATE_VERSION,
    activeYear: 2028,
    recordsByYear: { "2028": [record] },
    profilesByYear: {},
  });

  const merged = mergeTrainingStates(state(untouched), state(edited));
  assert.equal(
    merged.recordsByYear["2028"][0].memo,
    "2026년에 미리 적은 실제 계획",
  );
});

test("이전 버전이 만든 미래 연도 기본 시각을 손대지 않은 값으로 보정한다", () => {
  const oldDefault = {
    ...createDefaultTrainings(2028)[0],
    createdAt: "2028-01-01T00:00:00.000Z",
    updatedAt: "2028-01-01T00:00:00.000Z",
  };
  const parsed = parseTrainingState({
    version: 2,
    activeYear: 2028,
    recordsByYear: { "2028": [oldDefault] },
  });

  assert.ok(parsed);
  assert.equal(parsed.recordsByYear["2028"][0].updatedAt, "1970-01-01T00:00:00.000Z");
});
