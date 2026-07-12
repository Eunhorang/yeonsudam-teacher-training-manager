import {
  createTrainingFromTemplate,
  type ProfileApplicability,
  type TrainingRecord,
  type TrainingTemplate,
} from "@/lib/training-data";

export const EDUCATION_OFFICES = [
  ["seoul", "서울특별시교육청"],
  ["busan", "부산광역시교육청"],
  ["daegu", "대구광역시교육청"],
  ["incheon", "인천광역시교육청"],
  ["gwangju", "광주광역시교육청"],
  ["daejeon", "대전광역시교육청"],
  ["ulsan", "울산광역시교육청"],
  ["sejong", "세종특별자치시교육청"],
  ["gyeonggi", "경기도교육청"],
  ["gangwon", "강원특별자치도교육청"],
  ["chungbuk", "충청북도교육청"],
  ["chungnam", "충청남도교육청"],
  ["jeonbuk", "전북특별자치도교육청"],
  ["jeonnam", "전라남도교육청"],
  ["gyeongbuk", "경상북도교육청"],
  ["gyeongnam", "경상남도교육청"],
  ["jeju", "제주특별자치도교육청"],
] as const;

export const SCHOOL_TYPES = [
  ["public", "국공립학교"],
  ["private", "사립학교"],
] as const;

export const EMPLOYMENT_TYPES = [
  ["regular-teacher", "정규 교원"],
  ["contract-teacher", "기간제 교원"],
  ["education-worker", "교육공무직"],
  ["instructor-other", "강사·기타"],
] as const;

export const DUTY_OPTIONS = [
  ["learning-support", "학습지원 담당"],
  ["school-bus", "통학버스 담당"],
  ["playground", "놀이시설 안전관리"],
  ["fire-safety", "소방안전 담당"],
  ["field-trip", "현장체험학습 담당"],
  ["food-service", "급식 담당"],
  ["health", "보건 담당"],
  ["facility", "시설·산업안전 담당"],
  ["information-protection", "개인정보·정보보안 담당"],
] as const;

export type EducationOfficeCode = (typeof EDUCATION_OFFICES)[number][0];
export type SchoolType = (typeof SCHOOL_TYPES)[number][0];
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number][0];
export type DutyCode = (typeof DUTY_OPTIONS)[number][0];

export interface TeacherProfile {
  year: number;
  educationOffice: EducationOfficeCode | "";
  schoolType: SchoolType | "";
  employmentType: EmploymentType | "";
  contractUnderThreeYears: boolean | null;
  directlyEmployed: boolean | null;
  studentFacing: boolean | null;
  handlesPersonalData: boolean | null;
  duties: DutyCode[];
  configured: boolean;
  updatedAt: string;
}

export interface ApplicabilityRecommendation {
  decision: ProfileApplicability;
  reason: string;
}

export const PROFILE_RULE_VERSION = "2026.1";

