"use client";

import {
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  useCallback,
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
  type ApplicabilityOverride,
  type TrainingCategory,
  type TrainingKind,
  type TrainingRecord,
  type TrainingStatus,
} from "@/lib/training-data";
import {
  applyProfileRecommendations,
  copyProfileToYear,
  createEmptyProfile,
  EMPLOYMENT_TYPES,
  getEducationOfficeLabel,
  getEffectiveApplicability,
  getSchoolSafetySummary,
  recommendationCounts,
  SCHOOL_TYPES,
  type TeacherProfile,
} from "@/lib/training-profile";
import { ProfileModal } from "@/components/ProfileModal";
import { useDialogFocus } from "@/components/useDialogFocus";
import {
  cloudCacheKey,
  countTrainingState,
  createInitialTrainingState,
  DEVICE_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  MAX_RECORDS_PER_YEAR,
  mergeTrainingStates,
  migrationMarkerKey,
  parseTrainingBackupState,
  parseTrainingState,
  selectStoredTrainingState,
  STATE_VERSION,
  trainingStateLimitError,
  type TrainingAppState,
} from "@/lib/training-state";

type KindFilter = "all" | TrainingKind;
type StatusFilter = "all" | TrainingStatus;
type CategoryFilter = "all" | TrainingCategory;

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
  applicabilityOverride: "" | ApplicabilityOverride;
}

interface DeletedRecord {
  year: number;
  index: number;
  record: TrainingRecord;
}

interface TrainingManagerProps {
  account: { displayName: string; accountScope: string } | null;
  signInPath: string;
  signOutPath: string;
  cloudSyncEnabled?: boolean;
  privacyPath?: string;
}

type SyncStatus =
  | "local"
  | "loading"
  | "saving"
  | "saved"
  | "offline"
  | "conflict";

interface CloudPayload {
  exists: boolean;
  revision: number;
  state: TrainingAppState | null;
  updatedAt: string | null;
  accountScope: string;
}

interface MigrationPrompt {
  accountScope: string;
  cloudState: TrainingAppState | null;
  cloudRevision: number;
  localState: TrainingAppState;
}

interface ConflictState {
  serverState: TrainingAppState | null;
  serverRevision: number;
  localState: TrainingAppState;
}

interface PendingImport {
  state: TrainingAppState;
  fileName: string;
  years: number;
  records: number;
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
    applicabilityOverride: "",
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
    applicabilityOverride: record.applicabilityOverride ?? "",
  };
}

function parseHours(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function formatHours(value: number) {
  return Number.isInteger(value) ? `${value}시간` : `${value.toFixed(1)}시간`;
}

function parseIsoDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? { year, month, day }
    : null;
}

function formatDate(date: string) {
  if (!date) return "날짜 미정";
  const parsed = parseIsoDate(date);
  return parsed ? `${parsed.month}월 ${parsed.day}일` : "날짜 확인";
}

function syncStatusText(status: SyncStatus) {
  return {
    local: "이 기기에 저장",
    loading: "계정 기록 확인 중",
    saving: "동기화 중",
    saved: "계정에 저장됨",
    offline: "기기에 임시 저장됨",
    conflict: "저장 충돌 확인 필요",
  }[status];
}

export function dueLabel(record: TrainingRecord, now = new Date()) {
  if (record.status === "completed") return "완료";
  if (record.status === "not-applicable") return "해당 없음";
  if (!record.dueDate) return "기한 미정";

  const due = parseIsoDate(record.dueDate);
  if (!due) return "기한 확인";
  const dueDay = Date.UTC(due.year, due.month - 1, due.day);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((dueDay - today) / 86_400_000);
  if (days < 0) return `${Math.abs(days)}일 지남`;
  if (days === 0) return "오늘까지";
  return `D-${days}`;
}

