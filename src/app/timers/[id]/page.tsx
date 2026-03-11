"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CountdownDisplay } from "@/components/timer/CountdownDisplay";
import { TimerControls } from "@/components/timer/TimerControls";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EditableText } from "@/components/ui/EditableText";
import { ErrorState } from "@/components/ui/ErrorState";
import { TrashIcon, LinkIcon, ChartBarIcon } from "@/components/ui/Icons";
import { TimerDetailSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { GraphModeSelector } from "@/components/graph/GraphModeSelector";
import { RemainingChart } from "@/components/graph/RemainingChart";
import { CumulativeChart } from "@/components/graph/CumulativeChart";
import { FrequencyChart } from "@/components/graph/FrequencyChart";
import { useKeyboardShortcuts, SHORTCUT_HELP } from "@/hooks/useKeyboardShortcuts";
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
  const { toast } = useToast();
  const timerId = params.id;
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const [timer, setTimer] = useState<TimerDetailResponse | null>(null);
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 로그
  const [logs, setLogs] = useState<TimerLogResponse[]>([]);
  const [logPage, setLogPage] = useState(1);
  const [logTotalPages, setLogTotalPages] = useState(1);
  const [activeFilters, setActiveFilters] = useState<Set<ActionType>>(new Set());
  const [logsLoading, setLogsLoading] = useState(false);

  // 그래프
  const [graphMode, setGraphMode] = useState<GraphMode>("remaining");
  const [graphData, setGraphData] = useState<GraphResponse | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);

  // 키보드 단축키 상태
  const [selectedAction, setSelectedAction] = useState<"ADD" | "SUBTRACT">("ADD");

  const isOwner = !!user && user.id === timer?.projectOwnerId;

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
    setLogsLoading(true);
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
    } finally {
      setLogsLoading(false);
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

  // 키보드 단축키 (Step 11)
  const handleKeyboardPreset = useCallback(async (seconds: number) => {
    if (!isOwner || !timer || timer.status === "SCHEDULED") return;
    // 단축키 프리셋은 actorName 없이 사용 불가 — toast로 안내
    toast(`닉네임 입력 후 숫자키로 즉시 적용할 수 있습니다`, "info");
  }, [isOwner, timer, toast]);

  const handleToggleAction = useCallback(() => {
    setSelectedAction((prev) => (prev === "ADD" ? "SUBTRACT" : "ADD"));
  }, []);

  const { showHelp, setShowHelp } = useKeyboardShortcuts({
    enabled: isOwner && !!timer && timer.status !== "SCHEDULED",
    onPreset: handleKeyboardPreset,
    onToggleAction: handleToggleAction,
  });

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

  async function handleDelete() {
    setShowDeleteDialog(false);
    setDeleting(true);
    try {
      const res = await fetch(`/api/timers/${timerId}`, { method: "DELETE" });
      if (res.ok) {
        router.push(`/projects/${timer!.projectId}`);
      } else {
        setDeleting(false);
      }
    } catch {
      setDeleting(false);
    }
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href);
    toast("링크가 복사되었습니다", "success");
  }

  function handleCopyOverlayLink() {
    const url = `${window.location.origin}/timers/${timerId}/overlay`;
    navigator.clipboard.writeText(url);
    toast("OBS 오버레이 URL이 복사되었습니다", "success");
  }

  async function handleSaveTitle(title: string) {
    const res = await fetch(`/api/timers/${timerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) throw new Error();
    const json = (await res.json()) as ApiSuccessResponse<TimerDetailResponse>;
    setTimer(json.data);
    toast("타이머 제목이 수정되었습니다", "success");
  }

  async function handleSaveDescription(description: string) {
    const res = await fetch(`/api/timers/${timerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });
    if (!res.ok) throw new Error();
    const json = (await res.json()) as ApiSuccessResponse<TimerDetailResponse>;
    setTimer(json.data);
    toast("타이머 설명이 수정되었습니다", "success");
  }

  if (loading) {
    return (
      <section className="py-4">
        <TimerDetailSkeleton />
      </section>
    );
  }

  if (error || !timer) {
    return (
      <ErrorState
        message={error || "타이머를 찾을 수 없습니다."}
        onRetry={async () => { setError(""); setLoading(true); await fetchTimer(); setLoading(false); }}
      />
    );
  }

  const statusBadgeVariant = timer.status === "SCHEDULED" ? "scheduled" : timer.status === "RUNNING" ? "running" : "expired";
  const statusLabel = timer.status === "SCHEDULED" ? "예약됨" : timer.status === "RUNNING" ? "실행 중" : "만료";

  return (
    <section>
      {/* 브레드크럼 */}
      <nav className="text-sm text-muted-foreground" aria-label="경로">
        <Link href={`/projects/${timer.projectId}`} className="hover:text-foreground transition-colors">
          프로젝트
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{timer.title}</span>
      </nav>

      {/* 타이머 헤더 */}
      <div className="mt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <EditableText
              value={timer.title}
              onSave={handleSaveTitle}
              editable={isOwner}
              as="h1"
              className="text-2xl font-bold"
            />
            {(timer.description || isOwner) && (
              <EditableText
                value={timer.description || ""}
                onSave={handleSaveDescription}
                editable={isOwner}
                as="p"
                className="mt-1 text-muted-foreground"
                placeholder="설명 추가..."
              />
            )}
            <p className="mt-1 text-sm text-muted-foreground">
              {timer.createdBy.nickname} · {formatDateTime(timer.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0 mt-1">
            <Badge variant={statusBadgeVariant}>
              {statusLabel}
            </Badge>
            <Link
              href={`/projects/${timer.projectId}/stats`}
              aria-label="프로젝트 통계"
              title="프로젝트 통계"
              className="rounded-lg p-1.5 min-h-11 min-w-11 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChartBarIcon className="w-5 h-5" />
            </Link>
            <button
              onClick={handleCopyLink}
              aria-label="링크 복사"
              title="링크 복사"
              className="rounded-lg p-1.5 min-h-11 min-w-11 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LinkIcon className="w-5 h-5" />
            </button>
            {isOwner && (
              <button
                disabled={deleting}
                aria-label="타이머 삭제"
                title="타이머 삭제"
                onClick={() => setShowDeleteDialog(true)}
                className={cn(
                  "rounded-lg p-1.5 min-h-11 min-w-11 flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  deleting
                    ? "opacity-50 cursor-not-allowed"
                    : "text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                )}
              >
                <TrashIcon className="w-5 h-5" />
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

        {/* OBS 오버레이 URL 복사 */}
        {isOwner && (
          <button
            onClick={handleCopyOverlayLink}
            aria-label="OBS 오버레이 URL 복사"
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LinkIcon className="w-3.5 h-3.5" />
            OBS 오버레이 URL 복사
          </button>
        )}
      </div>

      {/* 시간 조작 */}
      {isOwner && (
        <div className="mt-8 rounded-xl border border-accent/20 bg-accent-light/30 p-5">
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
        <h2 className="border-l-2 border-accent pl-3 text-lg font-bold">변경 기록</h2>

        {/* 필터 */}
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

        {/* 로그 - 데스크톱 테이블 */}
        <div className={cn("mt-4 relative", logsLoading && "opacity-50")}>
          {logsLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="w-6 h-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
          )}

          {/* 데스크톱: 테이블 */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
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
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      기록이 없습니다.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="border-b border-border/50">
                      <td className="py-2.5 pr-4 whitespace-nowrap font-mono text-xs text-muted-foreground">
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
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono text-xs text-muted-foreground">
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

          {/* 모바일: 카드 뷰 */}
          <div className="md:hidden space-y-3">
            {logs.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">기록이 없습니다.</p>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-lg border border-border p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <Badge variant={ACTION_TYPE_BADGE_VARIANT[log.actionType]}>
                      {ACTION_TYPE_LABELS[log.actionType]}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatDateTime(log.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{log.actorName}</span>
                    {log.deltaSeconds > 0 ? (
                      <span className={cn(
                        "font-mono text-xs font-medium",
                        log.actionType === "ADD" ? "text-green-600 dark:text-green-400" : log.actionType === "SUBTRACT" ? "text-red-600 dark:text-red-400" : "",
                      )}>
                        {log.actionType === "ADD" ? "+" : log.actionType === "SUBTRACT" ? "-" : ""}
                        {formatSeconds(log.deltaSeconds)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground font-mono text-xs">—</span>
                    )}
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground font-mono">
                    <span>{formatSeconds(log.beforeSeconds)}</span>
                    <span>→</span>
                    <span className="text-foreground">{formatSeconds(log.afterSeconds)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
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
        <h2 className="border-l-2 border-accent pl-3 text-lg font-bold">그래프</h2>
        <GraphModeSelector mode={graphMode} onModeChange={(m) => { setGraphData(null); setGraphMode(m); }} className="mt-3" />
        <div className="mt-4 rounded-xl border border-border bg-muted p-4">
          {graphLoading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="w-6 h-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
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

      {/* 단축키 도움말 오버레이 */}
      {showHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-label="키보드 단축키"
          onClick={() => setShowHelp(false)}
          onKeyDown={(e) => { if (e.key === "Escape") setShowHelp(false); }}
        >
          <div
            className="rounded-xl border border-border bg-background p-6 shadow-lg max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
            ref={(el) => { el?.focus(); }}
            tabIndex={-1}
          >
            <h3 className="text-lg font-bold mb-4">키보드 단축키</h3>
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
            </p>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showDeleteDialog}
        title="타이머 삭제"
        description="정말로 이 타이머를 삭제하시겠습니까?"
        confirmLabel="삭제"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </section>
  );
}