const DUTY_TEMPLATES: Array<TrainingTemplate & { duty: DutyCode }> = [
  {
    duty: "learning-support",
    key: "duty-learning-support",
    title: "기초학력 보장 학습지원 담당교원 연수",
    category: "교육 활동",
    cycle: "지정 후 1년 이내",
    requiredHours: 0,
    guidance: "담당교원 지정일과 소속 교육청의 인정 시간·과정을 확인하세요.",
    sourceName: "국가법령정보센터",
    sourceUrl: "https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=280479",
  },
  {
    duty: "school-bus",
    key: "duty-school-bus",
    title: "통학버스 관계자 안전교육",
    category: "학생 안전",
    cycle: "담당업무별 확인",
    requiredHours: 0,
    guidance: "운전자·운영자·동승보호자 중 본인의 역할과 교육 주기를 확인하세요.",
  },
  {
    duty: "playground",
    key: "duty-playground",
    title: "어린이놀이시설 안전관리자 교육",
    category: "학생 안전",
    cycle: "선임일 기준 확인",
    requiredHours: 0,
    guidance: "안전관리자 선임일과 신규·보수교육 주기를 확인하세요.",
  },
  {
    duty: "fire-safety",
    key: "duty-fire-safety",
    title: "소방안전관리자·자위소방대 교육",
    category: "학생 안전",
    cycle: "담당업무별 확인",
    requiredHours: 0,
    guidance: "선임 여부와 학교 소방계획에서 요구하는 교육을 확인하세요.",
  },
  {
    duty: "field-trip",
    key: "duty-field-trip",
    title: "현장체험학습 안전교육",
    category: "학생 안전",
    cycle: "행사·담당별 확인",
    requiredHours: 0,
    guidance: "인솔자·안전요원 역할과 교육청 현장체험학습 지침을 확인하세요.",
  },
  {
    duty: "food-service",
    key: "duty-food-service",
    title: "학교급식 위생·안전교육",
    category: "학생 안전",
    cycle: "직무별 확인",
    requiredHours: 0,
    guidance: "영양·조리 업무와 소속 교육청의 급식 위생교육 기준을 확인하세요.",
  },
  {
    duty: "health",
    key: "duty-health",
    title: "보건·감염병 업무담당자 교육",
    category: "학생 안전",
    cycle: "담당업무별 확인",
    requiredHours: 0,
    guidance: "보건 담당자 추가교육과 감염병 대응 계획의 교육 기준을 확인하세요.",
  },
  {
    duty: "facility",
    key: "duty-facility-safety",
    title: "시설·산업안전보건 교육",
    category: "학생 안전",
    cycle: "직무별 확인",
    requiredHours: 0,
    guidance: "현업업무 종사 여부와 작업 종류에 따른 교육 시간을 확인하세요.",
  },
  {
    duty: "information-protection",
    key: "duty-information-protection",
    title: "개인정보·정보보안 담당자 전문교육",
    category: "정보 보호",
    cycle: "교육청 확인",
    requiredHours: 0,
    guidance: "업무담당자 과정과 소속 교육청의 정보보안 지침을 확인하세요.",
  },
];

const INSTRUCTOR_REVIEW_KEYS = new Set([
  "school-violence-semester-1",
  "school-violence-semester-2",
  "school-safety",
  "child-abuse-report",
  "disabled-abuse-report",
  "social-disability-awareness",
  "suicide-prevention",
  "violence-prevention",
  "teacher-rights",
  "information-disclosure",
]);

const PUBLIC_OFFICIAL_KEYS = new Set([
  "conflict-of-interest",
  "public-official-conduct",
]);

const PUBLIC_CHECK_KEYS = new Set([
  "anti-corruption",
  "infectious-disease",
  "gender-sensitivity",
  "unification",
]);

const TEACHER_ONLY_KEYS = new Set([
  "character-education",
  "prior-learning-prevention",
  "multicultural-understanding",
]);

export function createEmptyProfile(year: number): TeacherProfile {
  return {
    year,
    educationOffice: "",
    schoolType: "",
    employmentType: "",
    contractUnderThreeYears: null,
    directlyEmployed: null,
    studentFacing: null,
    handlesPersonalData: null,
    duties: [],
    configured: false,
    updatedAt: new Date(0).toISOString(),
  };
}

export function copyProfileToYear(
  profile: TeacherProfile,
  year: number,
): TeacherProfile {
  return {
    ...profile,
    year,
    updatedAt: new Date().toISOString(),
  };
}

export function getEducationOfficeLabel(code: EducationOfficeCode | "") {
  return EDUCATION_OFFICES.find(([value]) => value === code)?.[1] ?? "소속 교육청";
}

export function getEffectiveApplicability(record: TrainingRecord) {
  if (record.kind === "personal") return "applies" as const;
  if (record.applicabilityOverride) return record.applicabilityOverride;
  if (record.status === "completed" || record.status === "in-progress") {
    return "applies" as const;
  }
  return record.profileApplicability ?? "applies";
}

