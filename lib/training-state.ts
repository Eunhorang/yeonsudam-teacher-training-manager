import {
  createDefaultTrainings,
  normalizeDefaultTrainingTitle,
  STATUS_LABELS,
  TRAINING_CATEGORIES,
  type ApplicabilityOverride,
  type ProfileApplicability,
  type TrainingCategory,
  type TrainingKind,
  type TrainingRecord,
  type TrainingStatus,
} from "@/lib/training-data";
import {
  applyProfileRecommendations,
  createEmptyProfile,
  DUTY_OPTIONS,
  EDUCATION_OFFICES,
  EMPLOYMENT_TYPES,
  SCHOOL_TYPES,
  type DutyCode,
  type EducationOfficeCode,
  type EmploymentType,
  type SchoolType,
  type TeacherProfile,
} from "@/lib/training-profile";

export const STATE_VERSION = 3;
export const LEGACY_STORAGE_KEY = "teacher-training-manager:v2";
export const DEVICE_STORAGE_KEY = "teacher-training-manager:v3";
export const MAX_RECORDS_PER_YEAR = 1000;

export interface TrainingAppState {
  version: typeof STATE_VERSION;
  activeYear: number;
  recordsByYear: Record<string, TrainingRecord[]>;
  profilesByYear: Record<string, TeacherProfile>;
}

export function createInitialTrainingState(year: number): TrainingAppState {
  return {
    version: STATE_VERSION,
    activeYear: year,
    recordsByYear: { [year]: createDefaultTrainings(year) },
    profilesByYear: {},
  };
}

// 정상 사용 경로에서 기록이 조용히 잘리지 않도록 불러오기·서버 저장 전에 확인합니다.
export function trainingStateLimitError(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const recordsByYear = (value as { recordsByYear?: unknown }).recordsByYear;
  if (!recordsByYear || typeof recordsByYear !== "object" || Array.isArray(recordsByYear)) {
    return null;
  }
  const countsByYear = new Map<string, number>();
  for (const [yearKey, records] of Object.entries(recordsByYear)) {
    if (!Array.isArray(records)) continue;
    const parsedYear = Number(yearKey);
    const normalizedYearKey = isValidYear(parsedYear) ? String(parsedYear) : yearKey;
    const count = (countsByYear.get(normalizedYearKey) ?? 0) + records.length;
    countsByYear.set(normalizedYearKey, count);
    if (count > MAX_RECORDS_PER_YEAR) {
      return `${normalizedYearKey}년 기록이 ${MAX_RECORDS_PER_YEAR.toLocaleString("ko-KR")}개를 초과합니다.`;
    }
  }
  return null;
}

export function parseTrainingState(
  value: unknown,
  fallbackYear = new Date().getFullYear(),
): TrainingAppState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as {
    version?: unknown;
    activeYear?: unknown;
    recordsByYear?: unknown;
    profilesByYear?: unknown;
  };
  if (
    !candidate.recordsByYear ||
    typeof candidate.recordsByYear !== "object" ||
    Array.isArray(candidate.recordsByYear)
  ) {
    return null;
  }

  const recordsByYear: Record<string, TrainingRecord[]> = {};
  for (const [yearKey, records] of Object.entries(candidate.recordsByYear)) {
    const year = Number(yearKey);
    if (!isValidYear(year) || !Array.isArray(records)) continue;
    const canonicalYearKey = String(year);
    const normalizedRecords = records
      .map((record, index) => normalizeRecord(record, year, index))
      .filter((record): record is TrainingRecord => record !== null);
    const deduplicated = new Map<string, TrainingRecord>();
    for (const record of [
      ...(recordsByYear[canonicalYearKey] ?? []),
      ...normalizedRecords,
    ]) {
      const key = recordMergeKey(record);
      const existing = deduplicated.get(key);
      if (!existing || timestamp(record.updatedAt) > timestamp(existing.updatedAt)) {
        deduplicated.set(key, record);
      }
    }
    recordsByYear[canonicalYearKey] = Array.from(deduplicated.values());
  }

  let availableYears = Object.keys(recordsByYear).map(Number);
  if (availableYears.length === 0) {
    recordsByYear[String(fallbackYear)] = createDefaultTrainings(fallbackYear);
    availableYears = [fallbackYear];
  }

  const profilesByYear: Record<string, TeacherProfile> = {};
  if (
    candidate.profilesByYear &&
    typeof candidate.profilesByYear === "object" &&
    !Array.isArray(candidate.profilesByYear)
  ) {
    for (const [yearKey, profile] of Object.entries(candidate.profilesByYear)) {
      const year = Number(yearKey);
      if (!isValidYear(year)) continue;
      const normalized = normalizeProfile(profile, year);
      const canonicalYearKey = String(year);
      const existing = profilesByYear[canonicalYearKey];
      if (
        normalized &&
        (!existing || timestamp(normalized.updatedAt) > timestamp(existing.updatedAt))
      ) {
        profilesByYear[canonicalYearKey] = normalized;
      }
    }
  }

  const requestedYear = Number(candidate.activeYear);
  const activeYear = availableYears.includes(requestedYear)
    ? requestedYear
    : availableYears.sort((a, b) => b - a)[0];

  return {
    version: STATE_VERSION,
    activeYear,
    recordsByYear,
    profilesByYear,
  };
}

