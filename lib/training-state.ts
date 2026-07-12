import {
  createDefaultTrainings,
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
    const normalizedRecords = records
      .slice(0, 1000)
      .map((record, index) => normalizeRecord(record, year, index))
      .filter((record): record is TrainingRecord => record !== null);
    const deduplicated = new Map<string, TrainingRecord>();
    for (const record of normalizedRecords) {
      const key = recordMergeKey(record);
      const existing = deduplicated.get(key);
      if (!existing || timestamp(record.updatedAt) > timestamp(existing.updatedAt)) {
        deduplicated.set(key, record);
      }
    }
    recordsByYear[yearKey] = Array.from(deduplicated.values());
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
      if (normalized) profilesByYear[yearKey] = normalized;
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

  return {
    id: safeString(candidate.id, 160) || `imported-${year}-${index}`,
    templateKey: optionalString(candidate.templateKey, 120),
    title: candidate.title.trim().slice(0, 100),
    category,
    kind,
    cycle: safeString(candidate.cycle, 40) || "자율",
    requiredHours: safeNumber(candidate.requiredHours, 0, 999),
    completedHours: safeNumber(candidate.completedHours, 0, 999),
    status,
    dueDate: safeString(candidate.dueDate, 10),
    completedDate: safeString(candidate.completedDate, 10),
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

  return {
    ...profile,
    educationOffice: officeValues.includes(candidate.educationOffice as EducationOfficeCode)
      ? (candidate.educationOffice as EducationOfficeCode)
      : "",
    schoolType: schoolValues.includes(candidate.schoolType as SchoolType)
      ? (candidate.schoolType as SchoolType)
      : "",
    employmentType: employmentValues.includes(candidate.employmentType as EmploymentType)
      ? (candidate.employmentType as EmploymentType)
      : "",
    contractUnderThreeYears: nullableBoolean(candidate.contractUnderThreeYears),
    directlyEmployed: nullableBoolean(candidate.directlyEmployed),
    studentFacing: nullableBoolean(candidate.studentFacing),
    handlesPersonalData: nullableBoolean(candidate.handlesPersonalData),
    duties: Array.isArray(candidate.duties)
      ? candidate.duties.filter((duty): duty is DutyCode => dutyValues.has(duty as DutyCode))
      : [],
    configured:
      candidate.configured === true &&
      Boolean(candidate.educationOffice) &&
      Boolean(candidate.schoolType) &&
      Boolean(candidate.employmentType),
    updatedAt: validTimestamp(candidate.updatedAt) ?? new Date().toISOString(),
  };
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