export function recommendApplicability(
  templateKey: string | undefined,
  profile: TeacherProfile,
): ApplicabilityRecommendation {
  if (!templateKey) {
    return { decision: "applies", reason: "사용자가 직접 추가한 연수입니다." };
  }

  const dutyTemplate = DUTY_TEMPLATES.find((template) => template.key === templateKey);
  if (dutyTemplate) {
    const selected = profile.duties.includes(dutyTemplate.duty);
    return selected
      ? {
          decision: "review",
          reason: `${dutyLabel(dutyTemplate.duty)} 담당자용 항목입니다. 교육청·학교 기준을 확인하세요.`,
        }
      : {
          decision: "not-applicable",
          reason: `${dutyLabel(dutyTemplate.duty)} 담당으로 선택하지 않았습니다.`,
        };
  }

  if (!profile.configured) {
    if (
      PUBLIC_OFFICIAL_KEYS.has(templateKey) ||
      PUBLIC_CHECK_KEYS.has(templateKey) ||
      TEACHER_ONLY_KEYS.has(templateKey) ||
      templateKey === "privacy" ||
      templateKey === "information-security"
    ) {
      return {
        decision: "review",
        reason: "근무 조건을 설정하면 적용 여부를 더 정확히 안내합니다.",
      };
    }
    return { decision: "applies", reason: "학교 교직원 공통 점검 항목입니다." };
  }

  const isTeacher =
    profile.employmentType === "regular-teacher" ||
    profile.employmentType === "contract-teacher";
  const isPublic = profile.schoolType === "public";
  const isInstructor = profile.employmentType === "instructor-other";
  const office = getEducationOfficeLabel(profile.educationOffice);

  if (PUBLIC_OFFICIAL_KEYS.has(templateKey)) {
    if (!isPublic || !isTeacher) {
      return {
        decision: "not-applicable",
        reason: "국공립 공무원·교원 중심 항목으로 현재 프로필에는 기본 제외를 추천합니다.",
      };
    }
    if (profile.employmentType === "contract-teacher") {
      return {
        decision: "review",
        reason: `기간제 교원의 적용 여부를 ${office} 안내에서 확인하세요.`,
      };
    }
    return { decision: "applies", reason: "국공립 정규 교원 프로필에 적용됩니다." };
  }

  if (PUBLIC_CHECK_KEYS.has(templateKey)) {
    if (!isPublic) {
      return {
        decision: "review",
        reason: `사립학교 적용 여부를 ${office}와 학교 연수계획에서 확인하세요.`,
      };
    }
    return {
      decision: "review",
      reason: `국공립 대상 여부와 인정 기준을 ${office} 안내에서 확인하세요.`,
    };
  }

  if (TEACHER_ONLY_KEYS.has(templateKey)) {
    if (!isTeacher) {
      return {
        decision: "not-applicable",
        reason: "교원 대상 항목으로 현재 고용 형태에는 기본 제외를 추천합니다.",
      };
    }
    if (templateKey === "character-education") {
      return { decision: "applies", reason: "교원 대상 공통 항목입니다." };
    }
    return {
      decision: "review",
      reason: `${office} 교원연수계획의 주기와 인정 시간을 확인하세요.`,
    };
  }

  if (templateKey === "first-aid-cpr") {
    if (isTeacher || profile.studentFacing === true) {
      return { decision: "applies", reason: "학생 대면업무 프로필에 적용됩니다." };
    }
    return {
      decision: "review",
      reason: "어린이 대면업무 여부와 학교의 교육 대상을 확인하세요.",
    };
  }

  if (templateKey === "privacy") {
    return profile.handlesPersonalData === true ||
      profile.duties.includes("information-protection")
      ? { decision: "applies", reason: "개인정보 취급·담당업무 프로필에 적용됩니다." }
      : {
          decision: "review",
          reason: `개인정보취급자 범위와 ${office} 내부관리계획을 확인하세요.`,
        };
  }

  if (templateKey === "information-security") {
    return {
      decision: "review",
      reason: profile.duties.includes("information-protection")
        ? `정보보안 담당자 과정과 ${office} 지침을 확인하세요.`
        : `${office} 정보보안 지침의 대상·주기를 확인하세요.`,
    };
  }

  if (templateKey === "anti-bribery" && isInstructor) {
    if (profile.directlyEmployed === true) {
      return { decision: "applies", reason: "학교와 직접 고용 관계가 있는 프로필입니다." };
    }
    return {
      decision: profile.directlyEmployed === false ? "not-applicable" : "review",
      reason: "학교와 직접 고용 관계가 있는지 확인하세요.",
    };
  }

  if (INSTRUCTOR_REVIEW_KEYS.has(templateKey) && isInstructor) {
    return {
      decision: "review",
      reason: "강사·기타 인력의 적용 범위를 학교 계약과 교육계획에서 확인하세요.",
    };
  }

  if (templateKey === "school-safety" && profile.employmentType === "contract-teacher") {
    if (profile.contractUnderThreeYears === false) {
      return {
        decision: "applies",
        reason: "3년 미만 계약이 아닌 기간제 교직원으로 최근 3년 누적 기준을 적용합니다.",
      };
    }
    return {
      decision: "review",
      reason:
        profile.contractUnderThreeYears === true
          ? "3년 미만 계약제 교직원은 학기별 기준을 적용할 수 있으므로 학교 계획을 확인하세요."
          : "계약기간에 따라 3년 누적 또는 학기별 기준이 달라질 수 있습니다.",
    };
  }

  return { decision: "applies", reason: "현재 근무 조건의 기본 점검 항목입니다." };
}