// 사용자가 고른 백업 파일은 브라우저 내부의 오래된 캐시보다 엄격하게 확인합니다.
// 유효한 연도 없이 기본 목록으로 바뀌는 일을 막고, 손상된 기록이 섞인 파일도 거부합니다.
export function parseTrainingBackupState(
  value: unknown,
  fallbackYear = new Date().getFullYear(),
): TrainingAppState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as {
    activeYear?: unknown;
    recordsByYear?: unknown;
    profilesByYear?: unknown;
  };
  const recordsByYear = candidate.recordsByYear;
  if (
    !recordsByYear ||
    typeof recordsByYear !== "object" ||
    Array.isArray(recordsByYear)
  ) {
    return null;
  }

  const entries = Object.entries(recordsByYear);
  if (entries.length === 0) return null;
  const recordKeysByYear = new Map<string, Set<string>>();
  for (const [yearKey, records] of entries) {
    const year = Number(yearKey);
    if (!isValidYear(year) || !Array.isArray(records)) return null;
    const canonicalYearKey = String(year);
    const seenKeys = recordKeysByYear.get(canonicalYearKey) ?? new Set<string>();
    for (const record of records) {
      if (!isValidBackupRecord(record)) return null;
      const typedRecord = record as TrainingRecord;
      const key = recordMergeKey(typedRecord);
      if (seenKeys.has(key)) return null;
      seenKeys.add(key);
    }
    recordKeysByYear.set(canonicalYearKey, seenKeys);
  }

  if (
    candidate.activeYear !== undefined &&
    (!isValidYear(Number(candidate.activeYear)) ||
      !recordKeysByYear.has(String(Number(candidate.activeYear))))
  ) {
    return null;
  }

  if (candidate.profilesByYear !== undefined) {
    if (
      !candidate.profilesByYear ||
      typeof candidate.profilesByYear !== "object" ||
      Array.isArray(candidate.profilesByYear)
    ) {
      return null;
    }
    const profileYears = new Set<string>();
    for (const [yearKey, profile] of Object.entries(candidate.profilesByYear)) {
      const year = Number(yearKey);
      const canonicalYearKey = String(year);
      if (
        !isValidYear(year) ||
        profileYears.has(canonicalYearKey) ||
        !isValidBackupProfile(profile, year)
      ) {
        return null;
      }
      profileYears.add(canonicalYearKey);
    }
  }

  return parseTrainingState(value, fallbackYear);
}

