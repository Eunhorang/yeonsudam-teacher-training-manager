"use client";

import {
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createDefaultTrainings,
  KIND_LABELS,
  STATUS_LABELS,
  TRAINING_CATEGORIES,
  type TrainingCategory,
  type TrainingKind,
  type TrainingRecord,
  type TrainingStatus,
} from "@/lib/training-data";

const STORAGE_KEY = "teacher-training-manager:v2";
const STORAGE_VERSION = 2;

type KindFilter = "all" | TrainingKind;
type StatusFilter = "all" | TrainingStatus;
type CategoryFilter = "all" | TrainingCategory;

interface StoredTrainingState {
  version: number;
  activeYear: number;
  recordsByYear: Record<string, TrainingRecord[]>;
}

interface TrainingFormValues {
  title: string;
  category: TrainingCategory;
  kind: TrainingKind;
  cycle: string;
  requiredHours: string;
  completedHours: string;
  status: TrainingStatus;
  dueDate: string;
  completedDate: string;
  provider: string;
  method: string;
  memo: string;
  guidance: string;
}

interface DeletedRecord {
  year: number;
  index: number;
  record: TrainingRecord;
}

const STATUS_ORDER: Record<TrainingStatus, number> = {
  planned: 0,
  "in-progress": 1,
  completed: 2,
  "not-applicable": 3,
};

function todayForInput() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function createBlankForm(year: number): TrainingFormValues {
  return {
    title: "",
    category: "개인 역량",
    kind: "personal",
    cycle: "자율",
    requiredHours: "",
    completedHours: "",
    status: "planned",
    dueDate: `${year}-12-31`,
    completedDate: "",
    provider: "",
    method: "온라인",
    memo: "",
    guidance: "",
  };
}

function recordToForm(record: TrainingRecord): TrainingFormValues {
  return {
    title: record.title,
    category: record.category,
    kind: record.kind,
    cycle: record.cycle,
    requiredHours:
      record.requiredHours > 0 ? String(record.requiredHours) : "",
    completedHours:
      record.completedHours > 0 ? String(record.completedHours) : "",
    status: record.status,
    dueDate: record.dueDate,
    completedDate: record.completedDate,
    provider: record.provider,
    method: record.method,
    memo: record.memo,
    guidance: record.guidance,
  };
}

