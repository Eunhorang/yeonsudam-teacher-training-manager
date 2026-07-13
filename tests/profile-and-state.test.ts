import assert from "node:assert/strict";
import test from "node:test";

import { dueLabel, spreadsheetSafeValue } from "@/components/TrainingManager";
import {
  CERTIFICATE_FILE_NAME_MAX_LENGTH,
  createDefaultTrainings,
  getJeonnamPortalCourse,
  JEONNAM_PORTAL_COURSE_BY_TEMPLATE_KEY,
  type TrainingRecord,
} from "@/lib/training-data";
import {
  applyProfileRecommendations,
  createEmptyProfile,
  getSchoolSafetySummary,
  recommendApplicability,
  type DutyCode,
} from "@/lib/training-profile";
import {
  cloudCacheKey,
  DEVICE_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  mergeTrainingStates,
  MAX_RECORDS_PER_YEAR,
  parseTrainingBackupState,
  parseTrainingState,
  PREVIOUS_STORAGE_KEY,
  previousCloudCacheKey,
  selectStoredTrainingState,
  STATE_VERSION,
  trainingStateLimitError,
  type TrainingAppState,
} from "@/lib/training-state";

function safetyRecord(year: number, hours: number, status: TrainingRecord["status"] = "completed") {
  const record = createDefaultTrainings(year).find(
    (item) => item.templateKey === "school-safety",
  );
  assert.ok(record);
  return { ...record, title: "사용자가 바꿈 제목", completedHours: hours, status };
}

test("전남교육연수포털 법정의무연수 과정명을 지정된 기본 연수명에 표시한다", () => {
  const records = createDefaultTrainings(2026);
  const expectedKeys = Object.keys(JEONNAM_PORTAL_COURSE_BY_TEMPLATE_KEY);
  const expectedTitles: Record<string, string> = {
    "violence-prevention":
      "4대 폭력 예방교육 (전남교육연수포털 법정의무연수1)",
    "anti-corruption":
      "부패방지교육 (전남교육연수포털 법정의무연수1)",
    "anti-bribery":
      "청탁금지법 교육 (전남교육연수포털 법정의무연수1)",
    "public-official-conduct":
      "공무원 행동강령 교육 (전남교육연수포털 법정의무연수1)",
    "emergency-welfare-report":
      "긴급복지 신고의무자 교육 (전남교육연수포털 법정의무연수1)",
    "disabled-abuse-report":
      "장애인학대·장애인 대상 성범죄 신고의무자 교육 (전남교육연수포털 법정의무연수1)",
    "social-disability-awareness":
      "사회적 장애인식개선교육 (전남교육연수포털 법정의무연수1)",
    "information-disclosure":
      "정보공개 제도 교육 (전남교육연수포털 법정의무연수1)",
    "child-abuse-report":
      "아동학대 신고의무자 교육 (전남교육연수포털 법정의무연수1)",
    "school-violence-semester-1":
      "학교폭력 예방교육 · 1학기 (전남교육연수포털 법정의무연수2)",
    "school-violence-semester-2":
      "학교폭력 예방교육 · 2학기 (전남교육연수포털 법정의무연수2)",
    "teacher-rights":
      "교육활동 침해행위 예방교육 (전남교육연수포털 법정의무연수2)",
    "character-education":
      "인성교육 (전남교육연수포털 법정의무연수2)",
    "suicide-prevention":
      "자살예방·생명존중 교육 (전남교육연수포털 법정의무연수2)",
    "conflict-of-interest":
      "이해충돌방지법 교육 (전남교육연수포털 법정의무연수2)",
    "multicultural-understanding":
      "다문화 이해교육 (전남교육연수포털 법정의무연수2)",
  };
  const portalRecords = records.filter((record) =>
    record.title.includes("전남교육연수포털 법정의무연수"),
  );

  assert.equal(portalRecords.length, 16);
  assert.deepEqual(
    portalRecords.map((record) => record.templateKey).sort(),
    expectedKeys.sort(),
  );
  for (const record of portalRecords) {
    assert.ok(record.templateKey);
    const course =
      JEONNAM_PORTAL_COURSE_BY_TEMPLATE_KEY[
        record.templateKey as keyof typeof JEONNAM_PORTAL_COURSE_BY_TEMPLATE_KEY
      ];
    assert.match(
      record.title,
      new RegExp(`\\(전남교육연수포털 법정의무연수${course}\\)$`),
    );
    assert.equal(record.title, expectedTitles[record.templateKey]);
  }
  assert.equal(
    portalRecords.filter((record) =>
      record.templateKey?.startsWith("school-violence-semester-"),
    ).length,
    2,
  );
});

