"use client";

import { useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { CountdownDisplay } from "@/components/timer/CountdownDisplay";
import { TimerControls } from "@/components/timer/TimerControls";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { FormDialog } from "@/components/ui/FormDialog";
import { useToast } from "@/components/ui/Toast";
import { cn, formatDateTime, formatLogTime, displayActorName, formatDeltaSeconds } from "@/lib/utils";
import { RemainingChart } from "@/components/graph/RemainingChart";
import { useKeyboardShortcuts, SHORTCUT_HELP } from "@/hooks/useKeyboardShortcuts";
import { usePolling } from "@/hooks/usePolling";
import { useCountdownEnded } from "@/hooks/useCountdownEnded";
import { useUndoableModifyToast } from "@/hooks/useUndoableModifyToast";
import { authFetch } from "@/lib/auth-fetch";
import { hasExternalChange, type SyncedTimerSnapshot } from "@/lib/timer-sync";
import { connectionLostAgo } from "@/lib/connection-status";
import type {
  ApiSuccessResponse,
  ApiErrorResponse,
  TimerDetailResponse,
  TimerModifyResponse,
  ModifyAction,
  TimerLogsResponse,
  TimerLogResponse,
  ActionType,
  GraphResponse,
} from "@/types";

const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  CREATE: "생성",
  ADD: "추가",
  SUBTRACT: "차감",
  EXPIRE: "만료",
  REOPEN: "재시작",
  ACTIVATE: "활성화",
  DELETE: "삭제",
};

const ACTION_TYPE_BADGE_VARIANT: Record<ActionType, "create" | "add" | "subtract" | "expire" | "reopen" | "activate" | "delete"> = {
  CREATE: "create",
  ADD: "add",
  SUBTRACT: "subtract",
  EXPIRE: "expire",
  REOPEN: "reopen",
  ACTIVATE: "activate",
  DELETE: "delete",
};

// 필터는 보는 사람이 찾는 단위로 세 묶음만 둔다. 삭제(DELETE)된 타이머는 기록 자체를 볼 수 없어 칩이 필요 없다
const FILTER_GROUPS: { label: string; actions: ActionType[] }[] = [
  { label: "추가", actions: ["ADD"] },
  { label: "차감", actions: ["SUBTRACT"] },
  { label: "기타", actions: ["CREATE", "EXPIRE", "REOPEN", "ACTIVATE"] },
];

// 접힌 기록은 방금 일어난 일만 확인하는 용도라 몇 건만 보여 준다. 펼치면 필터와 페이지가 생긴다
const RECENT_LOG_LIMIT = 5;
const FULL_LOG_LIMIT = 20;

/**
 * 연결 끊김 배지. 경과 시간 문구만 1초마다 바뀌도록 따로 둔다(끊겼을 때만 마운트).
 * 좁은 화면에서는 경과 문구를 빼서 '실행 중' 배지처럼 카운트다운 옆 한 줄에 남게 한다(아래 내용이 밀리지 않게)
 */