export function selectStoredTrainingState(
  rawCandidates: Array<string | null>,
  fallbackYear = new Date().getFullYear(),
) {
  let hadInvalidValue = false;
  for (const raw of rawCandidates) {
    if (!raw) continue;
    try {
      const state = parseTrainingState(JSON.parse(raw), fallbackYear);
      if (state) return { state, hadInvalidValue };
      hadInvalidValue = true;
    } catch {
      hadInvalidValue = true;
    }
  }
  return { state: null, hadInvalidValue };
}

export function mergeTrainingStates(
  local: TrainingAppState,
  cloud: TrainingAppState,
): TrainingAppState {
  const years = new Set([
    ...Object.keys(local.recordsByYear),
    ...Object.keys(cloud.recordsByYear),
  ]);
  const recordsByYear: Record<string, TrainingRecord[]> = {};

  for (const yearKey of years) {
    const merged = new Map<string, TrainingRecord>();
    for (const record of cloud.recordsByYear[yearKey] ?? []) {
      merged.set(recordMergeKey(record), record);
    }
    for (const record of local.recordsByYear[yearKey] ?? []) {
      const key = recordMergeKey(record);
      const cloudRecord = merged.get(key);
      if (!cloudRecord || timestamp(record.updatedAt) > timestamp(cloudRecord.updatedAt)) {
        merged.set(key, record);
      }
    }
    recordsByYear[yearKey] = Array.from(merged.values());
  }

  const profilesByYear: Record<string, TeacherProfile> = {
    ...cloud.profilesByYear,
  };
  for (const [yearKey, profile] of Object.entries(local.profilesByYear)) {
    const cloudProfile = profilesByYear[yearKey];
    if (!cloudProfile || timestamp(profile.updatedAt) > timestamp(cloudProfile.updatedAt)) {
      profilesByYear[yearKey] = profile;
    }
  }

  // 최종으로 선택된 연도별 프로필에 맞춰 추천 표시를 다시 계산합니다.
  // 이렇게 하면 클라우드 기록과 프로필의 수정 시각이 엇갈려도 표시가 일관됩니다.
  for (const [yearKey, profile] of Object.entries(profilesByYear)) {
    if (!profile.configured || !recordsByYear[yearKey]) continue;
    recordsByYear[yearKey] = applyProfileRecommendations(
      recordsByYear[yearKey],
      profile,
      Number(yearKey),
      MAX_RECORDS_PER_YEAR,
    );
  }

  return {
    version: STATE_VERSION,
    activeYear: local.activeYear,
    recordsByYear,
    profilesByYear,
  };
}

export function countTrainingState(state: TrainingAppState) {
  const years = Object.keys(state.recordsByYear).length;
  const records = Object.values(state.recordsByYear).reduce(
    (sum, items) => sum + items.length,
    0,
  );
  return { years, records };
}

export function cloudCacheKey(accountScope: string) {
  return `teacher-training-manager:v3:${accountScope}`;
}

export function migrationMarkerKey(accountScope: string) {
  return `teacher-training-manager:migration:v2:${accountScope}`;
}

