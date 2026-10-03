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
import { cn, formatDateTime, displayActorName } from "@/lib/utils";
import { RemainingChart } from "@/components/graph/RemainingChart";
import { useKeyboardShortcuts, SHORTCUT_HELP } from "@/hooks/useKeyboardShortcuts";
import { usePolling } from "@/hooks/usePolling";
import { useCountdownEnded } from "@/hooks/useCountdownEnded";
import { authFetch } from "@/lib/auth-fetch";
import { hasExternalChange, type SyncedTimerSnapshot } from "@/lib/timer-sync";
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

const FILTER_ACTIONS: ActionType[] = ["CREATE", "ADD", "SUBTRACT", "EXPIRE", "REOPEN", "ACTIVATE", "DELETE"];

// 접힌 기록은 방금 일어난 일만 확인하는 용도라 몇 건만 보여 준다. 펼치면 필터와 페이지가 생긴다
const RECENT_LOG_LIMIT = 5;
const FULL_LOG_LIMIT = 20;

function formatSeconds(s: number): string {
  const abs = Math.abs(s);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const sec = abs % 60;

  const parts: string[] = [];
  if (h > 0) parts.push(`${h}시간`);
  if (m > 0) parts.push(`${m}분`);
  if (sec > 0 || parts.length === 0) parts.push(`${sec}초`);
  return parts.join(" ");
}

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

  const fetchTimer = useCallback(async () => {
    try {
      const res = await fetch(`/api/timers/${timerId}`);
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

  const pollTimer = useCallback(async () => {
    try {
      const res = await fetch(`/api/timers/${timerId}`);
      if (res.status === 404) {
        onTimerRemoved?.();
        return;
      }
      if (!res.ok) return;
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
    } catch {
      // 폴링 실패는 무시
    }
  }, [timerId, logPage, activeFilters, logsExpanded, fetchLogs, fetchGraph, onTimeChanged, onTimerRemoved]);

  usePolling({
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

  // 키보드 단축키 핸들러
  const handleKeyboardPreset = useCallback(async (seconds: number) => {
    if (!isOwner || !timer || timer.status === "SCHEDULED") return;
    // 기본 닉네임이 설정되어 있으면 즉시 적용 가능
    const defaultActor = (() => {
      try { return localStorage.getItem("defaultActorName") || ""; } catch { return ""; }
    })();
    if (defaultActor) {
      try {
        const res = await authFetch(`/api/timers/${timerId}/modify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: selectedAction, deltaSeconds: seconds, actorName: defaultActor }),
        });
        if (res.ok) {
          const json = (await res.json()) as ApiSuccessResponse<TimerModifyResponse>;
          handleModified(json.data);
          toast(`${selectedAction === "ADD" ? "추가" : "차감"} 완료 (${defaultActor})`, "success");
        } else {
          const json = (await res.json().catch(() => null)) as ApiErrorResponse | null;
          toast(json?.error?.message || "시간 변경에 실패했습니다.", "error");
        }
      } catch {
        toast("시간 변경에 실패했습니다.", "error");
      }
    } else {
      toast("기본 닉네임을 설정하면 숫자키로 즉시 적용됩니다", "info");
    }
    // handleModified가 읽는 기록 상태(필터, 펼침)가 바뀌면 다시 만들어 오래된 값으로 기록을 불러오지 않게 한다
  }, [isOwner, timer, toast, timerId, selectedAction, activeFilters, logsExpanded]);

  const handleToggleAction = useCallback(() => {
    setSelectedAction((prev) => (prev === "ADD" ? "SUBTRACT" : "ADD"));
  }, []);

  const handleRefresh = useCallback(() => {
    fetchTimer();
    fetchLogs(logPage, activeFilters, logsExpanded);
    fetchGraph();
    onTimeChanged?.();
    toast("새로고침 완료", "success");
  }, [fetchTimer, fetchLogs, fetchGraph, onTimeChanged, logPage, activeFilters, logsExpanded, toast]);

  const { showHelp, setShowHelp } = useKeyboardShortcuts({
    enabled: isOwner && !!timer && timer.status !== "SCHEDULED",
    onPreset: handleKeyboardPreset,
    onToggleAction: handleToggleAction,
    onRefresh: handleRefresh,
  });

  // 카운트다운이 0에 닿으면 다음 폴링을 기다리지 않고 배지를 '만료'로 보여 준다
  const countdownEnded = useCountdownEnded(timer?.remainingSeconds, timer?.status);

  function toggleFilter(action: ActionType) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(action)) {
        next.delete(action);
      } else {
        next.add(action);
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
        <Badge variant={statusBadgeVariant} className="mt-2">
          {statusLabel}
        </Badge>
      </div>

      {/* 시간 조작 + 곁 영역(목표). 방송 중 가장 자주 쓰는 두 가지를 첫 화면에 나란히 둔다 */}
      {(isOwner || aside) && (
        <div className={cn("grid gap-5", isOwner && !!aside && "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start")}>
          {isOwner && (
            <section aria-labelledby="timer-controls-heading" className="rounded-xl border border-accent/30 bg-accent-light/20 p-5">
              <h2 id="timer-controls-heading" className="text-sm font-bold text-foreground">시간 조작</h2>
              <TimerControls
                timerId={timerId}
                status={timer.status}
                remainingSeconds={timer.remainingSeconds}
                selectedAction={selectedAction}
                onActionChange={setSelectedAction}
                onModified={handleModified}
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
              {FILTER_ACTIONS.map((action) => (
                <button
                  key={action}
                  onClick={() => toggleFilter(action)}
                  aria-pressed={activeFilters.has(action)}
                  className={cn(
                    "rounded-full px-3 py-2 min-h-11 text-xs font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    activeFilters.has(action)
                      ? "bg-accent text-accent-foreground"
                      : "border border-border text-muted-foreground hover:bg-foreground/5",
                  )}
                >
                  {ACTION_TYPE_LABELS[action]}
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
                    <span className="truncate">{displayActorName(log)}</span>
                    {log.deltaSeconds > 0 ? (
                      <span className={cn(
                        "text-right font-mono text-xs font-medium",
                        log.actionType === "ADD" ? "text-green-700 dark:text-green-400" : log.actionType === "SUBTRACT" ? "text-red-600 dark:text-red-400" : "",
                      )}>
                        {log.actionType === "ADD" ? "+" : log.actionType === "SUBTRACT" ? "-" : ""}
                        {formatSeconds(log.deltaSeconds)}
                      </span>
                    ) : (
                      <span className="text-right font-mono text-xs text-muted-foreground">—</span>
                    )}
                    <span className="col-span-2 font-mono text-xs text-muted-foreground">
                      {formatDateTime(log.createdAt)}
                    </span>
                    <span className="text-right font-mono text-xs text-muted-foreground">
                      {formatSeconds(log.beforeSeconds)} → <span className="text-foreground">{formatSeconds(log.afterSeconds)}</span>
                    </span>
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
          본문은 localStorage를 읽으므로 열렸을 때만 렌더한다(서버 렌더와 어긋나지 않게) */}
      <FormDialog open={showHelp} title="키보드 단축키" onClose={() => setShowHelp(false)}>
        {showHelp && (
          <>
            <div className="space-y-2">
              {SHORTCUT_HELP.map((item) => (
                <div key={item.key} className="flex items-center justify-between text-sm">
                  <kbd className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs">
                    {item.key}
                  </kbd>
                  <span className="text-muted-foreground">{item.description}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              입력 필드에 포커스가 없을 때만 동작합니다.
              {(() => {
                try { return localStorage.getItem("defaultActorName"); } catch { return ""; }
              })() ? " 기본 닉네임이 설정되어 있으면 숫자키로 즉시 적용됩니다." : " 기본 닉네임을 설정하면 숫자키로 즉시 적용할 수 있습니다."}
            </p>
          </>
        )}
      </FormDialog>
    </div>
  );
}