export function spreadsheetSafeValue(value: string | number) {
  if (typeof value !== "string") return value;
  return /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value;
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

export function TrainingManager({
  account,
  signInPath,
  signOutPath,
  cloudSyncEnabled = true,
  privacyPath = "/privacy",
}: TrainingManagerProps) {
  const currentYear = new Date().getFullYear();
  const [activeYear, setActiveYear] = useState(currentYear);
  const [recordsByYear, setRecordsByYear] = useState<
    Record<string, TrainingRecord[]>
  >({ [currentYear]: createDefaultTrainings(currentYear) });
  const [profilesByYear, setProfilesByYear] = useState<
    Record<string, TeacherProfile>
  >({});
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
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState<TeacherProfile>(() =>
    createEmptyProfile(currentYear),
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(
    account ? "loading" : "local",
  );
  const [lastSyncedAt, setLastSyncedAt] = useState("");
  const [accountScope, setAccountScope] = useState(
    account?.accountScope ?? "",
  );
  const [cloudReady, setCloudReady] = useState(false);
  const [hasCloudState, setHasCloudState] = useState(false);
  const [syncRetry, setSyncRetry] = useState(0);
  const [migrationPrompt, setMigrationPrompt] =
    useState<MigrationPrompt | null>(null);
  const [conflictState, setConflictState] = useState<ConflictState | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const importTriggerRef = useRef<HTMLElement | null>(null);
  const cloudRevisionRef = useRef(0);
  const lastSyncedStateRef = useRef("");
  const cloudStartedRef = useRef(false);
  const cloudAttemptRef = useRef(0);
  const initialDeviceStateRef = useRef<TrainingAppState | null>(null);
  const initialAccountCacheRef = useRef<TrainingAppState | null>(null);
  const deleteRequestedRef = useRef(false);
  const refreshInProgressRef = useRef(false);
  const cloudConflictPendingRef = useRef(false);
  const activeSaveOperationsRef = useRef(new Set<Promise<boolean>>());
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mainDialogReturnFocusRef = useRef<HTMLElement | null>(null);
  const profileReturnFocusRef = useRef<HTMLElement | null>(null);
  const syncLoading = Boolean(
    account && syncStatus === "loading" && !migrationPrompt && !pendingImport,
  );
  // 저장 충돌처럼 먼저 처리해야 하는 창을 우선해 한 번에 한 모달만 보여 줍니다.
  const activeDialogKey = conflictState
    ? "conflict"
    : migrationPrompt
      ? "migration"
      : pendingImport
        ? "backup-import"
        : formOpen
          ? "training-form"
          : syncLoading
            ? "sync-loading"
            : "";
  const dialogRef = useDialogFocus(
    Boolean(activeDialogKey),
    activeDialogKey,
    mainDialogReturnFocusRef,
  );

  const rememberDialogTrigger = (trigger?: HTMLElement | null) => {
    mainDialogReturnFocusRef.current =
      trigger ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
  };

  const appState = useMemo<TrainingAppState>(
    () => ({
      version: STATE_VERSION,
      activeYear,
      recordsByYear,
      profilesByYear,
    }),
    [activeYear, profilesByYear, recordsByYear],
  );
  const latestAppStateRef = useRef(appState);

  useEffect(() => {
    latestAppStateRef.current = appState;
  }, [appState]);

  const applyAppState = useCallback((state: TrainingAppState) => {
    setActiveYear(state.activeYear);
    setRecordsByYear(state.recordsByYear);
    setProfilesByYear(state.profilesByYear);
  }, []);

  const records = useMemo(
    () => recordsByYear[String(activeYear)] ?? [],
    [activeYear, recordsByYear],
  );

  const activeProfile = useMemo(
    () => profilesByYear[String(activeYear)] ?? createEmptyProfile(activeYear),
    [activeYear, profilesByYear],
  );

  const schoolSafety = useMemo(
    () => getSchoolSafetySummary(recordsByYear, activeYear, activeProfile),
    [activeProfile, activeYear, recordsByYear],
  );

  const profileCounts = useMemo(
    () => recommendationCounts(records, activeProfile, activeYear),
    [activeProfile, activeYear, records],
  );

  const profileSchoolLabel =
    SCHOOL_TYPES.find(([value]) => value === activeProfile.schoolType)?.[1] ??
    "학교 유형 미설정";
  const profileEmploymentLabel =
    EMPLOYMENT_TYPES.find(
      ([value]) => value === activeProfile.employmentType,
    )?.[1] ?? "고용 형태 미설정";

  const cacheStateOnDevice = useCallback(
    (key: string, state: TrainingAppState) => {
      try {
        window.localStorage.setItem(key, JSON.stringify(state));
        return true;
      } catch {
        setStorageWarning(
          "기록을 이 기기에 보관하지 못했습니다. 데이터 관리에서 전체 연도 백업을 내려받아 주세요.",
        );
        return false;
      }
    },
    [],
  );

  const markMigrationComplete = useCallback((scope: string) => {
    try {
      window.localStorage.setItem(
        migrationMarkerKey(scope),
        new Date().toISOString(),
      );
    } catch {
      setStorageWarning(
        "계정 연결 완료 표시를 이 기기에 저장하지 못했습니다. 기록은 계정에 정상 저장됩니다.",
      );
    }
  }, []);

  const saveToCloud = useCallback(
    (
      state: TrainingAppState,
      baseRevision: number,
      allowDuringRefresh = false,
    ) => {
      if (
        deleteRequestedRef.current ||
        (refreshInProgressRef.current && !allowDuringRefresh)
      ) {
        return Promise.resolve(false);
      }
      setSyncStatus(allowDuringRefresh ? "loading" : "saving");
      const operation = saveQueueRef.current.then(async () => {
        if (
          deleteRequestedRef.current ||
          cloudConflictPendingRef.current ||
          (refreshInProgressRef.current && !allowDuringRefresh)
        ) {
          return false;
        }
        try {
          // 앞선 저장이 끝난 뒤의 최신 서버 버전을 사용해 요청 겹침을 막습니다.
          const effectiveBaseRevision = cloudRevisionRef.current || baseRevision;
          const response = await fetch("/api/training-state", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ baseRevision: effectiveBaseRevision, state }),
          });
          const result = (await response.json()) as {
            revision?: number;
            updatedAt?: string;
            state?: TrainingAppState | null;
            accountScope?: string;
            error?: string;
          };
          if (response.status === 409) {
            const serverRevision = Number(result.revision ?? 0);
            cloudRevisionRef.current = serverRevision;
            setHasCloudState(serverRevision > 0);
            if (!deleteRequestedRef.current) {
              cloudConflictPendingRef.current = true;
              const serverState = result.state
                ? parseTrainingState(result.state)
                : null;
              setConflictState({
                serverState,
                serverRevision,
                // 요청 뒤에 화면에서 더 수정한 내용까지 충돌 선택창에서 보존합니다.
                localState: latestAppStateRef.current,
              });
              setSyncStatus("conflict");
            }
            return false;
          }
          if (!response.ok || !Number.isInteger(result.revision)) {
            throw new Error(result.error ?? "sync failed");
          }
          cloudRevisionRef.current = result.revision as number;
          setHasCloudState(true);
          lastSyncedStateRef.current = JSON.stringify(state);
          setLastSyncedAt(result.updatedAt ?? new Date().toISOString());
          if (
            !deleteRequestedRef.current &&
            !refreshInProgressRef.current
          ) {
            setSyncStatus("saved");
          }
          return true;
        } catch (error) {
          if (
            !deleteRequestedRef.current &&
            (!refreshInProgressRef.current || allowDuringRefresh)
          ) {
            setSyncStatus("offline");
          }
          if (
            error instanceof Error &&
            error.message &&
            error.message !== "sync failed"
          ) {
            setStorageWarning(
              `${error.message} 현재 기록은 이 기기에 보관했으며, 전체 연도 백업도 내려받을 수 있습니다.`,
            );
          }
          return false;
        }
      });
      saveQueueRef.current = operation.then(
        () => undefined,
        () => undefined,
      );
      activeSaveOperationsRef.current.add(operation);
      void operation.finally(() => {
        activeSaveOperationsRef.current.delete(operation);
      });
      return operation;
    },
    [],
  );

  const refreshFromCloud = useCallback(async () => {
    if (
      !account ||
      !cloudReady ||
      migrationPrompt ||
      conflictState ||
      formOpen ||
      profileOpen ||
      pendingImport
    ) {
      return;
    }
    if (refreshInProgressRef.current || cloudConflictPendingRef.current) return;
    refreshInProgressRef.current = true;
    setSyncStatus("loading");
    try {
      const pendingSaves = Array.from(activeSaveOperationsRef.current);
      if (pendingSaves.length > 0) {
        await Promise.allSettled(pendingSaves);
      }
      if (cloudConflictPendingRef.current) return;

      const response = await fetch("/api/training-state", {
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error("cloud unavailable");
      const payload = (await response.json()) as CloudPayload;
      const serverState = payload.state
        ? parseTrainingState(payload.state, currentYear)
        : null;
      const latestState = latestAppStateRef.current;
      const serializedLocal = JSON.stringify(latestState);
      const hasLocalChanges = serializedLocal !== lastSyncedStateRef.current;

      setAccountScope(payload.accountScope);
      setHasCloudState(payload.revision > 0);

      if (serverState && payload.revision < cloudRevisionRef.current) {
        cloudConflictPendingRef.current = true;
        setConflictState({
          serverState,
          serverRevision: payload.revision,
          localState: latestState,
        });
        setSyncStatus("conflict");
        return;
      }

      if (payload.revision === cloudRevisionRef.current && serverState) {
        if (hasLocalChanges) {
          const saved = await saveToCloud(
            latestState,
            cloudRevisionRef.current,
            true,
          );
          if (!saved) {
            if (!cloudConflictPendingRef.current) setSyncStatus("offline");
            return;
          }

          const newestState = latestAppStateRef.current;
          if (JSON.stringify(newestState) !== JSON.stringify(latestState)) {
            const savedNewest = await saveToCloud(
              newestState,
              cloudRevisionRef.current,
              true,
            );
            if (!savedNewest) {
              if (!cloudConflictPendingRef.current) setSyncStatus("offline");
              return;
            }
            if (
              JSON.stringify(latestAppStateRef.current) !==
              JSON.stringify(newestState)
            ) {
              setSyncRetry((value) => value + 1);
            }
          }
          setSyncStatus("saved");
        } else {
          setSyncStatus("saved");
        }
        return;
      }

      if (!serverState || hasLocalChanges) {
        cloudConflictPendingRef.current = true;
        setConflictState({
          serverState,
          serverRevision: payload.revision,
          localState: latestState,
        });
        setSyncStatus("conflict");
        return;
      }

      applyAppState(serverState);
      cloudRevisionRef.current = payload.revision;
      lastSyncedStateRef.current = JSON.stringify(serverState);
      setLastSyncedAt(payload.updatedAt ?? "");
      setSyncStatus("saved");
      setToast("다른 기기의 최신 기록을 불러왔습니다.");
    } catch {
      setSyncStatus("offline");
    } finally {
      refreshInProgressRef.current = false;
    }
  }, [
    account,
    applyAppState,
    cloudReady,
    conflictState,
    currentYear,
    formOpen,
    migrationPrompt,
    pendingImport,
    profileOpen,
    saveToCloud,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        // v3를 먼저 읽고, v3가 손상된 경우에만 기존 v2를 다시 시도합니다.
        const deviceSelection = selectStoredTrainingState(
          [
            window.localStorage.getItem(DEVICE_STORAGE_KEY),
            window.localStorage.getItem(LEGACY_STORAGE_KEY),
          ],
          currentYear,
        );
        const accountSelection = account
          ? selectStoredTrainingState(
              [window.localStorage.getItem(cloudCacheKey(account.accountScope))],
              currentYear,
            )
          : { state: null, hadInvalidValue: false };
        const deviceState = deviceSelection.state;
        const accountCache = accountSelection.state;
        initialDeviceStateRef.current = deviceState;
        initialAccountCacheRef.current = accountCache;

        const initialState = accountCache ?? deviceState;
        if (initialState) applyAppState(initialState);
        if (deviceSelection.hadInvalidValue || accountSelection.hadInvalidValue) {
          setStorageWarning(
            initialState
              ? "일부 저장 기록을 읽지 못해 읽을 수 있는 최신 기록을 사용합니다."
              : "브라우저 저장 기록을 읽지 못했습니다. 백업 파일이 있다면 데이터 관리에서 불러와 주세요.",
          );
        }
      } catch {
        setStorageWarning(
          "브라우저가 기기 저장소 접근을 허용하지 않았습니다. 백업 내려받기를 이용해 주세요.",
        );
      } finally {
        setReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [account, applyAppState, currentYear]);

  useEffect(() => {
    if (!ready) return;
    try {
      if (
        account &&
        !cloudReady &&
        syncStatus !== "offline" &&
        !(syncStatus === "local" && !migrationPrompt)
      ) {
        return;
      }
      const key = account
        ? cloudCacheKey(accountScope)
        : DEVICE_STORAGE_KEY;
      window.localStorage.setItem(key, JSON.stringify(appState));
    } catch {
      window.setTimeout(
        () =>
          setStorageWarning(
            "기록을 브라우저에 저장하지 못했습니다. 데이터 관리에서 백업 파일을 내려받아 주세요.",
          ),
        0,
      );
    }
  }, [account, accountScope, appState, cloudReady, migrationPrompt, ready, syncStatus]);

  useEffect(() => {
    if (!ready) return;
    const handleStorage = (event: StorageEvent) => {
      const expectedKey =
        account && accountScope
          ? cloudCacheKey(accountScope)
          : DEVICE_STORAGE_KEY;
      if (event.key !== expectedKey || !event.newValue) return;
      try {
        const parsed = parseTrainingState(JSON.parse(event.newValue), currentYear);
        if (!parsed) return;
        if (
          account &&
          JSON.stringify(latestAppStateRef.current) !==
            lastSyncedStateRef.current
        ) {
          setToast(
            "다른 창의 변경이 있지만 현재 화면의 미저장 기록을 우선 보존했습니다.",
          );
          return;
        }
        applyAppState(parsed);
        setToast("다른 창에서 바뀐 최신 기록을 불러왔습니다.");
      } catch {
        // 다른 창의 불완전한 값은 현재 화면에 적용하지 않습니다.
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [account, accountScope, applyAppState, cloudReady, currentYear, ready, syncStatus]);

  useEffect(() => {
    if (
      !account ||
      !ready ||
      cloudReady ||
      migrationPrompt ||
      conflictState ||
      cloudStartedRef.current
    ) {
      return;
    }
    cloudStartedRef.current = true;
    const attempt = cloudAttemptRef.current;
    cloudAttemptRef.current += 1;
    void (async () => {
      setSyncStatus("loading");
      try {
        const response = await fetch("/api/training-state", {
          headers: { accept: "application/json" },
        });
        if (!response.ok) throw new Error("cloud unavailable");
        const payload = (await response.json()) as CloudPayload;
        const cloudState = payload.state
          ? parseTrainingState(payload.state, currentYear)
          : null;
        setAccountScope(payload.accountScope);
        cloudRevisionRef.current = payload.revision;
        setHasCloudState(payload.revision > 0);

        let marker: string | null = null;
        try {
          marker = window.localStorage.getItem(
            migrationMarkerKey(payload.accountScope),
          );
        } catch {
          setStorageWarning(
            "계정 연결 여부를 이 기기에서 확인하지 못했습니다. 클라우드 기록은 정상적으로 확인합니다.",
          );
        }
        const deviceState = initialDeviceStateRef.current;
        const accountCache = initialAccountCacheRef.current;
        const retryState = attempt > 0 ? latestAppStateRef.current : null;
        const initialBrowserState = marker
          ? accountCache
          : accountCache && deviceState
            ? mergeTrainingStates(accountCache, deviceState)
            : accountCache ?? deviceState;
        const migrationState = retryState ?? initialBrowserState;

        if (
          cloudState &&
          migrationState &&
          JSON.stringify(migrationState) !== JSON.stringify(cloudState)
        ) {
          setMigrationPrompt({
            accountScope: payload.accountScope,
            cloudState,
            cloudRevision: payload.revision,
            localState: migrationState,
          });
          setSyncStatus("local");
          return;
        }

        if (cloudState) {
          applyAppState(cloudState);
          lastSyncedStateRef.current = JSON.stringify(cloudState);
          setLastSyncedAt(payload.updatedAt ?? "");
          setCloudReady(true);
          setSyncStatus("saved");
          if (!marker && migrationState) {
            markMigrationComplete(payload.accountScope);
          }
          return;
        }

        if (marker) {
          cloudConflictPendingRef.current = true;
          setConflictState({
            serverState: null,
            serverRevision: 0,
            localState:
              retryState ??
              accountCache ??
              deviceState ??
              latestAppStateRef.current,
          });
          setSyncStatus("conflict");
          return;
        }

        const recoverableLocalState = migrationState;
        if (recoverableLocalState) {
          setMigrationPrompt({
            accountScope: payload.accountScope,
            cloudState: null,
            cloudRevision: 0,
            localState: recoverableLocalState,
          });
          setSyncStatus("local");
          return;
        }

        const initial = createInitialTrainingState(currentYear);
        applyAppState(initial);
        const saved = await saveToCloud(initial, 0);
        if (saved) setCloudReady(true);
      } catch {
        setSyncStatus("offline");
      }
    })();
  }, [
    account,
    applyAppState,
    cloudReady,
    conflictState,
    currentYear,
    migrationPrompt,
    markMigrationComplete,
    ready,
    saveToCloud,
    syncRetry,
  ]);

  useEffect(() => {
    if (!account || !ready || !cloudReady || migrationPrompt || conflictState) {
      return;
    }
    const serialized = JSON.stringify(appState);
    if (serialized === lastSyncedStateRef.current) return;
    const timer = window.setTimeout(() => {
      void saveToCloud(appState, cloudRevisionRef.current);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [
    account,
    appState,
    cloudReady,
    conflictState,
    migrationPrompt,
    ready,
    saveToCloud,
    syncRetry,
  ]);

  useEffect(() => {
    const retry = () => {
      if (!cloudReady) cloudStartedRef.current = false;
      setSyncRetry((value) => value + 1);
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [cloudReady]);

  useEffect(() => {
    if (!account || !cloudReady) return;
    const refresh = () => void refreshFromCloud();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [account, cloudReady, refreshFromCloud]);

  useEffect(() => {
    if (
      !formOpen &&
      !profileOpen &&
      !migrationPrompt &&
      !conflictState &&
      !pendingImport &&
      !syncLoading
    ) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !migrationPrompt && !conflictState) {
        setFormOpen(false);
        setProfileOpen(false);
        setPendingImport(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    conflictState,
    formOpen,
    migrationPrompt,
    pendingImport,
    profileOpen,
    syncLoading,
  ]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      setToast("");
      setLastDeleted(null);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const importLocalRecordsToCloud = async () => {
    if (!migrationPrompt) return;
    if (migrationPrompt.cloudState) {
      const date = todayForInput().replaceAll("-", "");
      downloadTextFile(
        `${date}_계정연결전_클라우드백업.json`,
        JSON.stringify(migrationPrompt.cloudState, null, 2),
        "application/json;charset=utf-8",
      );
    }
    const nextState = migrationPrompt.cloudState
      ? mergeTrainingStates(
          migrationPrompt.localState,
          migrationPrompt.cloudState,
        )
      : migrationPrompt.localState;
    const limitError = trainingStateLimitError(nextState);
    if (limitError) {
      setToast(
        `${limitError} 기기 기록과 계정 기록을 합치지 않았습니다. 먼저 각 기록을 백업한 뒤 불필요한 항목을 정리해 주세요.`,
      );
      return;
    }
    applyAppState(nextState);
    setMigrationPrompt(null);
    cacheStateOnDevice(
      cloudCacheKey(migrationPrompt.accountScope),
      nextState,
    );
    const saved = await saveToCloud(nextState, migrationPrompt.cloudRevision);
    if (saved) {
      setCloudReady(true);
      markMigrationComplete(migrationPrompt.accountScope);
      setToast(
        migrationPrompt.cloudState
          ? "기존 계정 기록을 백업한 뒤 기기와 계정 기록을 합쳤습니다."
          : "이 브라우저의 기록을 계정에 가져왔습니다.",
      );
    } else {
      setCloudReady(false);
    }
  };

  const keepCloudRecords = async () => {
    if (!migrationPrompt) return;
    const nextState =
      migrationPrompt.cloudState ?? createInitialTrainingState(currentYear);
    applyAppState(nextState);
    setMigrationPrompt(null);
    cacheStateOnDevice(
      cloudCacheKey(migrationPrompt.accountScope),
      nextState,
    );

    let saved = true;
    if (migrationPrompt.cloudState) {
      lastSyncedStateRef.current = JSON.stringify(nextState);
      setSyncStatus("saved");
      setCloudReady(true);
    } else {
      saved = await saveToCloud(nextState, 0);
      setCloudReady(saved);
    }
    if (saved) {
      markMigrationComplete(migrationPrompt.accountScope);
      setToast(
        migrationPrompt.cloudState
          ? "계정에 저장된 기록을 불러왔습니다. 기기 기록은 그대로 보관됩니다."
          : "새 계정 기록을 만들었습니다. 기존 기기 기록은 그대로 보관됩니다.",
      );
    }
  };

  const useServerConflictVersion = () => {
    if (!conflictState) return;
    cloudConflictPendingRef.current = false;
    const serverExists = Boolean(conflictState.serverState);
    const nextState =
      conflictState.serverState ?? createInitialTrainingState(currentYear);
    applyAppState(nextState);
    cloudRevisionRef.current = conflictState.serverRevision;
    setHasCloudState(serverExists && conflictState.serverRevision > 0);
    lastSyncedStateRef.current = serverExists
      ? JSON.stringify(nextState)
      : "";
    setConflictState(null);
    if (serverExists) {
      setCloudReady(true);
      setSyncStatus("saved");
      cacheStateOnDevice(cloudCacheKey(accountScope), nextState);
      markMigrationComplete(accountScope);
      setToast("클라우드에 저장된 최신 기록을 사용합니다.");
      return;
    }

    // 다른 기기에서 삭제한 클라우드 상태를 선택했으므로 자동 재생성하지 않습니다.
    setCloudReady(false);
    setSyncStatus("local");
    initialAccountCacheRef.current = nextState;
    cacheStateOnDevice(cloudCacheKey(accountScope), nextState);
    try {
      window.localStorage.removeItem(migrationMarkerKey(accountScope));
    } catch {
      setStorageWarning(
        "계정 연결 표시를 이 기기에서 정리하지 못했습니다. 현재 화면은 클라우드 삭제 상태를 사용합니다.",
      );
    }
    setToast("클라우드의 삭제 상태를 사용합니다. 새 기록은 이 기기에 저장됩니다.");
  };

  const resolveWithLocalVersion = async () => {
    if (!conflictState) return;
    // 충돌 안내가 열린 뒤에도 반영된 화면 수정이 있다면 버튼을 누르는 시점의 최신본을 사용합니다.
    const localState = latestAppStateRef.current;
    const revision = conflictState.serverRevision;
    cloudConflictPendingRef.current = false;
    setConflictState(null);
    const saved = await saveToCloud(localState, revision);
    if (saved) {
      applyAppState(localState);
      setCloudReady(true);
      setHasCloudState(true);
      cacheStateOnDevice(cloudCacheKey(accountScope), localState);
      markMigrationComplete(accountScope);
      setToast("이 기기의 기록으로 클라우드를 다시 저장했습니다.");
    }
  };

  const openProfileSettings = (trigger?: HTMLElement) => {
    profileReturnFocusRef.current =
      trigger ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    setProfileForm({ ...activeProfile, duties: [...activeProfile.duties] });
    setProfileOpen(true);
  };

  const copyPreviousProfile = () => {
    const previous = profilesByYear[String(activeYear - 1)];
    if (!previous?.configured) {
      setToast(`${activeYear - 1}년에 저장된 근무 조건이 없습니다.`);
      return;
    }
    setProfileForm(copyProfileToYear(previous, activeYear));
    setToast("전년도 근무 조건을 불러왔습니다. 내용을 확인해 주세요.");
  };

  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !profileForm.educationOffice ||
      !profileForm.schoolType ||
      !profileForm.employmentType
    ) {
      setToast("교육청, 학교 유형, 고용 형태를 모두 선택해 주세요.");
      return;
    }
    const savedProfile: TeacherProfile = {
      ...profileForm,
      year: activeYear,
      configured: true,
      updatedAt: new Date().toISOString(),
    };
    const evaluated = applyProfileRecommendations(
      records,
      savedProfile,
      activeYear,
      MAX_RECORDS_PER_YEAR,
    );
    setProfilesByYear((previous) => ({
      ...previous,
      [activeYear]: savedProfile,
    }));
    updateActiveRecords(() => evaluated);
    setProfileOpen(false);
    const counts = recommendationCounts(
      evaluated,
      savedProfile,
      activeYear,
      MAX_RECORDS_PER_YEAR,
    );
    const skippedDutyTrainings = Math.max(
      0,
      applyProfileRecommendations(records, savedProfile, activeYear).length -
        evaluated.length,
    );
    setToast(
      `맞춤 분류 완료: 기본 적용 ${counts.applies}개, 확인 필요 ${counts.review}개, 기본 제외 ${counts["not-applicable"]}개${
        skippedDutyTrainings > 0
          ? ` · 기록 한도로 담당업무 연수 ${skippedDutyTrainings}개는 추가하지 않음`
          : ""
      }`,
    );
  };

  const deleteCloudRecords = async () => {
    if (!account || cloudRevisionRef.current < 1) return;
    const confirmation = window.prompt(
      "클라우드 기록을 삭제하려면 ‘클라우드 기록 삭제’를 입력해 주세요. 이 계정의 기기 캐시는 남습니다.",
    );
    if (confirmation !== "클라우드 기록 삭제") return;
    deleteRequestedRef.current = true;
    setSyncStatus("loading");
    let deleteConflictDetected = false;
    try {
      const pendingSaves = Array.from(activeSaveOperationsRef.current);
      if (pendingSaves.length > 0) {
        await Promise.allSettled(pendingSaves);
      }
      const baseRevision = cloudRevisionRef.current;
      if (baseRevision < 1) throw new Error("cloud already deleted");
      const response = await fetch("/api/training-state", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseRevision }),
      });
      if (!response.ok) {
        if (response.status === 409) {
          const result = (await response.json()) as {
            revision?: number;
            state?: TrainingAppState | null;
          };
          const serverRevision = Number(result.revision ?? 0);
          cloudRevisionRef.current = serverRevision;
          setHasCloudState(serverRevision > 0);
          cloudConflictPendingRef.current = true;
          setConflictState({
            serverState: result.state
              ? parseTrainingState(result.state, currentYear)
              : null,
            serverRevision,
            localState: latestAppStateRef.current,
          });
          setSyncStatus("conflict");
          deleteConflictDetected = true;
        }
        throw new Error("delete failed");
      }

      // 서버 삭제 성공 상태를 먼저 반영하고, 기기 저장소 오류는 별도로 안내합니다.
      const deviceState = latestAppStateRef.current;
      initialAccountCacheRef.current = deviceState;
      cloudRevisionRef.current = 0;
      setHasCloudState(false);
      lastSyncedStateRef.current = "";
      setConflictState(null);
      cloudConflictPendingRef.current = false;
      setCloudReady(false);
      setSyncStatus("local");
      cloudStartedRef.current = true;

      const deviceSaved = cacheStateOnDevice(
        cloudCacheKey(accountScope),
        deviceState,
      );
      if (accountScope) {
        try {
          window.localStorage.removeItem(migrationMarkerKey(accountScope));
        } catch {
          setStorageWarning(
            "클라우드 기록은 삭제했지만 이 기기의 계정 연결 표시를 정리하지 못했습니다.",
          );
        }
      }
      setToast(
        deviceSaved
          ? "클라우드 기록을 삭제했습니다. 현재 기록은 이 계정의 기기 캐시에 남아 있습니다."
          : "클라우드 기록은 삭제했습니다. 현재 기록은 백업 파일로 내려받아 주세요.",
      );
    } catch {
      if (deleteConflictDetected) {
        setToast(
          "다른 기기의 변경을 먼저 확인한 뒤 클라우드 삭제를 다시 시도해 주세요.",
        );
      } else {
        const hasUnsyncedChanges =
          JSON.stringify(latestAppStateRef.current) !==
          lastSyncedStateRef.current;
        setSyncStatus("offline");
        if (hasUnsyncedChanges) {
          setSyncRetry((value) => value + 1);
        }
        setToast(
          "클라우드 기록을 삭제하지 못했습니다. 현재 기록은 이 기기에 보관했습니다.",
        );
      }
    } finally {
      deleteRequestedRef.current = false;
    }
  };

  const requestCloudRetry = () => {
    if (!account) return;
    if (cloudReady) {
      void refreshFromCloud();
      return;
    }
    cloudStartedRef.current = false;
    setSyncRetry((value) => value + 1);
  };

  const metrics = useMemo(() => {
    const applicableRequired = records.filter(
      (record) =>
        record.kind === "required" &&
        record.status !== "not-applicable" &&
        getEffectiveApplicability(record) === "applies",
    );
    const completedRequired = applicableRequired.filter((record) =>
      record.templateKey === "school-safety" && schoolSafety.mode === "rolling"
        ? schoolSafety.requirementMet
        : requirementMet(record),
    );
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
      reviewCount: records.filter(
        (record) =>
          record.kind === "required" &&
          getEffectiveApplicability(record) === "review",
      ).length,
      rate,
    };
  }, [records, schoolSafety]);

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
      const defaults = createDefaultTrainings(year);
      const profile = profilesByYear[String(year)];
      return {
        ...previous,
        [year]: profile?.configured
          ? applyProfileRecommendations(defaults, profile, year)
          : defaults,
      };
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

  const openAddForm = (trigger?: HTMLElement) => {
    rememberDialogTrigger(trigger);
    setEditingRecord(null);
    setForm(createBlankForm(activeYear));
    setFormOpen(true);
  };

  const openEditForm = (record: TrainingRecord, trigger?: HTMLElement) => {
    rememberDialogTrigger(trigger);
    setEditingRecord(record);
    setForm(recordToForm(record));
    setFormOpen(true);
  };

  const saveForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    if (!editingRecord && records.length >= MAX_RECORDS_PER_YEAR) {
      setToast(
        `한 연도에는 최대 ${MAX_RECORDS_PER_YEAR.toLocaleString("ko-KR")}개의 연수를 기록할 수 있습니다.`,
      );
      return;
    }

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
        `training-${timestamp}`,
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
      profileApplicability: editingRecord?.profileApplicability,
      profileReason: editingRecord?.profileReason,
      applicabilityOverride: form.applicabilityOverride || undefined,
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

  const toggleCompleted = (record: TrainingRecord, trigger?: HTMLElement) => {
    if (record.templateKey === "school-safety") {
      openEditForm(record, trigger);
      setToast("해당 연도에 실제로 이수한 시간을 입력하면 최근 3년 합계가 자동 계산됩니다.");
      return;
    }
    if (getEffectiveApplicability(record) === "not-applicable") {
      openEditForm(record, trigger);
      setToast("현재 프로필에서 기본 제외된 항목입니다. 적용 대상을 먼저 변경해 주세요.");
      return;
    }
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
    const targetRecords = recordsByYear[String(lastDeleted.year)] ?? [];
    if (targetRecords.length >= MAX_RECORDS_PER_YEAR) {
      setToast(
        `한 연도에는 최대 ${MAX_RECORDS_PER_YEAR.toLocaleString("ko-KR")}개까지만 기록할 수 있어 삭제를 되돌리지 못했습니다.`,
      );
      return;
    }
    setRecordsByYear((previous) => {
      const yearRecords = [...(previous[String(lastDeleted.year)] ?? [])];
      yearRecords.splice(lastDeleted.index, 0, lastDeleted.record);
      return { ...previous, [lastDeleted.year]: yearRecords };
    });
    setLastDeleted(null);
    setToast("삭제한 기록을 되돌렸습니다.");
  };

  const restoreMissingDefaults = () => {
    const defaults = activeProfile.configured
      ? applyProfileRecommendations(
          createDefaultTrainings(activeYear),
          activeProfile,
          activeYear,
        )
      : createDefaultTrainings(activeYear);
    const existingKeys = new Set(records.map((record) => record.templateKey));
    const missing = defaults.filter(
      (record) => record.templateKey && !existingKeys.has(record.templateKey),
    );
    if (missing.length === 0) {
      setToast("기본 연수 목록이 모두 들어 있습니다.");
      return;
    }
    const availableSlots = Math.max(0, MAX_RECORDS_PER_YEAR - records.length);
    if (availableSlots === 0) {
      setToast("이 연도의 기록 수가 한도에 도달해 기본 목록을 복원하지 못했습니다.");
      return;
    }
    const additions = missing.slice(0, availableSlots);
    updateActiveRecords((current) => [...current, ...additions]);
    setToast(
      additions.length === missing.length
        ? `빠진 기본 연수 ${missing.length}개를 다시 넣었습니다.`
        : `기록 한도 때문에 기본 연수 ${additions.length}개만 복원했습니다.`,
    );
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
    const availableSlots = Math.max(0, MAX_RECORDS_PER_YEAR - records.length);
    const acceptedAdditions = additions.slice(0, availableSlots);
    if (acceptedAdditions.length === 0) {
      setToast("이 연도의 기록 수가 한도에 도달해 연수를 가져오지 못했습니다.");
      return;
    }
    updateActiveRecords((current) => [...acceptedAdditions, ...current]);
    setToast(
      acceptedAdditions.length === additions.length
        ? `전년도 개인 연수 ${acceptedAdditions.length}개를 가져왔습니다.`
        : `기록 한도 때문에 전년도 개인 연수 ${acceptedAdditions.length}개만 가져왔습니다.`,
    );
  };

  const exportBackup = () => {
    const date = todayForInput().replaceAll("-", "");
    downloadTextFile(
      `${date}_연수관리_전체백업.json`,
      JSON.stringify(appState, null, 2),
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
      "맞춤 판단",
      "주기",
      "기준 시간",
      "이수 시간",
      "이수일",
      "기관",
      "방식",
      "메모",
    ];
    const escape = (value: string | number) => {
      const safeValue = spreadsheetSafeValue(value);
      return `"${String(safeValue).replaceAll('"', '""')}"`;
    };
    const rows = records.map((record) => {
      const applicability = getEffectiveApplicability(record);
      const displayedStatus =
        record.status === "planned" && applicability === "review"
          ? "확인 필요"
          : record.status === "planned" && applicability === "not-applicable"
            ? "기본 제외"
            : STATUS_LABELS[record.status];
      const applicabilityLabel =
        applicability === "applies"
          ? "맞춤 적용"
          : applicability === "review"
            ? "학교 확인"
            : "프로필 제외";
      return [
        activeYear,
        KIND_LABELS[record.kind],
        record.title,
        record.category,
        displayedStatus,
        record.kind === "required" ? applicabilityLabel : "사용자 추가",
        record.cycle,
        record.requiredHours || "",
        record.completedHours || "",
        record.completedDate,
        record.provider,
        record.method,
        record.memo,
      ]
        .map(escape)
        .join(",");
    });
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
    const returnFocusTarget = importTriggerRef.current;
    importTriggerRef.current = null;
    if (!file) return;
    try {
      const rawState = JSON.parse(await file.text()) as unknown;
      const limitError = trainingStateLimitError(rawState);
      if (limitError) {
        setToast(`${limitError} 기존 기록은 그대로 유지했습니다.`);
        return;
      }
      const parsed = parseTrainingBackupState(rawState, currentYear);
      if (!parsed) throw new Error("invalid backup");
      const counts = countTrainingState(parsed);
      mainDialogReturnFocusRef.current = returnFocusTarget;
      setPendingImport({
        state: parsed,
        fileName: file.name,
        years: counts.years,
        records: counts.records,
      });
    } catch {
      setToast("백업 파일 형식이 맞지 않아 기존 기록을 그대로 유지했습니다.");
    }
  };

  const confirmImportBackup = () => {
    if (!pendingImport) return;
    exportBackup();
    applyAppState(pendingImport.state);
    const { years, records: importedRecords } = pendingImport;
    setPendingImport(null);
    setToast(
      `현재 기록을 백업한 뒤 ${years}개 연도, ${importedRecords}개 기록을 불러왔습니다.`,
    );
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
    <div
      className="training-app"
      aria-busy={account && syncStatus === "loading" ? true : undefined}
    >
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
            <button
              className="profile-button"
              type="button"
              onClick={(event) => openProfileSettings(event.currentTarget)}
            >
              <span aria-hidden="true">◎</span>
              <span>
                <small>{activeYear}년 근무 조건</small>
                <strong>
                  {activeProfile.configured
                    ? getEducationOfficeLabel(activeProfile.educationOffice)
                    : "맞춤 목록 설정"}
                </strong>
              </span>
            </button>
            {account ? (
              <div className={`account-control sync-${syncStatus}`}>
                <button
                  type="button"
                  onClick={requestCloudRetry}
                  title={lastSyncedAt ? `마지막 저장 ${formatDate(lastSyncedAt.slice(0, 10))}` : undefined}
                >
                  <span aria-hidden="true">●</span>
                  {syncStatusText(syncStatus)}
                </button>
                <div>
                  <strong>{account.displayName}</strong>
                  <a href={signOutPath}>로그아웃</a>
                </div>
              </div>
            ) : cloudSyncEnabled ? (
              <a className="sign-in-button" href={signInPath}>
                로그인·기기 동기화
              </a>
            ) : (
              <span className="sign-in-button" aria-label="현재 브라우저에 저장">
                이 기기에 저장
              </span>
            )}
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
            <button
              className="primary-button"
              type="button"
              onClick={(event) => openAddForm(event.currentTarget)}
            >
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
              {account
                ? cloudReady
                  ? "계정에 동기화되고 이 기기에도 임시 보관됩니다"
                  : "현재 기록은 이 기기에 안전하게 보관됩니다"
                : "로그인 전에는 이 브라우저에만 저장됩니다"}
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

        <section className="personalization-grid no-print" aria-label="맞춤 관리 요약">
          <article className="profile-summary-card">
            <div className="profile-summary-heading">
              <span className="summary-icon" aria-hidden="true">◎</span>
              <div>
                <small>{activeYear}년 맞춤 목록</small>
                <h2>
                  {activeProfile.configured
                    ? getEducationOfficeLabel(activeProfile.educationOffice)
                    : "내 근무 조건을 설정해 주세요"}
                </h2>
              </div>
            </div>
            {activeProfile.configured ? (
              <>
                <p>{profileSchoolLabel} · {profileEmploymentLabel}</p>
                <div className="recommendation-counts">
                  <span><b>{profileCounts.applies}</b> 기본 적용</span>
                  <span><b>{profileCounts.review}</b> 확인 필요</span>
                  <span><b>{profileCounts["not-applicable"]}</b> 기본 제외</span>
                </div>
              </>
            ) : (
              <p>교육청·학교 유형·고용 형태·담당업무에 맞춰 연수 목록을 분류합니다.</p>
            )}
            <button
              type="button"
              onClick={(event) => openProfileSettings(event.currentTarget)}
            >
              {activeProfile.configured ? "근무 조건 수정" : "지금 설정하기"}
            </button>
          </article>

          <article className="school-safety-card">
            <div className="safety-card-heading">
              <div>
                <small>최근 3개 연도 자동 합산</small>
                <h2>학교안전교육</h2>
              </div>
              <strong className={schoolSafety.requirementMet ? "met" : ""}>
                {formatHours(schoolSafety.totalHours)} / 15시간
              </strong>
            </div>
            <div className="safety-progress" aria-hidden="true">
              <span
                style={{
                  width: `${Math.min(100, (schoolSafety.totalHours / 15) * 100)}%`,
                }}
              />
            </div>
            <div className="safety-years">
              {schoolSafety.byYear.map((item) => (
                <button key={item.year} type="button" onClick={() => setYear(item.year)}>
                  <span>{item.year}년</span>
                  <strong>{formatHours(item.completedHours)}</strong>
                </button>
              ))}
            </div>
            <p>
              {schoolSafety.mode === "contract-check"
                ? "기간제 교원은 계약기간에 따라 학기별 기준이 적용될 수 있으므로 학교 계획을 확인하세요."
                : schoolSafety.requirementMet
                  ? `${schoolSafety.startYear}~${schoolSafety.endYear}년 기준 15시간을 충족했습니다.`
                  : `${formatHours(schoolSafety.remainingHours)}을 더 이수하면 최근 3년 기준을 충족합니다.`}
            </p>
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
                  onClick={(event) => {
                    // 파일이 정상 백업으로 확인된 뒤에만 모달의 복귀 위치로 확정합니다.
                    importTriggerRef.current = event.currentTarget;
                    importInputRef.current?.click();
                  }}
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
                {account && hasCloudState ? (
                  <>
                    <hr />
                    <button className="danger-menu-item" type="button" onClick={deleteCloudRecords}>
                      클라우드 기록 삭제
                    </button>
                  </>
                ) : null}
              </div>
            </details>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              onChange={importBackup}
              hidden
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

          <div
            className="result-caption"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
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
                const applicability = getEffectiveApplicability(record);
                const met =
                  record.templateKey === "school-safety" &&
                  schoolSafety.mode === "rolling"
                    ? schoolSafety.requirementMet
                    : requirementMet(record);
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
                    className={`training-row status-${record.status} applicability-${applicability}`}
                    key={record.id}
                  >
                    <div className="row-status">
                      <button
                        className={`complete-check ${met ? "checked" : ""}`}
                        type="button"
                        onClick={(event) =>
                          toggleCompleted(record, event.currentTarget)
                        }
                        aria-label={
                          record.status === "completed"
                            ? `${record.title} 완료 취소`
                            : `${record.title} 이수 완료 처리`
                        }
                      >
                        <span aria-hidden="true">✓</span>
                      </button>
                      <span className={`status-label ${record.status}`}>
                        {record.status === "planned" && applicability === "review"
                          ? "확인 필요"
                          : record.status === "planned" && applicability === "not-applicable"
                            ? "기본 제외"
                            : STATUS_LABELS[record.status]}
                      </span>
                    </div>

                    <div className="row-main">
                      <div className="row-tags">
                        <span className={`kind-tag ${record.kind}`}>
                          {KIND_LABELS[record.kind]}
                        </span>
                        <span className="category-tag">{record.category}</span>
                        {record.kind === "required" ? (
                          <span className={`applicability-tag ${applicability}`}>
                            {applicability === "applies"
                              ? "맞춤 적용"
                              : applicability === "review"
                                ? "학교 확인"
                                : "프로필 제외"}
                          </span>
                        ) : null}
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
                      {record.profileReason && record.kind === "required" ? (
                        <p className={`profile-reason ${applicability}`}>
                          {record.profileReason}
                        </p>
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
                      <span className="visually-hidden">기준 및 이수 시간: </span>
                      <strong>{record.cycle}</strong>
                      <span>
                        {record.templateKey === "school-safety" &&
                        schoolSafety.mode === "rolling"
                          ? `${formatHours(schoolSafety.totalHours)} / 15시간 (최근 3년)`
                          : record.requiredHours > 0
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
                      <span className="visually-hidden">기한: </span>
                      <span className="mobile-label" aria-hidden="true">기한</span>
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
                      <button
                        type="button"
                        onClick={(event) =>
                          openEditForm(record, event.currentTarget)
                        }
                      >
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
                <button
                  type="button"
                  onClick={(event) => openAddForm(event.currentTarget)}
                >
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
          {cloudSyncEnabled ? (
            <>
              비로그인 기록은 이 기기에만 저장됩니다. 로그인 기록은 계정에
              동기화되고 이 계정용 기기 캐시에도 임시 보관됩니다. 이메일 원문은
              기록 DB에 저장하지 않습니다.
            </>
          ) : (
            <>
              이 GitHub Pages 주소의 기록은 현재 브라우저에만 저장됩니다. 중요한
              기록은 전체 연도 백업 파일로 보관해 주세요.
            </>
          )}{" "}
          공용 PC에서는 학생 이름 등 개인정보를 입력하지 마세요.{" "}
          <a href={privacyPath}>개인정보 안내</a>
        </p>
      </footer>

      <ProfileModal
        open={profileOpen && !activeDialogKey}
        year={activeYear}
        value={profileForm}
        hasPreviousProfile={Boolean(profilesByYear[String(activeYear - 1)]?.configured)}
        onChange={setProfileForm}
        onClose={() => setProfileOpen(false)}
        onCopyPrevious={copyPreviousProfile}
        onSave={saveProfile}
        returnFocusRef={profileReturnFocusRef}
      />

      {activeDialogKey === "sync-loading" ? (
        <div className="modal-backdrop no-print sync-loading-backdrop" role="status" aria-live="polite">
          <section ref={dialogRef} className="training-modal sync-loading-card" tabIndex={-1}>
            <div className="sync-loading-mark" aria-hidden="true">담</div>
            <strong>계정에 저장된 연수 기록을 확인하고 있어요.</strong>
            <span>확인이 끝나면 안전하게 수정할 수 있습니다.</span>
          </section>
        </div>
      ) : null}

      {activeDialogKey === "migration" && migrationPrompt ? (
        <div className="modal-backdrop no-print" role="presentation">
          <section
            ref={dialogRef}
            className="training-modal sync-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="migration-title"
            tabIndex={-1}
          >
            <div className="modal-header">
              <div>
                <span>SAFE FIRST SYNC</span>
                <h2 id="migration-title">기존 기록을 계정에 연결할까요?</h2>
              </div>
            </div>
            <div className="modal-body">
              <div className="sync-illustration" aria-hidden="true">↗</div>
              <p>
                이 브라우저에는 <strong>{countTrainingState(migrationPrompt.localState).years}개 연도, {countTrainingState(migrationPrompt.localState).records}개 기록</strong>이 있습니다.
                {migrationPrompt.cloudState ? (
                  <> 계정에는 <strong>{countTrainingState(migrationPrompt.cloudState).years}개 연도, {countTrainingState(migrationPrompt.cloudState).records}개 기록</strong>이 있습니다.</>
                ) : (
                  <> 계정 저장소는 아직 비어 있습니다.</>
                )}
              </p>
              <div className="sync-choice-grid">
                <button type="button" onClick={() => void importLocalRecordsToCloud()}>
                  <strong>기기 기록 가져오기</strong>
                  <span>{migrationPrompt.cloudState ? "계정 기록을 먼저 백업한 뒤, 같은 연수는 최신 수정본을 사용합니다." : "현재 기록을 계정에 처음 저장합니다."}</span>
                </button>
                <button type="button" onClick={() => void keepCloudRecords()}>
                  <strong>{migrationPrompt.cloudState ? "계정 기록 사용" : "새 계정 기록으로 시작"}</strong>
                  <span>기존 기기 기록은 삭제하지 않고 그대로 보관합니다.</span>
                </button>
              </div>
              <p className="privacy-small">다른 계정으로 자동 전송하지 않도록 계정마다 한 번씩 직접 선택받습니다.</p>
            </div>
          </section>
        </div>
      ) : null}

      {activeDialogKey === "conflict" && conflictState ? (
        <div className="modal-backdrop no-print" role="presentation">
          <section
            ref={dialogRef}
            className="training-modal sync-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="conflict-title"
            tabIndex={-1}
          >
            <div className="modal-header">
              <div>
                <span>SYNC CONFLICT</span>
                <h2 id="conflict-title">다른 기기에서 기록이 변경됐어요.</h2>
              </div>
            </div>
            <div className="modal-body">
              <p>어느 기록을 사용할지 직접 선택해 주세요. 자동으로 덮어쓰지 않습니다.</p>
              <div className="sync-choice-grid">
                <button type="button" onClick={useServerConflictVersion}>
                  <strong>
                    {conflictState.serverState
                      ? "클라우드 최신 기록 사용"
                      : "클라우드 삭제 상태 사용"}
                  </strong>
                  <span>
                    {conflictState.serverState
                      ? "다른 기기에서 먼저 저장한 내용을 불러옵니다."
                      : "계정에는 다시 올리지 않고 이 기기에서 새로 시작합니다."}
                  </span>
                </button>
                <button type="button" onClick={() => void resolveWithLocalVersion()}>
                  <strong>이 기기 기록으로 저장</strong>
                  <span>
                    {conflictState.serverState
                      ? "현재 화면의 전체 기록으로 클라우드를 바꿉니다."
                      : "현재 기기 기록을 계정에 다시 저장합니다."}
                  </span>
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {activeDialogKey === "backup-import" && pendingImport ? (
        <div
          className="modal-backdrop no-print"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPendingImport(null);
          }}
        >
          <section
            ref={dialogRef}
            className="training-modal sync-modal import-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-confirm-title"
            tabIndex={-1}
          >
            <div className="modal-header">
              <div>
                <span>RESTORE BACKUP</span>
                <h2 id="import-confirm-title">이 백업으로 기록을 바꿀까요?</h2>
              </div>
              <button
                type="button"
                onClick={() => setPendingImport(null)}
                aria-label="백업 불러오기 확인 창 닫기"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="sync-illustration" aria-hidden="true">⇄</div>
              <p>
                <strong>{pendingImport.fileName}</strong>에는 {pendingImport.years}개
                연도, {pendingImport.records}개 기록이 있습니다. 적용하면 현재
                화면의 전체 기록과 근무 조건을 바꿉니다.
              </p>
              {account ? (
                <p className="import-account-warning">
                  로그인 중이므로 적용한 기록은 계정에도 동기화됩니다.
                </p>
              ) : null}
              <div className="sync-choice-grid">
                <button type="button" onClick={() => setPendingImport(null)}>
                  <strong>취소</strong>
                  <span>현재 기록을 그대로 유지합니다.</span>
                </button>
                <button type="button" onClick={confirmImportBackup}>
                  <strong>현재 기록 백업 후 불러오기</strong>
                  <span>현재 기록을 먼저 내려받아 안전하게 보관합니다.</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {activeDialogKey === "training-form" ? (
        <div
          className="modal-backdrop no-print"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setFormOpen(false);
          }}
        >
          <section
            ref={dialogRef}
            className="training-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="training-form-title"
            tabIndex={-1}
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
                  {form.kind === "required" ? (
                    <label className="field">
                      <span>적용 대상</span>
                      <select
                        value={form.applicabilityOverride}
                        onChange={(event) =>
                          setForm((previous) => ({
                            ...previous,
                            applicabilityOverride: event.target.value as
                              | ""
                              | ApplicabilityOverride,
                          }))
                        }
                      >
                        <option value="">근무 조건 추천 사용</option>
                        <option value="applies">이수 대상임</option>
                        <option value="not-applicable">해당 없음</option>
                      </select>
                    </label>
                  ) : null}
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