function normalizeRecord(
  value: unknown,
  year: number,
  index: number,
): TrainingRecord | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<TrainingRecord>;
  if (typeof candidate.title !== "string" || !candidate.title.trim()) {
    return null;
  }

  const category = TRAINING_CATEGORIES.includes(
    candidate.category as TrainingCategory,
  )
    ? (candidate.category as TrainingCategory)
    : "개인 역량";
  const status = Object.keys(STATUS_LABELS).includes(candidate.status ?? "")
    ? (candidate.status as TrainingStatus)
    : "planned";
  const kind: TrainingKind = candidate.kind === "required" ? "required" : "personal";
  const parsedUpdatedAt = validTimestamp(candidate.updatedAt);
  const legacyFutureDefaultTimestamp = `${year}-01-01T00:00:00.000Z`;
  const updatedAt =
    candidate.templateKey && parsedUpdatedAt === legacyFutureDefaultTimestamp
      ? new Date(0).toISOString()
      : parsedUpdatedAt ?? new Date().toISOString();
  const templateKey = optionalString(candidate.templateKey, 120);
  const title = normalizeDefaultTrainingTitle(
    templateKey,
    candidate.title.trim(),
  );

  return {
    id: safeString(candidate.id, 160) || `imported-${year}-${index}`,
    templateKey,
    title: title.slice(0, 100),
    category,
    kind,
    cycle: safeString(candidate.cycle, 40) || "자율",
    requiredHours: safeNumber(candidate.requiredHours, 0, 999),
    completedHours: safeNumber(candidate.completedHours, 0, 999),
    status,
    dueDate: normalizeIsoDate(candidate.dueDate),
    completedDate: normalizeIsoDate(candidate.completedDate),
    provider: safeString(candidate.provider, 80),
    method: safeString(candidate.method, 20) || "기타",
    memo: safeString(candidate.memo, 600),
    guidance: safeString(candidate.guidance, 240),
    sourceName: optionalString(candidate.sourceName, 80),
    sourceUrl: optionalHttpUrl(candidate.sourceUrl),
    profileApplicability: normalizeApplicability(candidate.profileApplicability),
    profileReason: optionalString(candidate.profileReason, 240),
    applicabilityOverride: normalizeOverride(candidate.applicabilityOverride),
    createdAt: validTimestamp(candidate.createdAt) ?? updatedAt,
    updatedAt,
  };
}

function normalizeProfile(value: unknown, year: number): TeacherProfile | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<TeacherProfile>;
  const officeValues = EDUCATION_OFFICES.map(([code]) => code);
  const schoolValues = SCHOOL_TYPES.map(([code]) => code);
  const employmentValues = EMPLOYMENT_TYPES.map(([code]) => code);
  const dutyValues = new Set(DUTY_OPTIONS.map(([code]) => code));
  const profile = createEmptyProfile(year);
  const educationOffice = officeValues.includes(
    candidate.educationOffice as EducationOfficeCode,
  )
    ? (candidate.educationOffice as EducationOfficeCode)
    : "";
  const schoolType = schoolValues.includes(candidate.schoolType as SchoolType)
    ? (candidate.schoolType as SchoolType)
    : "";
  const employmentType = employmentValues.includes(
    candidate.employmentType as EmploymentType,
  )
    ? (candidate.employmentType as EmploymentType)
    : "";

  return {
    ...profile,
    educationOffice,
    schoolType,
    employmentType,
    contractUnderThreeYears: nullableBoolean(candidate.contractUnderThreeYears),
    directlyEmployed: nullableBoolean(candidate.directlyEmployed),
    studentFacing: nullableBoolean(candidate.studentFacing),
    handlesPersonalData: nullableBoolean(candidate.handlesPersonalData),
    duties: Array.isArray(candidate.duties)
      ? candidate.duties.filter((duty): duty is DutyCode => dutyValues.has(duty as DutyCode))
      : [],
    configured:
      candidate.configured === true &&
      Boolean(educationOffice) &&
      Boolean(schoolType) &&
      Boolean(employmentType),
    updatedAt: validTimestamp(candidate.updatedAt) ?? new Date().toISOString(),
  };
}