test("전남교육연수포털 과정은 고정 키로 구분하고 새 수료증 기록은 비워 둔다", () => {
  const records = createDefaultTrainings(2026);
  const course1 = records.find(
    (record) => record.templateKey === "violence-prevention",
  );
  const course2 = records.find(
    (record) => record.templateKey === "teacher-rights",
  );
  assert.ok(course1);
  assert.ok(course2);

  assert.equal(getJeonnamPortalCourse(course1.templateKey), 1);
  assert.equal(getJeonnamPortalCourse(course2.templateKey), 2);
  assert.equal(getJeonnamPortalCourse("unknown-template"), null);
  assert.equal(course1.certificateFileName, "");
  assert.equal(course1.certificateStorageLocation, "");
});

test("기존 기본 연수명만 새 포털 과정명으로 바꾸고 사용자 제목은 보존한다", () => {
  const defaults = createDefaultTrainings(2026);
  const current = defaults.find(
    (record) => record.templateKey === "violence-prevention",
  );
  const customBase = defaults.find(
    (record) => record.templateKey === "anti-corruption",
  );
  assert.ok(current);
  assert.ok(customBase);
  const oldTitle = "4대 폭력 예방교육";
  const legacyRecord = { ...current, title: oldTitle };
  const customRecord = { ...customBase, title: "학교 자체 청렴 연수" };
  const parsed = parseTrainingState({
    version: 3,
    activeYear: 2026,
    recordsByYear: { "2026": [legacyRecord, customRecord] },
    profilesByYear: {},
  });

  assert.ok(parsed);
  assert.equal(
    parsed.recordsByYear["2026"].find((record) => record.id === current.id)
      ?.title,
    "4대 폭력 예방교육 (전남교육연수포털 법정의무연수1)",
  );
  assert.equal(
    parsed.recordsByYear["2026"].find((record) => record.id === customRecord.id)
      ?.title,
    customRecord.title,
  );
  assert.equal(
    parsed.recordsByYear["2026"].find((record) => record.id === current.id)
      ?.updatedAt,
    current.updatedAt,
  );
});

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

test("학교안전 시작 전 시간은 빼고 진행 중·완료 시간만 합산한다", () => {
  const summary = getSchoolSafetySummary(
    {
      "2026": [
        { ...safetyRecord(2026, 15, "planned"), id: "planned-safety" },
        { ...safetyRecord(2026, 3, "in-progress"), id: "ongoing-safety" },
        { ...safetyRecord(2026, 4, "completed"), id: "completed-safety" },
      ],
    },
    2026,
  );

  assert.equal(summary.totalHours, 7);
  assert.equal(summary.requirementMet, false);
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
  assert.equal(evaluated[0].updatedAt, records[0].updatedAt);
  assert.ok(evaluated.some((record) => record.templateKey === "duty-learning-support"));
  assert.equal(recommendApplicability("privacy", profile).decision, "applies");
  assert.equal(
    recommendApplicability("public-official-conduct", profile).decision,
    "not-applicable",
  );
});