export function applyProfileRecommendations(
  records: TrainingRecord[],
  profile: TeacherProfile,
  year: number,
  recommendationUpdatedAt?: string,
) {
  const existingKeys = new Set(records.map((record) => record.templateKey));
  const additions = DUTY_TEMPLATES.filter(
    (template) => profile.duties.includes(template.duty) && !existingKeys.has(template.key),
  ).map((template) => createTrainingFromTemplate(template, year));

  return [...records, ...additions].map((record) => {
    if (record.kind === "personal") return record;
    const recommendation = recommendApplicability(record.templateKey, profile);
    const changed =
      record.profileApplicability !== recommendation.decision ||
      record.profileReason !== recommendation.reason;
    return {
      ...record,
      profileApplicability: recommendation.decision,
      profileReason: recommendation.reason,
      updatedAt:
        changed && recommendationUpdatedAt
          ? recommendationUpdatedAt
          : record.updatedAt,
    };
  });
}

export function recommendationCounts(
  records: TrainingRecord[],
  profile: TeacherProfile,
  year: number,
) {
  const evaluated = applyProfileRecommendations(records, profile, year);
  return evaluated.reduce(
    (counts, record) => {
      if (record.kind === "personal") return counts;
      const decision = record.profileApplicability ?? "applies";
      counts[decision] += 1;
      return counts;
    },
    { applies: 0, review: 0, "not-applicable": 0 } as Record<
      ProfileApplicability,
      number
    >,
  );
}

export interface SchoolSafetySummary {
  startYear: number;
  endYear: number;
  targetHours: number;
  totalHours: number;
  remainingHours: number;
  requirementMet: boolean;
  mode: "rolling" | "contract-check";
  byYear: Array<{ year: number; completedHours: number; exists: boolean }>;
}

export function getSchoolSafetySummary(
  recordsByYear: Record<string, TrainingRecord[]>,
  endYear: number,
  profile?: TeacherProfile,
): SchoolSafetySummary {
  const startYear = endYear - 2;
  const byYear = Array.from({ length: 3 }, (_, index) => {
    const year = startYear + index;
    const matchingRecords = (recordsByYear[String(year)] ?? []).filter(
      (item) =>
        item.templateKey === "school-safety" &&
        item.status !== "not-applicable" &&
        getEffectiveApplicability(item) !== "not-applicable",
    );
    return {
      year,
      completedHours: matchingRecords.reduce(
        (sum, record) => sum + Math.max(0, record.completedHours),
        0,
      ),
      exists: matchingRecords.length > 0,
    };
  });
  const totalHours = byYear.reduce((sum, item) => sum + item.completedHours, 0);
  const contractCheck =
    profile?.employmentType === "contract-teacher" &&
    profile.contractUnderThreeYears !== false;
  const targetHours = 15;

  return {
    startYear,
    endYear,
    targetHours,
    totalHours,
    remainingHours: Math.max(0, targetHours - totalHours),
    requirementMet: !contractCheck && totalHours >= targetHours,
    mode: contractCheck ? "contract-check" : "rolling",
    byYear,
  };
}

function dutyLabel(code: DutyCode) {
  return DUTY_OPTIONS.find(([value]) => value === code)?.[1] ?? "선택한 업무";
}