function isValidBackupRecord(value: unknown): value is TrainingRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<TrainingRecord>;
  const validStatus = Object.keys(STATUS_LABELS).includes(record.status ?? "");
  const validCategory = TRAINING_CATEGORIES.includes(
    record.category as TrainingCategory,
  );
  const validDate = (date: unknown) =>
    date === "" || (typeof date === "string" && normalizeIsoDate(date) === date);
  const validNumber = (number: unknown) =>
    typeof number === "number" &&
    Number.isFinite(number) &&
    number >= 0 &&
    number <= 999;
  const validString = (text: unknown, maxLength: number, allowEmpty = true) =>
    typeof text === "string" &&
    text.length <= maxLength &&
    (allowEmpty || text.trim().length > 0);

  if (
    !validString(record.id, 160, false) ||
    !validString(record.title, 100, false) ||
    !validCategory ||
    (record.kind !== "required" && record.kind !== "personal") ||
    !validString(record.cycle, 40, false) ||
    !validNumber(record.requiredHours) ||
    !validNumber(record.completedHours) ||
    !validStatus ||
    !validDate(record.dueDate) ||
    !validDate(record.completedDate) ||
    !validString(record.provider, 80) ||
    !validString(record.method, 20, false) ||
    !validString(record.memo, 600) ||
    !validString(record.guidance, 240) ||
    validTimestamp(record.createdAt) === null ||
    validTimestamp(record.updatedAt) === null
  ) {
    return false;
  }
  if (
    record.templateKey !== undefined &&
    !validString(record.templateKey, 120, false)
  ) {
    return false;
  }
  if (
    record.sourceName !== undefined &&
    !validString(record.sourceName, 80, false)
  ) {
    return false;
  }
  if (
    record.sourceUrl !== undefined &&
    optionalHttpUrl(record.sourceUrl) !== record.sourceUrl
  ) {
    return false;
  }
  if (
    record.profileApplicability !== undefined &&
    normalizeApplicability(record.profileApplicability) !==
      record.profileApplicability
  ) {
    return false;
  }
  if (
    record.profileReason !== undefined &&
    !validString(record.profileReason, 240, false)
  ) {
    return false;
  }
  if (
    record.applicabilityOverride !== undefined &&
    normalizeOverride(record.applicabilityOverride) !==
      record.applicabilityOverride
  ) {
    return false;
  }
  return true;
}

function isValidBackupProfile(value: unknown, year: number): value is TeacherProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const profile = value as Partial<TeacherProfile>;
  const officeValues = new Set(EDUCATION_OFFICES.map(([code]) => code));
  const schoolValues = new Set(SCHOOL_TYPES.map(([code]) => code));
  const employmentValues = new Set(EMPLOYMENT_TYPES.map(([code]) => code));
  const dutyValues = new Set(DUTY_OPTIONS.map(([code]) => code));
  const nullableFields = [
    profile.contractUnderThreeYears,
    profile.directlyEmployed,
    profile.studentFacing,
    profile.handlesPersonalData,
  ];

  if (
    profile.year !== year ||
    typeof profile.configured !== "boolean" ||
    !Array.isArray(profile.duties) ||
    new Set(profile.duties).size !== profile.duties.length ||
    profile.duties.some((duty) => !dutyValues.has(duty as DutyCode)) ||
    nullableFields.some((field) => field !== null && typeof field !== "boolean") ||
    validTimestamp(profile.updatedAt) === null
  ) {
    return false;
  }
  const officeValid =
    profile.educationOffice === "" ||
    officeValues.has(profile.educationOffice as EducationOfficeCode);
  const schoolValid =
    profile.schoolType === "" || schoolValues.has(profile.schoolType as SchoolType);
  const employmentValid =
    profile.employmentType === "" ||
    employmentValues.has(profile.employmentType as EmploymentType);
  if (!officeValid || !schoolValid || !employmentValid) return false;
  if (
    profile.configured &&
    (!profile.educationOffice || !profile.schoolType || !profile.employmentType)
  ) {
    return false;
  }
  return true;
}

function recordMergeKey(record: TrainingRecord) {
  return record.templateKey ? `template:${record.templateKey}` : `id:${record.id}`;
}

function isValidYear(year: number) {
  return Number.isInteger(year) && year >= 2000 && year <= 2100;
}

function timestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function validTimestamp(value: unknown) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return value;
}

function safeString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function normalizeIsoDate(value: unknown) {
  const raw = safeString(value, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? raw
    : "";
}

function optionalString(value: unknown, maxLength: number) {
  const normalized = safeString(value, maxLength);
  return normalized || undefined;
}

function safeNumber(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : 0;
}

function nullableBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function normalizeApplicability(value: unknown): ProfileApplicability | undefined {
  return value === "applies" || value === "review" || value === "not-applicable"
    ? value
    : undefined;
}

function normalizeOverride(value: unknown): ApplicabilityOverride | undefined {
  return value === "applies" || value === "not-applicable" ? value : undefined;
}

function optionalHttpUrl(value: unknown) {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}