test("기존 v2 형식을 v4로 읽으며 새 수료증 필드를 안전하게 채운다", () => {
  const record = safetyRecord(2026, 2.5);
  const legacyRecord: Partial<TrainingRecord> = { ...record };
  delete legacyRecord.certificateFileName;
  delete legacyRecord.certificateStorageLocation;
  const migrated = parseTrainingState({
    version: 2,
    activeYear: 2026,
    recordsByYear: { "2026": [legacyRecord, { id: "broken" }] },
  });

  assert.ok(migrated);
  assert.equal(migrated.version, STATE_VERSION);
  assert.equal(migrated.recordsByYear["2026"].length, 1);
  assert.equal(migrated.recordsByYear["2026"][0].completedHours, 2.5);
  assert.equal(migrated.recordsByYear["2026"][0].certificateFileName, "");
  assert.equal(
    migrated.recordsByYear["2026"][0].certificateStorageLocation,
    "",
  );
  assert.deepEqual(migrated.profilesByYear, {});
});

test("손상된 v4 뒤에서 v3를 v2보다 먼저 복구한다", () => {
  const previous = JSON.stringify({
    version: 3,
    activeYear: 2026,
    recordsByYear: { "2026": [safetyRecord(2026, 3)] },
  });
  const legacy = JSON.stringify({
    version: 2,
    activeYear: 2026,
    recordsByYear: { "2026": [safetyRecord(2026, 2)] },
  });
  const selected = selectStoredTrainingState(
    ["{broken", previous, legacy],
    2026,
  );

  assert.equal(selected.hadInvalidValue, true);
  assert.ok(selected.state);
  assert.equal(selected.state.recordsByYear["2026"][0].completedHours, 3);
});

test("v4와 이전 버전의 기기·계정 저장 키를 서로 분리한다", () => {
  assert.equal(DEVICE_STORAGE_KEY, "teacher-training-manager:v4");
  assert.equal(PREVIOUS_STORAGE_KEY, "teacher-training-manager:v3");
  assert.equal(LEGACY_STORAGE_KEY, "teacher-training-manager:v2");
  assert.equal(cloudCacheKey("teacher-a"), "teacher-training-manager:v4:teacher-a");
  assert.equal(
    previousCloudCacheKey("teacher-a"),
    "teacher-training-manager:v3:teacher-a",
  );
});