function ConnectionLostBadge({ lastSyncedAtMs, className }: { lastSyncedAtMs: number | null; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const ago = connectionLostAgo(lastSyncedAtMs, now);
  return (
    <Badge variant="disconnected" className={cn("tabular-nums", className)}>
      연결 끊김{ago && <span className="hidden sm:inline"> · {ago}</span>}
    </Badge>
  );
}

/** 폴링 한 번의 응답 대기 한도. 넘으면 실패 1회로 센다 */
const POLL_TIMEOUT_MS = 10_000;

interface TimerConsoleProps {
  timerId: string;
  isOwner: boolean;
  /** 시간 조작 옆(소유자가 아니면 카운트다운 아래)에 둘 영역. 프로젝트 화면은 목표를 넣는다 */
  aside?: ReactNode;
  /** 시간이 바뀌었을 때(여기서 조작했거나 다른 기기에서 바뀌었을 때). 목표 진행률처럼 시간에 딸린 데이터를 다시 불러오는 데 쓴다 */
  onTimeChanged?: () => void;
  /** 다른 탭·기기에서 타이머가 삭제돼 폴링이 404를 받았을 때. 상위 화면이 '타이머 없음' 상태로 바꾼다 */
  onTimerRemoved?: () => void;
}

export function TimerConsole({ timerId, isOwner, aside, onTimeChanged, onTimerRemoved }: TimerConsoleProps) {
  const { toast } = useToast();

  const [timer, setTimer] = useState<TimerDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // 기록
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [logs, setLogs] = useState<TimerLogResponse[]>([]);
  const [logPage, setLogPage] = useState(1);
  const [logTotalPages, setLogTotalPages] = useState(1);
  const [activeFilters, setActiveFilters] = useState<Set<ActionType>>(new Set());
  const [logsLoading, setLogsLoading] = useState(false);

  // 그래프(잔여 시간 추이. 누적 변경량은 통계 페이지에 있다)
  const [graphData, setGraphData] = useState<GraphResponse | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState(false);

  // 추가/차감 방향. 세그먼트, 프리셋 라벨, 단축키가 이 상태 하나를 공유한다
  const [selectedAction, setSelectedAction] = useState<ModifyAction>("ADD");

  // 상위 화면은 렌더마다 새 콜백을 넘긴다. 첫 로드 effect가 의존하는 fetchTimer의 의존성에 넣으면
  // 렌더마다 첫 로드를 다시 하므로 ref로 최신 콜백만 읽는다
  const onTimerRemovedRef = useRef(onTimerRemoved);
  onTimerRemovedRef.current = onTimerRemoved;

  const fetchTimer = useCallback(async () => {
    try {
      const res = await fetch(`/api/timers/${timerId}`);
      // 목록을 받은 뒤 첫 조회 전에 다른 곳에서 삭제됐을 수 있다. 오류 화면 대신 '타이머 없음'으로 보낸다
      if (res.status === 404 && onTimerRemovedRef.current) {
        onTimerRemovedRef.current();
        return;
      }
      if (!res.ok) {
        setError(true);
        return;
      }
      const json = (await res.json()) as ApiSuccessResponse<TimerDetailResponse>;
      setTimer(json.data);
      setError(false);
    } catch {
      setError(true);
    }
  }, [timerId]);

  // silent: 폴링이 부르는 백그라운드 갱신. 로딩 표시 없이 기존 목록을 둔 채 새 데이터로 바꾼다
  const fetchLogs = useCallback(async (page: number, filters: Set<ActionType>, expanded: boolean, { silent = false } = {}) => {
    if (!silent) setLogsLoading(true);
    try {
      const params = new URLSearchParams({
        page: expanded ? String(page) : "1",
        limit: String(expanded ? FULL_LOG_LIMIT : RECENT_LOG_LIMIT),
      });
      if (expanded && filters.size > 0) {
        params.set("actionType", Array.from(filters).join(","));
      }
      const res = await fetch(`/api/timers/${timerId}/logs?${params}`);
      if (res.ok) {
        const json = (await res.json()) as ApiSuccessResponse<TimerLogsResponse>;
        setLogs(json.data.logs);
        setLogTotalPages(json.data.pagination.totalPages);
      }
    } catch {
      // ignore
    } finally {
      if (!silent) setLogsLoading(false);
    }
  }, [timerId]);

  // silent: 폴링이 부르는 백그라운드 갱신. 스피너를 띄우지 않고, 실패해도 보이던 그래프를 오류 문구로 바꾸지 않는다
  const fetchGraph = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setGraphLoading(true);
      setGraphError(false);
    }
    try {
      const res = await fetch(`/api/timers/${timerId}/graph?mode=remaining`);
      if (res.ok) {
        const json = (await res.json()) as ApiSuccessResponse<GraphResponse>;
        setGraphData(json.data);
        setGraphError(false);
      } else if (!silent) {
        setGraphError(true);
      }
    } catch {
      if (!silent) setGraphError(true);
    } finally {
      if (!silent) setGraphLoading(false);
    }
  }, [timerId]);

  useEffect(() => {
    async function load() {
      await fetchTimer();
      setLoading(false);
    }
    load();
  }, [fetchTimer]);

  useEffect(() => {
    fetchLogs(logPage, activeFilters, logsExpanded);
  }, [logPage, activeFilters, logsExpanded, fetchLogs]);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  // 폴링: 서버 동기화
  const pollInterval = timer?.status === "RUNNING" ? 5000 : 15000;

  // 화면에 마지막으로 반영한 값과 그 시각. 폴링 값이 다른 기기의 변경인지 판단하는 기준이다
  const syncedRef = useRef<SyncedTimerSnapshot | null>(null);
  useEffect(() => {
    syncedRef.current = timer
      ? { status: timer.status, remainingSeconds: timer.remainingSeconds, syncedAtMs: Date.now() }
      : null;
  }, [timer]);

  // 실패(네트워크 오류·5xx)는 잡지 않고 reject로 넘긴다. 화면은 마지막 값으로 로컬 카운트를 이어 가고,
  // 연속 실패 횟수는 usePolling이 세어 연결 상태로 돌려준다
  const pollTimer = useCallback(async () => {
    // 응답 없이 멈춘 요청(연결은 살아 있는데 패킷이 안 오는 경우)도 실패로 세도록 시간 제한을 둔다
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), POLL_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`/api/timers/${timerId}`, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (res.status === 404) {
      onTimerRemovedRef.current?.();
      return;
    }
    // 5xx 등은 서버 값을 받지 못한 것이라 실패로 알린다. 연속 실패가 쌓이면 배지가 '연결 끊김'으로 바뀐다
    if (!res.ok) throw new Error(`poll ${res.status}`);
    const json = (await res.json()) as ApiSuccessResponse<TimerDetailResponse>;
    const serverData = json.data;
    const synced = syncedRef.current;
    const externalChange = !!synced && hasExternalChange(synced, serverData, Date.now());

    setTimer((prev) => {
      if (!prev) return prev;
      if (prev.status !== serverData.status) {
        return serverData;
      }
      if (prev.status === "RUNNING") {
        const diff = Math.abs(prev.remainingSeconds - serverData.remainingSeconds);
        if (diff >= 2) {
          return { ...prev, remainingSeconds: serverData.remainingSeconds };
        }
      }
      return prev;
    });

    // 상태 전이(만료 등)나 다른 기기의 조작이 있을 때만 기록·그래프·목표를 다시 불러온다.
    // 펼친 기록의 2페이지 이후를 보고 있으면 목록이 밀리지 않게 기록은 건너뛴다
    if (externalChange) {
      if (logPage === 1) fetchLogs(1, activeFilters, logsExpanded, { silent: true });
      fetchGraph({ silent: true });
      onTimeChanged?.();
    }
  }, [timerId, logPage, activeFilters, logsExpanded, fetchLogs, fetchGraph, onTimeChanged]);

  const connection = usePolling({
    fn: pollTimer,
    interval: pollInterval,
    enabled: !loading && !error && !!timer,
  });

  function handleModified(data: TimerModifyResponse) {
    setTimer((prev) =>
      prev
        ? { ...prev, remainingSeconds: data.remainingSeconds, status: data.status }
        : prev,
    );
    // optimistic 호출(log.id 없음)에서는 기록·그래프·목표 갱신 생략
    if (data.log?.id) {
      fetchLogs(1, activeFilters, logsExpanded);
      setLogPage(1);
      fetchGraph();
      onTimeChanged?.();
    }
  }

  // 단축키 성공 토스트('+10분 · 닉네임' + 되돌리기). 되돌린 결과도 handleModified로 반영해 기록·그래프·목표를 다시 불러온다
  const showModifiedToast = useUndoableModifyToast(timerId, handleModified);

  // 숫자 단축키가 기록할 닉네임. 시간 조작 카드(TimerControls)가 모바일 하단 바와 같은 규칙으로 렌더마다 채운다
  // (입력란의 이름 우선, 비면 기본 닉네임). 단축키 핸들러가 다시 만들어지지 않도록 ref로 들고 있는다
  const quickActorRef = useRef("");

  // 키보드 단축키 핸들러
  const handleKeyboardPreset = useCallback(async (seconds: number) => {
    if (!isOwner || !timer || timer.status === "SCHEDULED") return;
    const actor = quickActorRef.current;
    if (actor) {
      try {
        const res = await authFetch(`/api/timers/${timerId}/modify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: selectedAction, deltaSeconds: seconds, actorName: actor }),
        });
        if (res.ok) {
          const json = (await res.json()) as ApiSuccessResponse<TimerModifyResponse>;
          handleModified(json.data);
          showModifiedToast(json.data.log);
        } else {
          const json = (await res.json().catch(() => null)) as ApiErrorResponse | null;
          toast(json?.error?.message || "시간 변경에 실패했습니다.", "error");
        }
      } catch {
        toast("시간 변경에 실패했습니다.", "error");
      }
    } else {
      toast("시청자 닉네임을 입력하면 숫자키로 즉시 적용됩니다. 닉네임 입력 후 ‘기본 닉네임으로 설정’을 누르면 다음부터 입력 없이 적용됩니다", "info");
    }
    // handleModified가 읽는 기록 상태(필터, 펼침)가 바뀌면 다시 만들어 오래된 값으로 기록을 불러오지 않게 한다
  }, [isOwner, timer, toast, showModifiedToast, timerId, selectedAction, activeFilters, logsExpanded]);

  const handleToggleAction = useCallback(() => {
    setSelectedAction((prev) => (prev === "ADD" ? "SUBTRACT" : "ADD"));
  }, []);

  const handleRefresh = useCallback(() => {
    fetchTimer();
    fetchLogs(logPage, activeFilters, logsExpanded);
    fetchGraph();
    onTimeChanged?.();
  }, [fetchTimer, fetchLogs, fetchGraph, onTimeChanged, logPage, activeFilters, logsExpanded]);

  const shortcutsEnabled = isOwner && !!timer && timer.status !== "SCHEDULED";
  const { showHelp, setShowHelp } = useKeyboardShortcuts({
    enabled: shortcutsEnabled,
    onPreset: handleKeyboardPreset,
    onToggleAction: handleToggleAction,
    onRefresh: handleRefresh,
  });

  // 카운트다운이 0에 닿으면 다음 폴링을 기다리지 않고 배지를 '만료'로 보여 준다
  const countdownEnded = useCountdownEnded(timer?.remainingSeconds, timer?.status);

  const isFilterOn = (actions: ActionType[]) => actions.every((a) => activeFilters.has(a));

  function toggleFilter(actions: ActionType[]) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      const on = actions.every((a) => next.has(a));
      for (const a of actions) {
        if (on) next.delete(a);
        else next.add(a);
      }
      return next;
    });
    setLogPage(1);
  }

  function toggleLogsExpanded() {
    setLogsExpanded((prev) => !prev);
    setLogPage(1);
    setActiveFilters(new Set());
  }

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-16 w-72" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !timer) {
    return (
      <ErrorState
        message="타이머 정보를 불러오지 못했습니다."
        onRetry={async () => { setLoading(true); await fetchTimer(); setLoading(false); }}
      />
    );
  }

  const displayStatus = countdownEnded ? "EXPIRED" : timer.status;
  const statusBadgeVariant = displayStatus === "SCHEDULED" ? "scheduled" : displayStatus === "RUNNING" ? "running" : "expired";
  const statusLabel = displayStatus === "SCHEDULED" ? "예약됨" : displayStatus === "RUNNING" ? "실행 중" : "만료";

  return (
    <div className="space-y-8">
      {/* 카운트다운 */}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <CountdownDisplay
          remainingSeconds={timer.remainingSeconds}
          status={timer.status}
          scheduledStartAt={timer.scheduledStartAt}
          size="large"
        />
        {/* 연결이 끊기면 서버 상태를 알 수 없으므로 상태 배지 자리를 연결 끊김으로 바꾼다. 숫자는 로컬 추정값으로 계속 흐른다 */}
        {connection.disconnected ? (
          <ConnectionLostBadge lastSyncedAtMs={connection.lastSuccessAtMs} className="mt-2" />
        ) : (
          <Badge variant={statusBadgeVariant} className="mt-2">
            {statusLabel}
          </Badge>
        )}
      </div>

      {/* 시간 조작 + 곁 영역(목표). 방송 중 가장 자주 쓰는 두 가지를 첫 화면에 나란히 둔다 */}
      {(isOwner || aside) && (
        <div className={cn("grid gap-5", isOwner && !!aside && "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start")}>
          {isOwner && (
            <section aria-labelledby="timer-controls-heading" className="rounded-xl border border-accent/30 bg-accent-light/20 p-5">
              {/* 단축키가 있다는 사실을 '?'를 몰라도 알 수 있게, 도움말로 가는 진입점을 제목 줄에 하나만 둔다.
                  키보드가 있는 포인터 기기에서만 보인다(터치 기기에서는 단축키를 쓸 수 없다) */}
              <div className="flex items-center justify-between gap-3">
                <h2 id="timer-controls-heading" className="text-sm font-bold text-foreground">시간 조작</h2>
                {shortcutsEnabled && (
                  <button
                    type="button"
                    onClick={() => setShowHelp(true)}
                    aria-haspopup="dialog"
                    className="hidden pointer-fine:inline-flex -my-1 -mr-2 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    단축키
                  </button>
                )}
              </div>
              <TimerControls
                timerId={timerId}
                status={timer.status}
                remainingSeconds={timer.remainingSeconds}
                selectedAction={selectedAction}
                onActionChange={setSelectedAction}
                onModified={handleModified}
                onTimerRemoved={() => onTimerRemovedRef.current?.()}
                quickActorRef={quickActorRef}
                className="mt-3"
              />
            </section>
          )}
          {aside}
        </div>
      )}

      {/* 기록 + 그래프 */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <section aria-labelledby="timer-logs-heading">
          <div className="flex items-center justify-between gap-4">
            <h2 id="timer-logs-heading" className="border-l-2 border-accent pl-3 text-lg font-bold">
              {logsExpanded ? "변경 기록" : "최근 변경"}
            </h2>
            <button
              type="button"
              onClick={toggleLogsExpanded}
              aria-expanded={logsExpanded}
              className="min-h-11 rounded-md px-2 text-sm font-medium text-accent hover:bg-accent-light transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {logsExpanded ? "접기" : "전체 기록"}
            </button>
          </div>

          {/* 필터 */}
          {logsExpanded && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {FILTER_GROUPS.map(({ label, actions }) => (
                <button
                  key={label}
                  onClick={() => toggleFilter(actions)}
                  aria-pressed={isFilterOn(actions)}
                  className={cn(
                    "rounded-full px-3 py-2 min-h-11 text-xs font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isFilterOn(actions)
                      ? "bg-accent text-accent-foreground"
                      : "border border-border text-muted-foreground hover:bg-foreground/5",
                  )}
                >
                  {label}
                </button>
              ))}
              {activeFilters.size > 0 && (
                <button
                  onClick={() => { setActiveFilters(new Set()); setLogPage(1); }}
                  aria-label="필터 초기화"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
                >
                  초기화
                </button>
              )}
            </div>
          )}

          <div className={cn("mt-3 relative", logsLoading && "opacity-50")}>
            {logsLoading && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <Spinner />
              </div>
            )}

            {logs.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">기록이 없습니다.</p>
            ) : (
              <ul>
                {logs.map((log) => (
                  <li
                    key={log.id}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-border/50 py-2.5 text-sm"
                  >
                    <Badge variant={ACTION_TYPE_BADGE_VARIANT[log.actionType]}>
                      {ACTION_TYPE_LABELS[log.actionType]}
                    </Badge>
                    {/* 되돌린 기록은 지우지 않고 글자로 표시한다(통계·그래프에서는 빠진다) */}
                    <span className="truncate">
                      {displayActorName(log)}
                      {log.revertedAt && <span className="ml-1.5 text-xs text-muted-foreground">· 되돌림</span>}
                    </span>
                    {log.deltaSeconds > 0 ? (
                      <span className={cn(
                        "text-right font-mono text-xs font-medium",
                        log.revertedAt
                          ? "text-muted-foreground line-through"
                          : log.actionType === "ADD" ? "text-green-700 dark:text-green-400" : log.actionType === "SUBTRACT" ? "text-red-600 dark:text-red-400" : "",
                      )}>
                        {log.actionType === "ADD" ? "+" : log.actionType === "SUBTRACT" ? "-" : ""}
                        {formatDeltaSeconds(log.deltaSeconds)}
                      </span>
                    ) : (
                      <span className="text-right font-mono text-xs text-muted-foreground">—</span>
                    )}
                    {/* 좁은 화면에서 변경 전→후가 길면 날짜가 둘로 쪼개지지 않고 전→후가 다음 줄로 내려간다 */}
                    <div className="col-span-3 flex flex-wrap items-baseline justify-between gap-x-3 font-mono text-xs text-muted-foreground">
                      {/* 오늘이면 'HH:mm'만, 날짜는 오늘이 아닐 때만. 초까지의 전체 시각은 title로 */}
                      <time dateTime={log.createdAt} title={formatDateTime(log.createdAt)} className="whitespace-nowrap">
                        {formatLogTime(log.createdAt)}
                      </time>
                      <span className="ml-auto whitespace-nowrap text-right">
                        {formatDeltaSeconds(log.beforeSeconds)} → <span className="text-foreground">{formatDeltaSeconds(log.afterSeconds)}</span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {logsExpanded && logTotalPages > 1 && (
            <div className="mt-4">
              <Pagination
                page={logPage}
                totalPages={logTotalPages}
                onPageChange={setLogPage}
              />
            </div>
          )}
        </section>

        <section aria-labelledby="timer-graph-heading">
          <h2 id="timer-graph-heading" className="border-l-2 border-accent pl-3 text-lg font-bold">잔여 시간 추이</h2>
          <div className="mt-3 rounded-xl border border-border bg-muted p-4">
            {graphLoading ? (
              <div className="flex h-64 items-center justify-center">
                <Spinner />
              </div>
            ) : graphError ? (
              <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
                <p className="text-sm">그래프를 불러오는데 실패했습니다.</p>
                <button
                  onClick={() => fetchGraph()}
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent-light transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  다시 시도
                </button>
              </div>
            ) : graphData?.mode === "remaining" ? (
              <RemainingChart points={graphData.points} />
            ) : null}
          </div>
        </section>
      </div>

      {/* 단축키 도움말. 다른 다이얼로그와 같은 FormDialog(닫기 버튼, Escape, 배경 클릭)를 쓴다.
          본문은 열렸을 때만 렌더한다 */}
      <FormDialog open={showHelp} title="키보드 단축키" onClose={() => setShowHelp(false)}>
        {showHelp && (
          <>
            <div className="space-y-2">
              {SHORTCUT_HELP.map((item) => (
                <div key={item.key} className="flex items-center gap-3 text-sm">
                  <kbd className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs">
                    {item.key}
                  </kbd>
                  <span className="text-muted-foreground">{item.description}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              입력 필드에 포커스가 없을 때만 동작합니다. 숫자키는 입력한 시청자 닉네임(비어 있으면 기본 닉네임)으로 즉시 적용됩니다.
              기본 닉네임은 닉네임 입력 후 &lsquo;기본 닉네임으로 설정&rsquo;을 누르면 정해집니다.
            </p>
          </>
        )}
      </FormDialog>
    </div>
  );
}