function parseHours(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function formatHours(value: number) {
  return Number.isInteger(value) ? `${value}시간` : `${value.toFixed(1)}시간`;
}

function formatDate(date: string) {
  if (!date) return "날짜 미정";
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return date;
  return `${Number(month)}월 ${Number(day)}일`;
}

function dueLabel(record: TrainingRecord) {
  if (record.status === "completed") return "완료";
  if (record.status === "not-applicable") return "해당 없음";
  if (!record.dueDate) return "기한 미정";

  const due = new Date(`${record.dueDate}T23:59:59`);
  const now = new Date();
  const days = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)}일 지남`;
  if (days === 0) return "오늘까지";
  return `D-${days}`;
}

function requirementMet(record: TrainingRecord) {
  if (record.status !== "completed") return false;
  return (
    record.requiredHours === 0 ||
    record.completedHours >= record.requiredHours
  );
}

function downloadTextFile(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function normalizeImportedRecord(
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
  const kind: TrainingKind =
    candidate.kind === "required" ? "required" : "personal";
  const timestamp = new Date().toISOString();

  return {
    id:
      typeof candidate.id === "string" && candidate.id
        ? candidate.id
        : `imported-${year}-${index}-${Date.now()}`,
    templateKey:
      typeof candidate.templateKey === "string"
        ? candidate.templateKey
        : undefined,
    title: candidate.title.trim(),
    category,
    kind,
    cycle:
      typeof candidate.cycle === "string" && candidate.cycle
        ? candidate.cycle
        : "자율",
    requiredHours:
      typeof candidate.requiredHours === "number" &&
      candidate.requiredHours >= 0
        ? candidate.requiredHours
        : 0,
    completedHours:
      typeof candidate.completedHours === "number" &&
      candidate.completedHours >= 0
        ? candidate.completedHours
        : 0,
    status,
    dueDate: typeof candidate.dueDate === "string" ? candidate.dueDate : "",
    completedDate:
      typeof candidate.completedDate === "string"
        ? candidate.completedDate
        : "",
    provider:
      typeof candidate.provider === "string" ? candidate.provider : "",
    method: typeof candidate.method === "string" ? candidate.method : "기타",
    memo: typeof candidate.memo === "string" ? candidate.memo : "",
    guidance:
      typeof candidate.guidance === "string" ? candidate.guidance : "",
    sourceName:
      typeof candidate.sourceName === "string"
        ? candidate.sourceName
        : undefined,
    sourceUrl:
      typeof candidate.sourceUrl === "string" ? candidate.sourceUrl : undefined,
    createdAt:
      typeof candidate.createdAt === "string" ? candidate.createdAt : timestamp,
    updatedAt: timestamp,
  };
}

function parseBackup(value: unknown): StoredTrainingState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<StoredTrainingState>;
  if (
    !candidate.recordsByYear ||
    typeof candidate.recordsByYear !== "object" ||
    Array.isArray(candidate.recordsByYear)
  ) {
    return null;
  }

  const normalized: Record<string, TrainingRecord[]> = {};
  for (const [yearKey, records] of Object.entries(candidate.recordsByYear)) {
    const year = Number(yearKey);
    if (!Number.isInteger(year) || !Array.isArray(records)) continue;
    normalized[yearKey] = records
      .map((record, index) => normalizeImportedRecord(record, year, index))
      .filter((record): record is TrainingRecord => record !== null);
  }

  const availableYears = Object.keys(normalized).map(Number);
  if (availableYears.length === 0) return null;
  const requestedYear = Number(candidate.activeYear);
  const activeYear = availableYears.includes(requestedYear)
    ? requestedYear
    : availableYears.sort((a, b) => b - a)[0];

  return {
    version: STORAGE_VERSION,
    activeYear,
    recordsByYear: normalized,
  };
}

export function TrainingManager() {
  const currentYear = new Date().getFullYear();
  const [activeYear, setActiveYear] = useState(currentYear);
  const [recordsByYear, setRecordsByYear] = useState<
    Record<string, TrainingRecord[]>
  >({ [currentYear]: createDefaultTrainings(currentYear) });
  const [ready, setReady] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] =
    useState<CategoryFilter>("all");
  const [editingRecord, setEditingRecord] = useState<TrainingRecord | null>(
    null,
  );
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<TrainingFormValues>(() =>
    createBlankForm(currentYear),
  );
  const [toast, setToast] = useState("");
  const [lastDeleted, setLastDeleted] = useState<DeletedRecord | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const records = useMemo(
    () => recordsByYear[String(activeYear)] ?? [],
    [activeYear, recordsByYear],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = parseBackup(JSON.parse(saved));
          if (parsed) {
            setRecordsByYear(parsed.recordsByYear);
            setActiveYear(parsed.activeYear);
          } else {
            setStorageWarning(
              "저장된 기록을 읽지 못했습니다. 현재 화면의 기본 목록은 안전하게 유지됩니다.",
            );
          }
        }
      } catch {
        setStorageWarning(
          "브라우저 저장 기록을 읽지 못했습니다. 백업 파일이 있다면 데이터 관리에서 불러와 주세요.",
        );
      } finally {
        setReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      const state: StoredTrainingState = {
        version: STORAGE_VERSION,
        activeYear,
        recordsByYear,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      window.setTimeout(
        () =>
          setStorageWarning(
            "기록을 브라우저에 저장하지 못했습니다. 데이터 관리에서 백업 파일을 내려받아 주세요.",
          ),
        0,
      );
    }
  }, [activeYear, ready, recordsByYear]);

  useEffect(() => {
    if (!ready) return;
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const parsed = parseBackup(JSON.parse(event.newValue));
        if (!parsed) return;
        setRecordsByYear(parsed.recordsByYear);
        setActiveYear(parsed.activeYear);
        setToast("다른 창에서 바뀐 최신 기록을 불러왔습니다.");
      } catch {
        // 다른 창의 불완전한 값은 현재 화면에 적용하지 않습니다.
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [ready]);

  useEffect(() => {
    if (!formOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFormOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [formOpen]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      setToast("");
      setLastDeleted(null);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const metrics = useMemo(() => {
    const applicableRequired = records.filter(
      (record) =>
        record.kind === "required" && record.status !== "not-applicable",
    );
    const completedRequired = applicableRequired.filter(requirementMet);
    const totalHours = records.reduce(
      (sum, record) => sum + record.completedHours,
      0,
    );
    const inProgress = records.filter(
      (record) => record.status === "in-progress",
    ).length;
    const completedPersonal = records.filter(
      (record) => record.kind === "personal" && requirementMet(record),
    ).length;
    const rate = applicableRequired.length
      ? Math.round(
          (completedRequired.length / applicableRequired.length) * 100,
        )
      : 0;

    return {
      requiredTotal: applicableRequired.length,
      requiredCompleted: completedRequired.length,
      requiredRemaining:
        applicableRequired.length - completedRequired.length,
      inProgress,
      totalHours,
      completedPersonal,
      rate,
    };
  }, [records]);

  const filteredRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");

    return records
      .filter((record) => {
        if (kindFilter !== "all" && record.kind !== kindFilter) return false;
        if (statusFilter !== "all" && record.status !== statusFilter) {
          return false;
        }
        if (categoryFilter !== "all" && record.category !== categoryFilter) {
          return false;
        }
        if (!normalizedQuery) return true;
        return [record.title, record.provider, record.memo, record.category]
          .join(" ")
          .toLocaleLowerCase("ko-KR")
          .includes(normalizedQuery);
      })
      .sort((a, b) => {
        const statusDifference = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        if (statusDifference !== 0) return statusDifference;
        if (a.kind !== b.kind) return a.kind === "required" ? -1 : 1;
        return a.title.localeCompare(b.title, "ko-KR");
      });
  }, [categoryFilter, kindFilter, query, records, statusFilter]);

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    for (let year = currentYear - 4; year <= currentYear + 4; year += 1) {
      years.add(year);
    }
    Object.keys(recordsByYear).forEach((year) => years.add(Number(year)));
    years.add(activeYear);
    return Array.from(years).sort((a, b) => b - a);
  }, [activeYear, currentYear, recordsByYear]);

  const setYear = (year: number) => {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return;
    setRecordsByYear((previous) => {
      if (previous[String(year)]) return previous;
      return { ...previous, [year]: createDefaultTrainings(year) };
    });
    setActiveYear(year);
    setQuery("");
    setStatusFilter("all");
    setCategoryFilter("all");
  };

  const updateActiveRecords = (
    updater: (current: TrainingRecord[]) => TrainingRecord[],
  ) => {
    setRecordsByYear((previous) => ({
      ...previous,
      [activeYear]: updater(
        previous[String(activeYear)] ?? createDefaultTrainings(activeYear),
      ),
    }));
  };

  const openAddForm = () => {
    setEditingRecord(null);
    setForm(createBlankForm(activeYear));
    setFormOpen(true);
  };

  const openEditForm = (record: TrainingRecord) => {
    setEditingRecord(record);
    setForm(recordToForm(record));
    setFormOpen(true);
  };

  const saveForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.title.trim()) return;

    const requiredHours = parseHours(form.requiredHours);
    let completedHours = parseHours(form.completedHours);
    let completedDate = form.completedDate;
    if (form.status === "completed") {
      completedDate ||= todayForInput();
      if (completedHours === 0 && requiredHours > 0) {
        completedHours = requiredHours;
      }
    }
    if (form.status === "not-applicable") {
      completedHours = 0;
      completedDate = "";
    }

    const timestamp = new Date().toISOString();
    const savedRecord: TrainingRecord = {
      id:
        editingRecord?.id ??
        globalThis.crypto?.randomUUID?.() ??
        `training-${Date.now()}`,
      templateKey: editingRecord?.templateKey,
      title: form.title.trim(),
      category: form.category,
      kind: form.kind,
      cycle: form.cycle.trim() || "자율",
      requiredHours,
      completedHours,
      status: form.status,
      dueDate: form.dueDate,
      completedDate,
      provider: form.provider.trim(),
      method: form.method,
      memo: form.memo.trim(),
      guidance: form.guidance.trim(),
      sourceName: editingRecord?.sourceName,
      sourceUrl: editingRecord?.sourceUrl,
      createdAt: editingRecord?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };

    updateActiveRecords((current) =>
      editingRecord
        ? current.map((record) =>
            record.id === editingRecord.id ? savedRecord : record,
          )
        : [savedRecord, ...current],
    );
    setFormOpen(false);
    setToast(editingRecord ? "연수 기록을 수정했습니다." : "새 연수를 추가했습니다.");
  };

  const toggleCompleted = (record: TrainingRecord) => {
    const completing = record.status !== "completed";
    updateActiveRecords((current) =>
      current.map((item) =>
        item.id === record.id
          ? {
              ...item,
              status: completing ? "completed" : "planned",
              completedHours: completing
                ? item.completedHours || item.requiredHours
                : 0,
              completedDate: completing ? todayForInput() : "",
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    );
    setToast(completing ? "이수 완료로 기록했습니다." : "완료 표시를 취소했습니다.");
  };

  const deleteEditingRecord = () => {
    if (!editingRecord) return;
    const index = records.findIndex((record) => record.id === editingRecord.id);
    if (index < 0) return;
    setLastDeleted({ year: activeYear, index, record: editingRecord });
    updateActiveRecords((current) =>
      current.filter((record) => record.id !== editingRecord.id),
    );
    setFormOpen(false);
    setToast("연수 기록을 삭제했습니다.");
  };

  const undoDelete = () => {
    if (!lastDeleted) return;
    setRecordsByYear((previous) => {
      const yearRecords = [...(previous[String(lastDeleted.year)] ?? [])];
      yearRecords.splice(lastDeleted.index, 0, lastDeleted.record);
      return { ...previous, [lastDeleted.year]: yearRecords };
    });
    setLastDeleted(null);
    setToast("삭제한 기록을 되돌렸습니다.");
  };

  const restoreMissingDefaults = () => {
    const defaults = createDefaultTrainings(activeYear);
    const existingKeys = new Set(records.map((record) => record.templateKey));
    const missing = defaults.filter(
      (record) => record.templateKey && !existingKeys.has(record.templateKey),
    );
    if (missing.length === 0) {
      setToast("기본 연수 목록이 모두 들어 있습니다.");
      return;
    }
    updateActiveRecords((current) => [...current, ...missing]);
    setToast(`빠진 기본 연수 ${missing.length}개를 다시 넣었습니다.`);
  };

  const copyPreviousPersonalTrainings = () => {
    const previous = recordsByYear[String(activeYear - 1)] ?? [];
    const previousPersonal = previous.filter(
      (record) => record.kind === "personal",
    );
    if (previousPersonal.length === 0) {
      setToast(`${activeYear - 1}년에 가져올 개인 연수가 없습니다.`);
      return;
    }
    const existingTitles = new Set(
      records
        .filter((record) => record.kind === "personal")
        .map((record) => record.title.trim().toLocaleLowerCase("ko-KR")),
    );
    const timestamp = new Date().toISOString();
    const additions = previousPersonal
      .filter(
        (record) =>
          !existingTitles.has(record.title.trim().toLocaleLowerCase("ko-KR")),
      )
      .map((record, index) => ({
        ...record,
        id: `copied-${activeYear}-${Date.now()}-${index}`,
        status: "planned" as TrainingStatus,
        completedHours: 0,
        completedDate: "",
        dueDate: `${activeYear}-12-31`,
        createdAt: timestamp,
        updatedAt: timestamp,
      }));
    if (additions.length === 0) {
      setToast("전년도 개인 연수가 이미 모두 들어 있습니다.");
      return;
    }
    updateActiveRecords((current) => [...additions, ...current]);
    setToast(`전년도 개인 연수 ${additions.length}개를 가져왔습니다.`);
  };

  const exportBackup = () => {
    const date = todayForInput().replaceAll("-", "");
    const data: StoredTrainingState = {
      version: STORAGE_VERSION,
      activeYear,
      recordsByYear,
    };
    downloadTextFile(
      `${date}_연수관리_전체백업.json`,
      JSON.stringify(data, null, 2),
      "application/json;charset=utf-8",
    );
    setToast("전체 연도 백업 파일을 저장했습니다.");
  };

  const exportCsv = () => {
    const headers = [
      "연도",
      "구분",
      "연수명",
      "분류",
      "상태",
      "주기",
      "기준 시간",
      "이수 시간",
      "이수일",
      "기관",
      "방식",
      "메모",
    ];
    const escape = (value: string | number) =>
      `"${String(value).replaceAll('"', '""')}"`;
    const rows = records.map((record) =>
      [
        activeYear,
        KIND_LABELS[record.kind],
        record.title,
        record.category,
        STATUS_LABELS[record.status],
        record.cycle,
        record.requiredHours || "",
        record.completedHours || "",
        record.completedDate,
        record.provider,
        record.method,
        record.memo,
      ]
        .map(escape)
        .join(","),
    );
    const date = todayForInput().replaceAll("-", "");
    downloadTextFile(
      `${date}_${activeYear}년_연수기록.csv`,
      `\uFEFF${headers.map(escape).join(",")}\n${rows.join("\n")}`,
      "text/csv;charset=utf-8",
    );
    setToast(`${activeYear}년 연수 기록을 표 파일로 저장했습니다.`);
  };

  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = parseBackup(JSON.parse(await file.text()));
      if (!parsed) throw new Error("invalid backup");
      setRecordsByYear(parsed.recordsByYear);
      setActiveYear(parsed.activeYear);
      setToast(
        `${Object.keys(parsed.recordsByYear).length}개 연도의 백업을 불러왔습니다.`,
      );
    } catch {
      setToast("백업 파일 형식이 맞지 않아 기존 기록을 그대로 유지했습니다.");
    }
  };

  const clearFilters = () => {
    setQuery("");
    setKindFilter("all");
    setStatusFilter("all");
    setCategoryFilter("all");
  };

  const ringStyle = {
    "--progress-angle": `${metrics.rate * 3.6}deg`,
  } as CSSProperties;

  return (
    <div className="training-app">
      <header className="site-header no-print">
        <div className="header-inner">
          <a className="brand" href="#top" aria-label="연수담 처음으로">
            <span className="brand-mark" aria-hidden="true">
              담
            </span>
            <span>
              <strong>연수담</strong>
              <small>교사 연수 기록장</small>
            </span>
          </a>

          <div className="header-actions">
            <div className="year-switcher" aria-label="관리 연도 선택">
              <button
                type="button"
                onClick={() => setYear(activeYear - 1)}
                aria-label={`${activeYear - 1}년으로 이동`}
              >
                ←
              </button>
              <select
                value={activeYear}
                onChange={(event) => setYear(Number(event.target.value))}
                aria-label="관리 연도"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}년
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setYear(activeYear + 1)}
                aria-label={`${activeYear + 1}년으로 이동`}
              >
                →
              </button>
            </div>
            <button className="primary-button" type="button" onClick={openAddForm}>
              <span aria-hidden="true">＋</span> 연수 추가
            </button>
          </div>
        </div>
      </header>

      <div className="print-heading print-only">
        <strong>연수담</strong>
        <span>{activeYear}년 개인 연수 이수 현황</span>
      </div>

      <main className="app-main" id="top">
        <section className="hero-section" aria-labelledby="dashboard-title">
          <div className="hero-copy">
            <span className="eyebrow">{activeYear} TRAINING NOTE</span>
            <h1 id="dashboard-title">
              올해의 연수,
              <br />
              한눈에 챙겨보세요.
            </h1>
            <p>
              법정·의무연수부터 내가 선택한 연수까지,
              <br className="desktop-break" /> 놓치지 않도록 차곡차곡
              기록합니다.
            </p>
            <div className="local-badge">
              <span aria-hidden="true">●</span>
              기록은 이 브라우저에만 저장됩니다
            </div>
          </div>

          <div className="progress-panel">
            <div
              className="progress-ring"
              style={ringStyle}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={metrics.rate}
              aria-label={`의무연수 ${metrics.rate}% 완료`}
            >
              <div className="progress-ring-inner">
                <strong>{metrics.rate}</strong>
                <span>%</span>
                <small>의무연수 완료</small>
              </div>
            </div>
            <div className="progress-summary">
              <span>지금까지</span>
              <strong>
                {metrics.requiredCompleted} / {metrics.requiredTotal}개
              </strong>
              <p>
                {metrics.requiredRemaining === 0 && metrics.requiredTotal > 0
                  ? "올해 적용한 의무연수를 모두 마쳤어요."
                  : `남은 의무연수 ${metrics.requiredRemaining}개를 확인해 보세요.`}
              </p>
            </div>
          </div>
        </section>

        <section className="summary-grid" aria-label="연수 요약">
          <article className="summary-card accent-card">
            <span className="summary-icon" aria-hidden="true">
              ✓
            </span>
            <div>
              <small>완료한 의무연수</small>
              <strong>{metrics.requiredCompleted}개</strong>
            </div>
          </article>
          <article className="summary-card">
            <span className="summary-icon amber" aria-hidden="true">
              ↻
            </span>
            <div>
              <small>진행 중</small>
              <strong>{metrics.inProgress}개</strong>
            </div>
          </article>
          <article className="summary-card">
            <span className="summary-icon blue" aria-hidden="true">
              ◷
            </span>
            <div>
              <small>올해 이수 시간</small>
              <strong>{formatHours(metrics.totalHours)}</strong>
            </div>
          </article>
          <article className="summary-card">
            <span className="summary-icon violet" aria-hidden="true">
              ＋
            </span>
            <div>
              <small>완료한 나의 연수</small>
              <strong>{metrics.completedPersonal}개</strong>
            </div>
          </article>
        </section>

        {storageWarning ? (
          <div className="storage-warning" role="alert">
            <strong>저장 상태를 확인해 주세요.</strong>
            <span>{storageWarning}</span>
          </div>
        ) : null}

        <section className="records-section" aria-labelledby="records-title">
          <div className="section-heading">
            <div>
              <span className="section-kicker">MY TRAINING</span>
              <h2 id="records-title">{activeYear}년 연수 목록</h2>
              <p>완료 여부를 누르거나 세부 기록을 직접 수정할 수 있어요.</p>
            </div>
            <details className="data-menu no-print">
              <summary>데이터 관리</summary>
              <div className="data-menu-panel">
                <button type="button" onClick={exportCsv}>
                  이 연도 표 파일 저장
                </button>
                <button type="button" onClick={() => window.print()}>
                  인쇄·PDF 저장
                </button>
                <button type="button" onClick={exportBackup}>
                  전체 연도 백업
                </button>
                <button
                  type="button"
                  onClick={() => importInputRef.current?.click()}
                >
                  백업 파일 불러오기
                </button>
                <hr />
                <button type="button" onClick={copyPreviousPersonalTrainings}>
                  전년도 개인 연수 가져오기
                </button>
                <button type="button" onClick={restoreMissingDefaults}>
                  빠진 기본 목록 복원
                </button>
              </div>
            </details>
            <input
              ref={importInputRef}
              className="visually-hidden"
              type="file"
              accept="application/json,.json"
              onChange={importBackup}
              tabIndex={-1}
            />
          </div>

          <div className="filter-surface no-print">
            <div className="kind-tabs" role="group" aria-label="연수 구분">
              {(
                [
                  ["all", "전체"],
                  ["required", "의무연수"],
                  ["personal", "나의 연수"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={kindFilter === value ? "active" : ""}
                  aria-pressed={kindFilter === value}
                  onClick={() => setKindFilter(value)}
                >
                  {label}
                  <span>
                    {value === "all"
                      ? records.length
                      : records.filter((record) => record.kind === value).length}
                  </span>
                </button>
              ))}
            </div>
            <div className="filter-controls">
              <label className="search-box">
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="연수명, 기관, 메모 검색"
                  aria-label="연수 검색"
                />
              </label>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as StatusFilter)
                }
                aria-label="이수 상태 필터"
              >
                <option value="all">모든 상태</option>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                value={categoryFilter}
                onChange={(event) =>
                  setCategoryFilter(event.target.value as CategoryFilter)
                }
                aria-label="연수 분류 필터"
              >
                <option value="all">모든 분류</option>
                {TRAINING_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="result-caption">
            <span>
              총 <strong>{filteredRecords.length}</strong>개
            </span>
            {(query ||
              kindFilter !== "all" ||
              statusFilter !== "all" ||
              categoryFilter !== "all") && (
              <button className="no-print" type="button" onClick={clearFilters}>
                필터 초기화
              </button>
            )}
          </div>

          {filteredRecords.length > 0 ? (
            <div className="training-list">
              <div className="training-list-header" aria-hidden="true">
                <span>상태</span>
                <span>연수 정보</span>
                <span>기준·시간</span>
                <span>기한</span>
                <span>관리</span>
              </div>
              {filteredRecords.map((record) => {
                const met = requirementMet(record);
                const shortOnHours =
                  record.status === "completed" &&
                  record.requiredHours > 0 &&
                  record.completedHours < record.requiredHours;
                const progress =
                  record.requiredHours > 0
                    ? Math.min(
                        100,
                        Math.round(
                          (record.completedHours / record.requiredHours) * 100,
                        ),
                      )
                    : met
                      ? 100
                      : 0;

                return (
                  <article
                    className={`training-row status-${record.status}`}
                    key={record.id}
                  >
                    <div className="row-status">
                      <button
                        className={`complete-check ${met ? "checked" : ""}`}
                        type="button"
                        onClick={() => toggleCompleted(record)}
                        aria-label={
                          record.status === "completed"
                            ? `${record.title} 완료 취소`
                            : `${record.title} 이수 완료 처리`
                        }
                      >
                        <span aria-hidden="true">✓</span>
                      </button>
                      <span className={`status-label ${record.status}`}>
                        {STATUS_LABELS[record.status]}
                      </span>
                    </div>

                    <div className="row-main">
                      <div className="row-tags">
                        <span className={`kind-tag ${record.kind}`}>
                          {KIND_LABELS[record.kind]}
                        </span>
                        <span className="category-tag">{record.category}</span>
                      </div>
                      <h3>{record.title}</h3>
                      <div className="row-details">
                        {record.provider ? <span>{record.provider}</span> : null}
                        {record.completedDate ? (
                          <span>{formatDate(record.completedDate)} 이수</span>
                        ) : null}
                        {record.memo ? <span className="memo-text">{record.memo}</span> : null}
                      </div>
                      {record.guidance ? (
                        <p className="guidance-text">{record.guidance}</p>
                      ) : null}
                      {shortOnHours ? (
                        <p className="hours-warning" role="status">
                          완료로 표시했지만 기준 시간보다 {formatHours(
                            record.requiredHours - record.completedHours,
                          )} 부족합니다.
                        </p>
                      ) : null}
                    </div>

                    <div className="row-hours">
                      <strong>{record.cycle}</strong>
                      <span>
                        {record.requiredHours > 0
                          ? `${formatHours(record.completedHours)} / ${formatHours(record.requiredHours)}`
                          : record.completedHours > 0
                            ? `${formatHours(record.completedHours)} 이수`
                            : "시간 확인 필요"}
                      </span>
                      <div className="mini-progress" aria-hidden="true">
                        <span style={{ width: `${progress}%` }} />
                      </div>
                    </div>

                    <div className="row-due">
                      <span className="mobile-label">기한</span>
                      <strong>{formatDate(record.dueDate)}</strong>
                      <small>{dueLabel(record)}</small>
                    </div>

                    <div className="row-actions no-print">
                      {record.sourceUrl ? (
                        <a
                          href={record.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`${record.title} 공식 근거 새 창에서 보기`}
                          title={record.sourceName ?? "공식 근거 보기"}
                        >
                          근거 ↗
                        </a>
                      ) : null}
                      <button type="button" onClick={() => openEditForm(record)}>
                        수정
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <span aria-hidden="true">○</span>
              <h3>조건에 맞는 연수가 없어요.</h3>
              <p>검색어와 필터를 바꾸거나 새 연수를 추가해 보세요.</p>
              <div>
                <button type="button" onClick={clearFilters}>
                  필터 초기화
                </button>
                <button type="button" onClick={openAddForm}>
                  연수 추가
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="notice-section">
          <div className="notice-icon" aria-hidden="true">
            i
          </div>
          <div>
            <h2>기본 목록은 점검을 돕는 참고용이에요.</h2>
            <p>
              실제 이수 대상·시간·인정 방식은 지역, 학교 유형, 고용 형태,
              담당 업무에 따라 달라질 수 있습니다. 해당 연도 학교와 소속
              교육청의 안내를 우선 확인한 뒤 항목을 수정해 주세요.
            </p>
            <div className="notice-links no-print">
              <a
                href="https://www.law.go.kr/"
                target="_blank"
                rel="noreferrer"
              >
                국가법령정보센터 ↗
              </a>
              <a
                href="https://www.schoolsafe24.or.kr/"
                target="_blank"
                rel="noreferrer"
              >
                학교안전지원시스템 ↗
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer no-print">
        <div>
          <strong>연수담</strong>
          <span>선생님의 한 해를 빠짐없이 기록하는 작은 도구</span>
        </div>
        <p>
          입력한 자료는 별도 서버로 전송되지 않습니다. 브라우저 데이터 삭제나
          기기 변경에 대비해 정기적으로 백업하고, 공용 PC에서는 학생 이름 등
          개인정보를 입력하지 마세요.
        </p>
      </footer>

      {formOpen ? (
        <div
          className="modal-backdrop no-print"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setFormOpen(false);
          }}
        >
          <section
            className="training-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="training-form-title"
          >
            <div className="modal-header">
              <div>
                <span>{editingRecord ? "EDIT TRAINING" : "NEW TRAINING"}</span>
                <h2 id="training-form-title">
                  {editingRecord ? "연수 기록 수정" : "새 연수 추가"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                aria-label="입력창 닫기"
              >
                ×
              </button>
            </div>

            <form onSubmit={saveForm}>
              <div className="modal-body">
                <label className="field full-field">
                  <span>
                    연수명 <b>*</b>
                  </span>
                  <input
                    autoFocus
                    required
                    maxLength={100}
                    value={form.title}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        title: event.target.value,
                      }))
                    }
                    placeholder="예: 디지털 기반 수업 설계 연수"
                  />
                </label>

                <div className="form-grid">
                  <label className="field">
                    <span>관리 구분</span>
                    <select
                      value={form.kind}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          kind: event.target.value as TrainingKind,
                        }))
                      }
                    >
                      <option value="required">의무연수</option>
                      <option value="personal">나의 연수</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>분류</span>
                    <select
                      value={form.category}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          category: event.target.value as TrainingCategory,
                        }))
                      }
                    >
                      {TRAINING_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>이수 상태</span>
                    <select
                      value={form.status}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          status: event.target.value as TrainingStatus,
                        }))
                      }
                    >
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>이수 주기</span>
                    <input
                      maxLength={30}
                      value={form.cycle}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          cycle: event.target.value,
                        }))
                      }
                      placeholder="예: 매년, 3년마다"
                    />
                  </label>
                  <label className="field">
                    <span>기준 시간</span>
                    <div className="unit-input">
                      <input
                        type="number"
                        min="0"
                        max="999"
                        step="0.5"
                        value={form.requiredHours}
                        onChange={(event) =>
                          setForm((previous) => ({
                            ...previous,
                            requiredHours: event.target.value,
                          }))
                        }
                        placeholder="0"
                      />
                      <em>시간</em>
                    </div>
                  </label>
                  <label className="field">
                    <span>이수 시간</span>
                    <div className="unit-input">
                      <input
                        type="number"
                        min="0"
                        max="999"
                        step="0.5"
                        value={form.completedHours}
                        onChange={(event) =>
                          setForm((previous) => ({
                            ...previous,
                            completedHours: event.target.value,
                          }))
                        }
                        placeholder="0"
                      />
                      <em>시간</em>
                    </div>
                  </label>
                  <label className="field">
                    <span>완료 기한</span>
                    <input
                      type="date"
                      value={form.dueDate}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          dueDate: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>이수일</span>
                    <input
                      type="date"
                      value={form.completedDate}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          completedDate: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>연수 기관</span>
                    <input
                      maxLength={80}
                      value={form.provider}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          provider: event.target.value,
                        }))
                      }
                      placeholder="예: 중앙교육연수원"
                    />
                  </label>
                  <label className="field">
                    <span>연수 방식</span>
                    <select
                      value={form.method}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          method: event.target.value,
                        }))
                      }
                    >
                      <option value="온라인">온라인</option>
                      <option value="집합">집합</option>
                      <option value="혼합">혼합</option>
                      <option value="기타">기타</option>
                    </select>
                  </label>
                </div>

                <label className="field full-field">
                  <span>확인할 내용</span>
                  <input
                    maxLength={180}
                    value={form.guidance}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        guidance: event.target.value,
                      }))
                    }
                    placeholder="예: 소속 교육청의 인정 시간 확인"
                  />
                </label>

                <label className="field full-field">
                  <span>
                    메모 <small>{form.memo.length}/600</small>
                  </span>
                  <textarea
                    rows={4}
                    maxLength={600}
                    value={form.memo}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        memo: event.target.value,
                      }))
                    }
                    placeholder="수료증 위치, 과정명처럼 나중에 확인할 내용을 적어 두세요. 학생 개인정보는 입력하지 마세요."
                  />
                </label>
              </div>

              <div className="modal-footer">
                {editingRecord ? (
                  <button
                    className="delete-button"
                    type="button"
                    onClick={deleteEditingRecord}
                  >
                    삭제
                  </button>
                ) : (
                  <span />
                )}
                <div>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setFormOpen(false)}
                  >
                    취소
                  </button>
                  <button className="primary-button" type="submit">
                    {editingRecord ? "수정 내용 저장" : "연수 추가"}
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {toast ? (
        <div className="toast no-print" role="status" aria-live="polite">
          <span aria-hidden="true">✓</span>
          <p>{toast}</p>
          {lastDeleted ? (
            <button type="button" onClick={undoDelete}>
              되돌리기
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
