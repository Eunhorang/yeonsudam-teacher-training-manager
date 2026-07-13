export type TrainingStatus =
  | "planned"
  | "in-progress"
  | "completed"
  | "not-applicable";
export type TrainingKind = "required" | "personal";
export type ProfileApplicability = "applies" | "review" | "not-applicable";
export type ApplicabilityOverride = "applies" | "not-applicable";

export const TRAINING_CATEGORIES = [
  "학생 안전",
  "인권·복지",
  "폭력 예방",
  "공직 윤리",
  "정보 보호",
  "교육 활동",
  "개인 역량",
] as const;

export type TrainingCategory = (typeof TRAINING_CATEGORIES)[number];

export interface TrainingRecord {
  id: string;
  templateKey?: string;
  title: string;
  category: TrainingCategory;
  kind: TrainingKind;
  cycle: string;
  requiredHours: number;
  completedHours: number;
  status: TrainingStatus;
  dueDate: string;
  completedDate: string;
  provider: string;
  method: string;
  memo: string;
  guidance: string;
  sourceName?: string;
  sourceUrl?: string;
  profileApplicability?: ProfileApplicability;
  profileReason?: string;
  applicabilityOverride?: ApplicabilityOverride;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingTemplate {
  key: string;
  title: string;
  category: TrainingCategory;
  cycle: string;
  requiredHours: number;
  guidance: string;
  sourceName?: string;
  sourceUrl?: string;
}

// 전남교육연수포털에서 한 과정으로 묶어 이수할 수 있는 기본 연수입니다.
// 학교폭력 예방교육은 앱에서 학기별로 점검하므로 두 항목 모두 같은 과정 표시를 사용합니다.
export const JEONNAM_PORTAL_COURSE_BY_TEMPLATE_KEY = {
  "violence-prevention": 1,
  "anti-corruption": 1,
  "anti-bribery": 1,
  "public-official-conduct": 1,
  "emergency-welfare-report": 1,
  "disabled-abuse-report": 1,
  "social-disability-awareness": 1,
  "information-disclosure": 1,
  "child-abuse-report": 1,
  "school-violence-semester-1": 2,
  "school-violence-semester-2": 2,
  "teacher-rights": 2,
  "character-education": 2,
  "suicide-prevention": 2,
  "conflict-of-interest": 2,
  "multicultural-understanding": 2,
} as const;

type JeonnamPortalTemplateKey =
  keyof typeof JEONNAM_PORTAL_COURSE_BY_TEMPLATE_KEY;

function portalTrainingTitle(
  templateKey: JeonnamPortalTemplateKey,
  title: string,
) {
  const course = JEONNAM_PORTAL_COURSE_BY_TEMPLATE_KEY[templateKey];
  return `${title} (전남교육연수포털 법정의무연수${course})`;
}

// 법령·교육청 지침은 대상자와 지역에 따라 달라질 수 있습니다.
// 따라서 기본 목록은 시작용 예시로 제공하고, 사용자가 모든 값을 수정할 수 있게 합니다.
export const DEFAULT_TRAINING_TEMPLATES: TrainingTemplate[] = [
  {
    key: "school-violence-semester-1",
    title: portalTrainingTitle(
      "school-violence-semester-1",
      "학교폭력 예방교육 · 1학기",
    ),
    category: "학생 안전",
    cycle: "학기별 1회",
    requiredHours: 0,
    guidance: "교직원 대상이며 시간은 학교장이 정합니다. 학교 집합교육 참석 기록도 확인하세요.",
    sourceName: "국가법령정보센터",
    sourceUrl: "https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=260695",
  },
  {
    key: "school-violence-semester-2",
    title: portalTrainingTitle(
      "school-violence-semester-2",
      "학교폭력 예방교육 · 2학기",
    ),
    category: "학생 안전",
    cycle: "학기별 1회",
    requiredHours: 0,
    guidance: "교직원 대상이며 시간은 학교장이 정합니다. 1학기 기록과 구분해 확인하세요.",
    sourceName: "국가법령정보센터",
    sourceUrl: "https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=260695",
  },
  {
    key: "school-safety",
    title: "학교안전교육",
    category: "학생 안전",
    cycle: "3년 누적 15시간",
    requiredHours: 0,
    guidance: "정규 교직원 기준입니다. 최근 3년의 인정 시간과 안전영역을 함께 확인하세요.",
    sourceName: "학교안전지원시스템",
    sourceUrl: "https://www.schoolsafe24.or.kr/front/contents/10009/cntntsView.do?menuSn=183&upperMenuSn=148",
  },
  {
    key: "first-aid-cpr",
    title: "어린이안전·응급처치·심폐소생술 교육",
    category: "학생 안전",
    cycle: "매년 4시간",
    requiredHours: 4,
    guidance: "초등교사는 실습 2시간을 포함한 총 4시간 기준으로 관리하는 것이 안전합니다.",
    sourceName: "국가법령정보센터",
    sourceUrl: "https://law.go.kr/LSW/lsInfoP.do?lsiSeq=260523",
  },
  {
    key: "child-abuse-report",
    title: portalTrainingTitle(
      "child-abuse-report",
      "아동학대 신고의무자 교육",
    ),
    category: "인권·복지",
    cycle: "매년 1시간",
    requiredHours: 1,
    guidance: "초·중등학교 종사자는 신고의무자입니다. 수료증의 인정 영역을 확인하세요.",
    sourceName: "국가법령정보센터",
    sourceUrl: "https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lspttninfSeq=77760",
  },
  {
    key: "emergency-welfare-report",
    title: portalTrainingTitle(
      "emergency-welfare-report",
      "긴급복지 신고의무자 교육",
    ),
    category: "인권·복지",
    cycle: "매년 1시간",
    requiredHours: 1,
    guidance: "교원·직원·강사 등이 대상입니다. 소속 기관의 인정 방식을 확인하세요.",
    sourceName: "국가법령정보센터",
    sourceUrl: "https://www.law.go.kr/LSW/LsiJoLinkP.do?docType=JO&joNo=000300000&languageType=KO&lsNm=%EA%B8%B4%EA%B8%89%EB%B3%B5%EC%A7%80%EC%A7%80%EC%9B%90%EB%B2%95+%EC%8B%9C%ED%96%89%EA%B7%9C%EC%B9%99&paras=1",
  },
  {
    key: "disabled-abuse-report",
    title: portalTrainingTitle(
      "disabled-abuse-report",
      "장애인학대·장애인 대상 성범죄 신고의무자 교육",
    ),
    category: "인권·복지",
    cycle: "매년 1시간",
    requiredHours: 1,
    guidance: "사회적 장애인식개선교육과 다른 항목이므로 수료증의 인정 영역을 확인하세요.",
    sourceName: "국가법령정보센터",
    sourceUrl: "https://law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lspttninfSeq=80549",
  },
  {
    key: "social-disability-awareness",
    title: portalTrainingTitle(
      "social-disability-awareness",
      "사회적 장애인식개선교육",
    ),
    category: "인권·복지",
    cycle: "매년 1시간",
    requiredHours: 1,
    guidance: "직장 내 장애인 인식개선교육과 법적 근거가 다릅니다. 통합 인정 여부를 확인하세요.",
    sourceName: "국가법령정보센터",
    sourceUrl: "https://www.law.go.kr/LSW/lsInfoP.do?ancYnChk=0&lsId=004628",
  },
  {
    key: "suicide-prevention",
    title: portalTrainingTitle(
      "suicide-prevention",
      "자살예방·생명존중 교육",
    ),
    category: "인권·복지",
    cycle: "매년 1회",
    requiredHours: 0,
    guidance: "전국 공통 최소시간은 정해져 있지 않습니다. 승인 프로그램과 교육청 기준을 확인하세요.",
    sourceName: "한국생명존중희망재단",
    sourceUrl: "https://edu.kfsp.or.kr/common/menu/html/900001001/detail.do",
  },
  {
    key: "violence-prevention",
    title: portalTrainingTitle("violence-prevention", "4대 폭력 예방교육"),
    category: "폭력 예방",
    cycle: "매년 총 4시간",
    requiredHours: 4,
    guidance: "성희롱·성폭력·성매매·가정폭력 각 1시간입니다. 4개 영역이 모두 인정되는지 확인하세요.",
    sourceName: "여성가족부 예방교육통합관리",
    sourceUrl: "https://shp.mogef.go.kr/",
  },
  {
    key: "teacher-rights",
    title: portalTrainingTitle(
      "teacher-rights",
      "교육활동 침해행위 예방교육",
    ),
    category: "교육 활동",
    cycle: "매년 1회",
    requiredHours: 0,
    guidance: "교직원 대상 기관 실시형 교육입니다. 학교 교육계획의 실시 시기를 확인하세요.",
    sourceName: "국가법령정보센터",
    sourceUrl: "https://www.law.go.kr/LSW/lsInfoP.do?ancYnChk=0&lsId=000886",
  },
  {
    key: "character-education",
    title: portalTrainingTitle("character-education", "인성교육"),
    category: "교육 활동",
    cycle: "매년 1시간",
    requiredHours: 1,
    guidance: "교원 대상 기준입니다. 교육부·교육감의 강화 기준이 있는지 확인하세요.",
    sourceName: "국가법령정보센터",
    sourceUrl: "https://www.law.go.kr/LSW/lsInfoP.do?ancYnChk=0&chrClsCd=010202&efYd=20260102&lsiSeq=280961&urlMode=lsInfoP",
  },
  {
    key: "anti-corruption",
    title: portalTrainingTitle("anti-corruption", "부패방지교육"),
    category: "공직 윤리",
    cycle: "매년 2시간",
    requiredHours: 2,
    guidance: "통합 청렴과정이라면 청탁금지·이해충돌·행동강령 내용이 실제 포함됐는지 확인하세요.",
    sourceName: "국가법령정보센터",
    sourceUrl: "https://law.go.kr/LSW/lsLinkCommonInfo.do?lspttninfSeq=136473",
  },
  {
    key: "anti-bribery",
    title: portalTrainingTitle("anti-bribery", "청탁금지법 교육"),
    category: "공직 윤리",
    cycle: "매년 1회",
    requiredHours: 0,
    guidance: "통합 청렴교육으로 이수했다면 과정 내용과 수료증을 확인하세요.",
    sourceName: "국가법령정보센터",
    sourceUrl: "https://law.go.kr/LSW/lsInfoP.do?lsiSeq=218421&viewCls=lsRvsDocInfoR",
  },
  {
    key: "conflict-of-interest",
    title: portalTrainingTitle(
      "conflict-of-interest",
      "이해충돌방지법 교육",
    ),
    category: "공직 윤리",
    cycle: "매년 1회",
    requiredHours: 0,
    guidance: "국공립 공직자 대상입니다. 사립학교 교직원은 적용 여부를 확인하세요.",
    sourceName: "국가법령정보센터",
    sourceUrl: "https://law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0024&lsiSeq=232253&urlMode=lsScJoRltInfoR",
  },
  {
    key: "public-official-conduct",
    title: portalTrainingTitle(
      "public-official-conduct",
      "공무원 행동강령 교육",
    ),
    category: "공직 윤리",
    cycle: "매년 1회",
    requiredHours: 0,
    guidance: "국공립 공무원 대상입니다. 사립교원·교육공무직은 적용 여부를 확인하세요.",
    sourceName: "국가법령정보센터",
    sourceUrl: "https://law.go.kr/lbook/lbFileDownload.do?flExt=pdf&lbookConflSeq=107763&lbookSeq=107389",
  },
  {
    key: "information-disclosure",
    title: portalTrainingTitle(
      "information-disclosure",
      "정보공개 제도 교육",
    ),
    category: "정보 보호",
    cycle: "매년 1회",
    requiredHours: 0,
    guidance: "교직원 대상 기관 실시형 교육이며 전국 공통 최소시간은 정해져 있지 않습니다.",
    sourceName: "국가법령정보센터",
    sourceUrl: "https://law.go.kr/lsInfoP.do?ancYnChk=0&lsId=002255",
  },
  {
    key: "infectious-disease",
    title: "감염병 예방·관리·위기대응 교육",
    category: "학생 안전",
    cycle: "대상자 매년 1회",
    requiredHours: 1,
    guidance: "국공립 공무원·직원 기준입니다. 사립학교는 동일 적용 여부를 확인하세요.",
    sourceName: "질병관리청",
    sourceUrl: "https://www.kdca.go.kr/kdca/3317/subview.do",
  },
  {
    key: "privacy",
    title: "개인정보 보호교육",
    category: "정보 보호",
    cycle: "교육청 확인",
    requiredHours: 0,
    guidance: "개인정보취급자 여부와 학교 내부관리계획에 따른 횟수·시간을 확인하세요.",
    sourceName: "개인정보보호위원회",
    sourceUrl: "https://www.pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS217&mCode=D010030000&nttId=10948",
  },
  {
    key: "information-security",
    title: "정보보안교육",
    category: "정보 보호",
    cycle: "교육청 확인",
    requiredHours: 0,
    guidance: "시·도교육청 정보보안 기본지침에 따른 횟수와 시간을 확인하세요.",
  },
  {
    key: "prior-learning-prevention",
    title: "선행교육·선행학습 예방교육",
    category: "교육 활동",
    cycle: "학교 계획",
    requiredHours: 0,
    guidance: "정기 실시 대상이지만 전국 공통 횟수·시간은 없습니다. 학교 계획을 확인하세요.",
    sourceName: "국가법령정보센터",
    sourceUrl: "https://www.law.go.kr/LSW/lsInfoP.do?chrClsCd=010202&lsId=012017&lsiSeq=268711&urlMode=lsInfoP",
  },
  {
    key: "gender-sensitivity",
    title: "성인지교육",
    category: "폭력 예방",
    cycle: "대상자 확인",
    requiredHours: 0,
    guidance: "국공립 공무원 적용 여부와 소속 교육청의 주기·시간을 확인하세요.",
    sourceName: "국가법령정보센터",
    sourceUrl: "https://law.go.kr/LSW/lsInfoP.do?lsiSeq=154260",
  },
  {
    key: "multicultural-understanding",
    title: portalTrainingTitle(
      "multicultural-understanding",
      "다문화 이해교육",
    ),
    category: "교육 활동",
    cycle: "교육청 확인",
    requiredHours: 0,
    guidance: "개인별 전국 고정시간이 없습니다. 시·도교육청 교원연수계획을 확인하세요.",
    sourceName: "국가법령정보센터",
    sourceUrl: "https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=281629",
  },
  {
    key: "unification",
    title: "공직자 통일교육",
    category: "교육 활동",
    cycle: "대상자 확인",
    requiredHours: 1,
    guidance: "국공립 교원 적용 여부와 소속 교육청의 인정 과정 안내를 확인하세요.",
    sourceName: "국립통일교육원",
    sourceUrl: "https://www.uniedu.go.kr/",
  },
];

export function createDefaultTrainings(year: number): TrainingRecord[] {
  return DEFAULT_TRAINING_TEMPLATES.map((template) =>
    createTrainingFromTemplate(template, year),
  );
}

// 이전 버전의 기본 제목과 정확히 같은 경우에만 새 포털 과정명을 붙입니다.
// 사용자가 직접 바꾼 제목과 수정 시각은 그대로 보존합니다.
export function normalizeDefaultTrainingTitle(
  templateKey: string | undefined,
  title: string,
) {
  if (
    !templateKey ||
    !Object.hasOwn(JEONNAM_PORTAL_COURSE_BY_TEMPLATE_KEY, templateKey)
  ) {
    return title;
  }
  const template = DEFAULT_TRAINING_TEMPLATES.find(
    (item) => item.key === templateKey,
  );
  if (!template) return title;
  const course =
    JEONNAM_PORTAL_COURSE_BY_TEMPLATE_KEY[
      templateKey as JeonnamPortalTemplateKey
    ];
  const suffix = ` (전남교육연수포털 법정의무연수${course})`;
  const previousDefaultTitle = template.title.slice(0, -suffix.length);
  return title === previousDefaultTitle ? template.title : title;
}

export function createTrainingFromTemplate(
  template: TrainingTemplate,
  year: number,
): TrainingRecord {
  // 손대지 않은 기본값은 언제나 사용자가 수정한 기록보다 오래된 값으로 취급합니다.
  // 그렇지 않으면 미래 연도의 1월 1일이 현재의 실제 수정본을 덮어쓸 수 있습니다.
  const timestamp = new Date(0).toISOString();

  return {
    id: `${year}-${template.key}`,
    templateKey: template.key,
    title: template.title,
    category: template.category,
    kind: "required",
    cycle: template.cycle,
    requiredHours: template.requiredHours,
    completedHours: 0,
    status: "planned",
    dueDate: `${year}-12-31`,
    completedDate: "",
    provider: "",
    method: "온라인",
    memo: "",
    guidance: template.guidance,
    sourceName: template.sourceName,
    sourceUrl: template.sourceUrl,
    profileApplicability: "applies",
    profileReason: "프로필을 설정하면 적용 대상을 더 정확히 안내합니다.",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export const STATUS_LABELS: Record<TrainingStatus, string> = {
  planned: "시작 전",
  "in-progress": "진행 중",
  completed: "이수 완료",
  "not-applicable": "해당 없음",
};

export const KIND_LABELS: Record<TrainingKind, string> = {
  required: "의무연수",
  personal: "나의 연수",
};