test("로컬과 클라우드 병합 시 기본 연수는 중복을 제거하고 개인 연수는 보존한다", () => {
  const base = createDefaultTrainings(2026)[0];
  const cloudRecord = { ...base, memo: "cloud", updatedAt: "2026-01-01T00:00:00.000Z" };
  const localRecord = {
    ...base,
    memo: "local",
    certificateFileName: "20260201_학교안전교육.pdf",
    certificateStorageLocation: "내 문서/2026년 연수",
    updatedAt: "2026-02-01T00:00:00.000Z",
  };
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
  assert.equal(
    records.find((record) => record.templateKey === base.templateKey)
      ?.certificateFileName,
    "20260201_학교안전교육.pdf",
  );
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

test("비표준 연도 키·잘못된 날짜·유효하지 않은 근무 조건을 정규화한다", () => {
  const parsed = parseTrainingState({
    version: 3,
    activeYear: 2026,
    recordsByYear: {
      "02026": [
        {
          ...safetyRecord(2026, 2),
          dueDate: "2026-99-99",
          completedDate: "not-a-date",
        },
      ],
    },
    profilesByYear: {
      "02026": {
        configured: true,
        educationOffice: "invalid-office",
        schoolType: "invalid-school",
        employmentType: "invalid-job",
      },
    },
  });

  assert.ok(parsed);
  assert.deepEqual(Object.keys(parsed.recordsByYear), ["2026"]);
  assert.equal(parsed.recordsByYear["2026"][0].dueDate, "");
  assert.equal(parsed.recordsByYear["2026"][0].completedDate, "");
  assert.equal(parsed.profilesByYear["2026"].configured, false);
});

test("연도별 기록 한도 초과를 불러오기 전에 안내한다", () => {
  const issue = trainingStateLimitError({
    recordsByYear: {
      "2026": Array.from({ length: MAX_RECORDS_PER_YEAR + 1 }, () => ({})),
    },
  });
  assert.match(issue ?? "", /1,000개를 초과/);

  const duplicateYearIssue = trainingStateLimitError({
    recordsByYear: {
      "2026": Array.from({ length: 501 }, () => ({})),
      "02026": Array.from({ length: 500 }, () => ({})),
    },
  });
  assert.match(duplicateYearIssue ?? "", /2026년 기록/);
});

test("백업 파일은 유효한 연도와 온전한 기록이 있을 때만 받아들인다", () => {
  assert.equal(parseTrainingBackupState({ recordsByYear: {} }, 2026), null);
  assert.equal(
    parseTrainingBackupState({ recordsByYear: { oops: [{ foo: "bar" }] } }, 2026),
    null,
  );
  assert.equal(
    parseTrainingBackupState(
      { recordsByYear: { "2026": [{ id: "broken" }] } },
      2026,
    ),
    null,
  );
  assert.ok(
    parseTrainingBackupState(
      { activeYear: 2026, recordsByYear: { "2026": [] }, profilesByYear: {} },
      2026,
    ),
  );

  const validRecord = safetyRecord(2026, 2);
  assert.equal(
    parseTrainingBackupState(
      {
        activeYear: 2026,
        recordsByYear: {
          "2026": [validRecord, { ...validRecord, status: "broken-status" }],
        },
        profilesByYear: {},
      },
      2026,
    ),
    null,
  );
  assert.equal(
    parseTrainingBackupState(
      {
        activeYear: 2026,
        recordsByYear: {
          "2026": [validRecord, { ...validRecord, memo: "중복" }],
        },
        profilesByYear: {},
      },
      2026,
    ),
    null,
  );
  assert.equal(
    parseTrainingBackupState(
      {
        activeYear: 2026,
        recordsByYear: { "2026": [validRecord] },
        profilesByYear: {
          "2026": {
            ...createEmptyProfile(2026),
            duties: ["not-a-duty"],
          },
        },
      },
      2026,
    ),
    null,
  );
  assert.ok(
    parseTrainingBackupState(
      {
        activeYear: 2026,
        recordsByYear: { "2026": [validRecord] },
        profilesByYear: { "2026": createEmptyProfile(2026) },
      },
      2026,
    ),
  );
});

test("v3 백업은 수료증 필드 없이 복원하고 v4 백업은 새 필드를 검증한다", () => {
  const validRecord = safetyRecord(2026, 2);
  const legacyRecord: Partial<TrainingRecord> = { ...validRecord };
  delete legacyRecord.certificateFileName;
  delete legacyRecord.certificateStorageLocation;

  const restoredLegacy = parseTrainingBackupState({
    version: 3,
    activeYear: 2026,
    recordsByYear: { "2026": [legacyRecord] },
    profilesByYear: {},
  });
  assert.ok(restoredLegacy);
  assert.equal(restoredLegacy.recordsByYear["2026"][0].certificateFileName, "");
  assert.equal(
    restoredLegacy.recordsByYear["2026"][0].certificateStorageLocation,
    "",
  );

  assert.equal(
    parseTrainingBackupState({
      version: STATE_VERSION,
      activeYear: 2026,
      recordsByYear: { "2026": [legacyRecord] },
      profilesByYear: {},
    }),
    null,
  );

  const certificateRecord = {
    ...validRecord,
    certificateFileName: "20260713_법정의무연수1.pdf",
    certificateStorageLocation: "내 문서/2026년 연수/수료증",
  };
  const restoredCurrent = parseTrainingBackupState({
    version: STATE_VERSION,
    activeYear: 2026,
    recordsByYear: { "2026": [certificateRecord] },
    profilesByYear: {},
  });
  assert.ok(restoredCurrent);
  assert.equal(
    restoredCurrent.recordsByYear["2026"][0].certificateStorageLocation,
    certificateRecord.certificateStorageLocation,
  );

  assert.equal(
    parseTrainingBackupState({
      version: STATE_VERSION,
      activeYear: 2026,
      recordsByYear: {
        "2026": [{ ...certificateRecord, certificateFileName: 42 }],
      },
      profilesByYear: {},
    }),
    null,
  );
  assert.equal(
    parseTrainingBackupState({
      version: STATE_VERSION,
      activeYear: 2026,
      recordsByYear: {
        "2026": [
          {
            ...certificateRecord,
            certificateFileName: "가".repeat(
              CERTIFICATE_FILE_NAME_MAX_LENGTH + 1,
            ),
          },
        ],
      },
      profilesByYear: {},
    }),
    null,
  );
  assert.equal(
    parseTrainingBackupState({
      version: STATE_VERSION,
      activeYear: 2026,
      recordsByYear: {
        "2026": [
          { ...certificateRecord, certificateStorageLocation: ["내 문서"] },
        ],
      },
      profilesByYear: {},
    }),
    null,
  );
});

test("앱보다 새로운 미래 버전의 저장 상태와 백업은 열지 않는다", () => {
  const future = {
    version: STATE_VERSION + 1,
    activeYear: 2026,
    recordsByYear: { "2026": [safetyRecord(2026, 1)] },
    profilesByYear: {},
  };
  assert.equal(parseTrainingState(future), null);
  assert.equal(parseTrainingBackupState(future), null);
});

test("근무 조건 추천과 병합 결과도 연도별 기록 한도를 넘지 않는다", () => {
  const base = createDefaultTrainings(2026)[0];
  const fullRecords = Array.from({ length: MAX_RECORDS_PER_YEAR }, (_, index) => ({
    ...base,
    id: `personal-${index}`,
    templateKey: undefined,
    title: `개인 연수 ${index}`,
    kind: "personal" as const,
  }));
  const profile = {
    ...createEmptyProfile(2026),
    configured: true,
    educationOffice: "seoul" as const,
    schoolType: "public" as const,
    employmentType: "regular-teacher" as const,
    duties: ["learning-support"] as DutyCode[],
  };
  assert.equal(
    applyProfileRecommendations(
      fullRecords,
      profile,
      2026,
      MAX_RECORDS_PER_YEAR,
    ).length,
    MAX_RECORDS_PER_YEAR,
  );

  const state = (prefix: string): TrainingAppState => ({
    version: STATE_VERSION,
    activeYear: 2026,
    recordsByYear: {
      "2026": Array.from({ length: 600 }, (_, index) => ({
        ...base,
        id: `${prefix}-${index}`,
        templateKey: undefined,
        title: `${prefix} 연수 ${index}`,
        kind: "personal" as const,
      })),
    },
    profilesByYear: {},
  });
  const merged = mergeTrainingStates(state("local"), state("cloud"));
  assert.match(trainingStateLimitError(merged) ?? "", /1,000개를 초과/);
});

test("마감일은 시각과 무관하게 달력 날짜 기준으로 표시한다", () => {
  const record = {
    ...safetyRecord(2026, 0, "planned"),
    dueDate: "2026-07-13",
  };
  assert.equal(dueLabel(record, new Date("2026-07-13T08:00:00+09:00")), "오늘까지");
  assert.equal(dueLabel(record, new Date("2026-07-14T01:00:00+09:00")), "1일 지남");
  assert.equal(dueLabel({ ...record, dueDate: "2026-99-99" }), "기한 확인");
});

test("CSV에서 수식으로 오해할 수 있는 문자열을 안전하게 처리한다", () => {
  assert.equal(spreadsheetSafeValue("=1+1"), "'=1+1");
  assert.equal(
    spreadsheetSafeValue('=HYPERLINK("https://example.com")'),
    '\'=HYPERLINK("https://example.com")',
  );
  assert.equal(spreadsheetSafeValue("  @SUM(A1:A2)"), "'  @SUM(A1:A2)");
  assert.equal(spreadsheetSafeValue("일반 메모"), "일반 메모");
  assert.equal(spreadsheetSafeValue(4), 4);
});
