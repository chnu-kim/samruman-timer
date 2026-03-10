"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CountdownDisplay } from "@/components/timer/CountdownDisplay";
import { TimerControls } from "@/components/timer/TimerControls";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { cn } from "@/lib/utils";
import { GraphModeSelector } from "@/components/graph/GraphModeSelector";
import { RemainingChart } from "@/components/graph/RemainingChart";
import { CumulativeChart } from "@/components/graph/CumulativeChart";
import { FrequencyChart } from "@/components/graph/FrequencyChart";
import type {
  ApiSuccessResponse,
  TimerDetailResponse,
  TimerModifyResponse,
  TimerLogsResponse,
  TimerLogResponse,
  ActionType,
  MeResponse,
  GraphMode,
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

const ACTION_TYPE_BADGE_VARIANT: Record<ActionType, "create" | "add" | "subtract" | "expire" | "reopen" | "activate"> = {
  CREATE: "create",
  ADD: "add",
  SUBTRACT: "subtract",
  EXPIRE: "expire",
  REOPEN: "reopen",
  ACTIVATE: "activate",
  DELETE: "expire",
};

const FILTER_ACTIONS: ActionType[] = ["CREATE", "ADD", "SUBTRACT", "EXPIRE", "REOPEN", "ACTIVATE"];

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

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function TimerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const timerId = params.id;
  const [deleting, setDeleting] = useState(false);

  const [timer, setTimer] = useState<TimerDetailResponse | null>(null);
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 로그
  const [logs, setLogs] = useState<TimerLogResponse[]>([]);
  const [logPage, setLogPage] = useState(1);
  const [logTotalPages, setLogTotalPages] = useState(1);
  const [activeFilters, setActiveFilters] = useState<Set<ActionType>>(new Set());

  // 그래프
  const [graphMode, setGraphMode] = useState<GraphMode>("remaining");
  const [graphData, setGraphData] = useState<GraphResponse | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);

  const fetchTimer = useCallback(async () => {
    try {
      const res = await fetch(`/api/timers/${timerId}`);
      if (!res.ok) {
        setError("타이머를 찾을 수 없습니다.");
        return;
      }
      const json = (await res.json()) as ApiSuccessResponse<TimerDetailResponse>;
      setTimer(json.data);
    } catch {
      setError("타이머 정보를 불러오는데 실패했습니다.");
    }
  }, [timerId]);

  const fetchLogs = useCallback(async (page: number, filters: Set<ActionType>) => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (filters.size > 0) {
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
    }
  }, [timerId]);

  useEffect(() => {
    async function load() {
      await fetchTimer();
      setLoading(false);
    }
    load();
    fetch("/api/auth/me")
      .then(async (res) => {
        if (res.ok) {
          const json = (await res.json()) as { data: MeResponse };
          setUser(json.data);
        }
      })
      .catch(() => {});
  }, [fetchTimer]);

  useEffect(() => {
    fetchLogs(logPage, activeFilters);
  }, [logPage, activeFilters, fetchLogs]);

  const fetchGraph = useCallback(async (mode: GraphMode) => {
    setGraphLoading(true);
    try {
      const res = await fetch(`/api/timers/${timerId}/graph?mode=${mode}`);
      if (res.ok) {
        const json = (await res.json()) as ApiSuccessResponse<GraphResponse>;
        setGraphData(json.data);
      }
    } catch {
      // ignore
    } finally {
      setGraphLoading(false);
    }
  }, [timerId]);

  useEffect(() => {
    fetchGraph(graphMode);
  }, [graphMode, fetchGraph]);

  function handleModified(data: TimerModifyResponse) {
    setTimer((prev) =>
      prev
        ? { ...prev, remainingSeconds: data.remainingSeconds, status: data.status }
        : prev,
    );
    fetchLogs(1, activeFilters);
    setLogPage(1);
    fetchGraph(graphMode);
  }

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

  if (loading) {
    return (
      <section>
        <p className="text-foreground/60">로딩 중...</p>
      </section>
    );
  }

  if (error || !timer) {
    return (
      <section>
        <p className="text-foreground/60">{error || "타이머를 찾을 수 없습니다."}</p>
      </section>
    );
  }

  const isOwner = !!user;
  const statusBadgeVariant = timer.status === "SCHEDULED" ? "scheduled" : timer.status === "RUNNING" ? "running" : "expired";
  const statusLabel = timer.status === "SCHEDULED" ? "예약됨" : timer.status === "RUNNING" ? "실행 중" : "만료";

  return (
    <section>
      {/* 브레드크럼 */}
      <nav className="text-sm text-foreground/40" aria-label="경로">
        <Link href={`/projects/${timer.projectId}`} className="hover:text-foreground transition-colors">
          프로젝트
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground/60">{timer.title}</span>
      </nav>

      {/* 타이머 헤더 */}
      <div className="mt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold">{timer.title}</h1>
            {timer.description && (
              <p className="mt-1 text-foreground/60">{timer.description}</p>
            )}
            <p className="mt-1 text-sm text-foreground/40">
              {timer.createdBy.nickname} · {formatDateTime(timer.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 mt-1">
            <Badge variant={statusBadgeVariant}>
              {statusLabel}
            </Badge>
            {isOwner && (
              <button
                disabled={deleting}
                aria-label="타이머 삭제"
                title="타이머 삭제"
                onClick={async () => {
                  if (!window.confirm("정말로 이 타이머를 삭제하시겠습니까?")) return;
                  setDeleting(true);
                  try {
                    const res = await fetch(`/api/timers/${timerId}`, { method: "DELETE" });
                    if (res.ok) {
                      router.push(`/projects/${timer.projectId}`);
                    } else {
                      setDeleting(false);
                    }
                  } catch {
                    setDeleting(false);
                  }
                }}
                className={cn(
                  "rounded-lg p-1.5 transition-colors",
                  deleting
                    ? "opacity-50 cursor-not-allowed"
                    : "text-foreground/30 hover:text-red-500 hover:bg-red-500/10"
                )}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5l-1-1h-5l-1 1H5v2h14V4h-3.5z" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* 카운트다운 */}
        <div className="mt-6">
          <CountdownDisplay
            remainingSeconds={timer.remainingSeconds}
            status={timer.status}
            scheduledStartAt={timer.scheduledStartAt}
            size="large"
          />
        </div>
      </div>

      {/* 시간 조작 */}
      {isOwner && (
        <div className="mt-8 rounded-xl border border-foreground/20 p-5">
          <h2 className="text-sm font-medium text-foreground">시간 조작</h2>
          <TimerControls
            timerId={timerId}
            status={timer.status}
            onModified={handleModified}
            className="mt-3"
          />
        </div>
      )}

      {/* 로그 */}
      <div className="mt-8">
        <h2 className="text-lg font-bold">변경 기록</h2>

        {/* 필터 */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {FILTER_ACTIONS.map((action) => (
            <button
              key={action}
              onClick={() => toggleFilter(action)}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                activeFilters.has(action)
                  ? "bg-foreground text-background"
                  : "border border-foreground/20 text-foreground/60 hover:bg-foreground/5",
              )}
            >
              {ACTION_TYPE_LABELS[action]}
            </button>
          ))}
          {activeFilters.size > 0 && (
            <button
              onClick={() => { setActiveFilters(new Set()); setLogPage(1); }}
              className="text-xs text-foreground/40 hover:text-foreground transition-colors ml-1"
            >
              초기화
            </button>
          )}
        </div>

        {/* 로그 테이블 */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-foreground/10 text-left text-foreground/40">
                <th className="pb-2 pr-4 font-medium">시각</th>
                <th className="pb-2 pr-4 font-medium">액션</th>
                <th className="pb-2 pr-4 font-medium">시청자</th>
                <th className="pb-2 pr-4 font-medium text-right">변경량</th>
                <th className="pb-2 pr-4 font-medium text-right">변경 전</th>
                <th className="pb-2 font-medium text-right">변경 후</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-foreground/60">
                    기록이 없습니다.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-b border-foreground/5">
                    <td className="py-2.5 pr-4 whitespace-nowrap font-mono text-xs text-foreground/60">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge variant={ACTION_TYPE_BADGE_VARIANT[log.actionType]}>
                        {ACTION_TYPE_LABELS[log.actionType]}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-4">{log.actorName}</td>
                    <td className="py-2.5 pr-4 text-right font-mono text-xs">
                      {log.deltaSeconds > 0 ? (
                        <span className={log.actionType === "ADD" ? "text-green-600 dark:text-green-400" : log.actionType === "SUBTRACT" ? "text-red-600 dark:text-red-400" : ""}>
                          {log.actionType === "ADD" ? "+" : log.actionType === "SUBTRACT" ? "-" : ""}
                          {formatSeconds(log.deltaSeconds)}
                        </span>
                      ) : (
                        <span className="text-foreground/40">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono text-xs text-foreground/60">
                      {formatSeconds(log.beforeSeconds)}
                    </td>
                    <td className="py-2.5 text-right font-mono text-xs">
                      {formatSeconds(log.afterSeconds)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {logTotalPages > 1 && (
          <div className="mt-4">
            <Pagination
              page={logPage}
              totalPages={logTotalPages}
              onPageChange={setLogPage}
            />
          </div>
        )}
      </div>

      {/* 그래프 */}
      <div className="mt-8">
        <h2 className="text-lg font-bold">그래프</h2>
        <GraphModeSelector mode={graphMode} onModeChange={(m) => { setGraphData(null); setGraphMode(m); }} className="mt-3" />
        <div className="mt-4 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4">
          {graphLoading ? (
            <div className="flex h-64 items-center justify-center text-foreground/40">
              로딩 중...
            </div>
          ) : graphData?.mode === "remaining" ? (
            <RemainingChart points={graphData.points} />
          ) : graphData?.mode === "cumulative" ? (
            <CumulativeChart points={graphData.points} />
          ) : graphData?.mode === "frequency" ? (
            <FrequencyChart buckets={graphData.buckets} />
          ) : null}
        </div>
      </div>
    </section>
  );
}
