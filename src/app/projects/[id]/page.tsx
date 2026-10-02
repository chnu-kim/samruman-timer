"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { CountdownDisplay } from "@/components/timer/CountdownDisplay";
import { CreateTimerForm } from "@/components/timer/CreateTimerForm";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EditableText } from "@/components/ui/EditableText";
import { FormDialog } from "@/components/ui/FormDialog";
import { ErrorState } from "@/components/ui/ErrorState";
import { PlusIcon, TimerIcon, TrashIcon, LinkIcon, ChartBarIcon } from "@/components/ui/Icons";
import { ProjectDetailSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { reconcilePolledTimer, type SyncedTimerSnapshot } from "@/lib/timer-sync";
import { GoalCard } from "@/components/goal/GoalCard";
import { GoalForm } from "@/components/goal/GoalForm";
import Link from "next/link";
import { authFetch } from "@/lib/auth-fetch";
import { usePolling } from "@/hooks/usePolling";
import { useCountdownEnded } from "@/hooks/useCountdownEnded";
import type {
  ApiSuccessResponse,
  ProjectDetailResponse,
  TimerListItem,
  GoalResponse,
  MeResponse,
} from "@/types";

function GoalSection({
  goals,
  projectId,
  isOwner,
  hasTimer,
  showGoalForm,
  onShowGoalForm,
  onHideGoalForm,
  onGoalUpdate,
}: {
  goals: GoalResponse[];
  projectId: string;
  isOwner: boolean;
  hasTimer: boolean;
  showGoalForm: boolean;
  onShowGoalForm: () => void;
  onHideGoalForm: () => void;
  onGoalUpdate: () => void;
}) {
  const [goalTab, setGoalTab] = useState<"active" | "completed">("active");
  const [goalFormKey, setGoalFormKey] = useState(0);

  const activeGoals = goals.filter((g) => g.status === "ACTIVE");
  const inactiveGoals = goals.filter((g) => g.status !== "ACTIVE");

  const tabClass = (active: boolean) =>
    `px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px rounded-t-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
      active
        ? "border-accent text-accent"
        : "border-transparent text-muted-foreground hover:text-foreground"
    }`;

  return (
    <section className="mt-6 space-y-4" aria-label="목표">
      {/* 헤더 — 제목 + 추가 버튼 */}
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-bold text-foreground">목표</h2>
        {isOwner && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => { setGoalFormKey((k) => k + 1); onShowGoalForm(); }}
            disabled={!hasTimer}
            title={!hasTimer ? "타이머를 먼저 생성하세요" : undefined}
          >
            <PlusIcon className="w-4 h-4 mr-1" />
            새 목표
          </Button>
        )}
      </div>

      {/* 목표 생성 모달 */}
      <FormDialog open={showGoalForm} title="새 목표 설정" onClose={onHideGoalForm}>
        <GoalForm
          key={goalFormKey}
          projectId={projectId}
          onSuccess={() => { onHideGoalForm(); onGoalUpdate(); }}
        />
      </FormDialog>

      {/* 탭 — 진행 중 / 완료 */}
      <div className="flex gap-1 border-b border-border" role="tablist" aria-label="목표 상태 필터">
        <button
          role="tab"
          id="goal-tab-active"
          aria-selected={goalTab === "active"}
          aria-controls="goal-tabpanel"
          tabIndex={goalTab === "active" ? 0 : -1}
          onClick={() => setGoalTab("active")}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              setGoalTab(goalTab === "active" ? "completed" : "active");
            }
          }}
          className={tabClass(goalTab === "active")}
        >
          진행 중 ({activeGoals.length})
        </button>
        <button
          role="tab"
          id="goal-tab-completed"
          aria-selected={goalTab === "completed"}
          aria-controls="goal-tabpanel"
          tabIndex={goalTab === "completed" ? 0 : -1}
          onClick={() => setGoalTab("completed")}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              setGoalTab(goalTab === "active" ? "completed" : "active");
            }
          }}
          className={tabClass(goalTab === "completed")}
        >
          종료 ({inactiveGoals.length})
        </button>
      </div>

      {/* 탭 콘텐츠 */}
      <div
        className="flex flex-col gap-3"
        role="tabpanel"
        id="goal-tabpanel"
        aria-labelledby={goalTab === "active" ? "goal-tab-active" : "goal-tab-completed"}
        tabIndex={0}
      >
        {goalTab === "active" ? (
          activeGoals.length > 0 ? (
            activeGoals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                projectId={projectId}
                isOwner={isOwner}
                onUpdate={onGoalUpdate}
              />
            ))
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                {!hasTimer
                  ? "타이머를 먼저 생성하면 목표를 설정할 수 있습니다."
                  : "진행 중인 목표가 없습니다."}
              </p>
              {hasTimer && isOwner && (
                <p className="mt-1 text-xs text-muted-foreground">
                  &ldquo;새 목표&rdquo; 버튼을 눌러 목표를 추가해 보세요.
                </p>
              )}
            </div>
          )
        ) : inactiveGoals.length > 0 ? (
          inactiveGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              projectId={projectId}
              isOwner={isOwner}
              onUpdate={onGoalUpdate}
              compact
            />
          ))
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            종료된 목표가 없습니다.
          </p>
        )}
      </div>
    </section>
  );
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const projectId = params.id;

  const [project, setProject] = useState<ProjectDetailResponse | null>(null);
  const [timers, setTimers] = useState<TimerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // 404는 다시 시도해도 같으므로 일시적 오류와 구분한다
  const [notFound, setNotFound] = useState(false);
  const [user, setUser] = useState<MeResponse | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [goals, setGoals] = useState<GoalResponse[]>([]);
  const [showGoalForm, setShowGoalForm] = useState(false);

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (res.ok) {
        const json = (await res.json()) as ApiSuccessResponse<ProjectDetailResponse>;
        setProject(json.data);
      } else if (res.status === 404) {
        setNotFound(true);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    }
  }, [projectId]);

  const fetchGoals = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/goals`);
      if (res.ok) {
        const json = (await res.json()) as ApiSuccessResponse<GoalResponse[]>;
        setGoals(json.data);
      }
    } catch {
      // ignore
    }
  }, [projectId]);

  // 타이머별로 화면에 반영한 값과 그 시각. 폴링마다 카운트다운이 다시 시작되지 않도록 비교 기준으로 쓴다
  const syncedRef = useRef(new Map<string, SyncedTimerSnapshot>());

  const fetchTimers = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/timers`);
      if (res.ok) {
        const json = (await res.json()) as ApiSuccessResponse<TimerListItem[]>;
        const now = Date.now();
        const nextSynced = new Map<string, SyncedTimerSnapshot>();
        const items = json.data.map((server) => {
          const { item, snapshot } = reconcilePolledTimer(syncedRef.current.get(server.id), server, now);
          nextSynced.set(server.id, snapshot);
          return item;
        });
        syncedRef.current = nextSynced;
        setTimers(items);
      }
    } catch {
      // ignore
    }
  }, [projectId]);

  useEffect(() => {
    async function load() {
      await fetchProject();
      setLoading(false);
    }
    load();
    fetchTimers();
    fetchGoals();
    fetch("/api/auth/me")
      .then(async (res) => {
        if (res.ok) {
          const json = (await res.json()) as { data: MeResponse };
          setUser(json.data);
        }
      })
      .catch(() => {});
  }, [projectId, fetchProject, fetchTimers, fetchGoals]);

  // 예약·실행 중이면 5초마다 서버 값으로 맞춘다(다른 곳에서 추가한 시간, 만료 반영). 화면이 숨겨지면 멈춘다
  const firstTimerStatus = timers[0]?.status;
  usePolling({
    fn: fetchTimers,
    interval: 5_000,
    enabled: firstTimerStatus === "SCHEDULED" || firstTimerStatus === "RUNNING",
  });

  // 카운트다운이 0에 닿으면 다음 폴링을 기다리지 않고 배지를 '만료'로 보여 준다
  const countdownEnded = useCountdownEnded(timers[0]?.remainingSeconds, firstTimerStatus);
  const displayStatus = countdownEnded ? "EXPIRED" : firstTimerStatus;

  // ACTIVE 목표가 있으면 30초 간격 폴링
  useEffect(() => {
    const hasActiveGoal = goals.some((g) => g.status === "ACTIVE");
    if (!hasActiveGoal) return;
    const interval = setInterval(fetchGoals, 30_000);
    return () => clearInterval(interval);
  }, [goals, fetchGoals]);

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast("링크가 복사되었습니다", "success");
    } catch {
      toast("링크를 복사하지 못했습니다", "error");
    }
  }

  async function handleSaveName(name: string) {
    const res = await authFetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error();
    const json = (await res.json()) as ApiSuccessResponse<ProjectDetailResponse>;
    setProject(json.data);
    toast("프로젝트 이름이 수정되었습니다", "success");
  }

  async function handleSaveDescription(description: string) {
    const res = await authFetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });
    if (!res.ok) throw new Error();
    const json = (await res.json()) as ApiSuccessResponse<ProjectDetailResponse>;
    setProject(json.data);
    toast("프로젝트 설명이 수정되었습니다", "success");
  }

  if (loading) {
    return <ProjectDetailSkeleton />;
  }

  if (notFound) {
    return <ErrorState message="프로젝트를 찾을 수 없습니다. 삭제되었거나 주소가 잘못되었습니다." />;
  }

  if (error || !project) {
    return (
      <ErrorState
        message="프로젝트를 불러오지 못했습니다."
        onRetry={async () => { setError(false); setLoading(true); await fetchProject(); setLoading(false); }}
      />
    );
  }

  const isOwner = user?.id === project.owner.id;
  const iconBtnBase =
    "rounded-lg p-1.5 min-h-11 min-w-11 flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  function handleCreateSuccess() {
    setShowForm(false);
    fetchTimers();
  }

  async function handleDelete() {
    setShowDeleteDialog(false);
    setDeleting(true);
    try {
      const res = await authFetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/projects");
      } else {
        setDeleting(false);
        toast("프로젝트 삭제에 실패했습니다", "error");
      }
    } catch {
      setDeleting(false);
      toast("프로젝트 삭제에 실패했습니다", "error");
    }
  }

  return (
    <section>
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <EditableText
              value={project.name}
              onSave={handleSaveName}
              editable={isOwner}
              as="h1"
              className="text-2xl font-bold"
            />
            {(project.description || isOwner) && (
              <EditableText
                value={project.description || ""}
                onSave={handleSaveDescription}
                editable={isOwner}
                as="p"
                className="mt-1 text-muted-foreground"
                placeholder="설명 추가..."
              />
            )}
            <p className="mt-1 text-sm text-muted-foreground">
              {project.owner.nickname}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0 mt-1">
            {isOwner && timers.length > 0 && (
              <Link
                href={`/timers/${timers[0].id}/stats`}
                aria-label="통계"
                title="통계"
                className={`${iconBtnBase} text-muted-foreground hover:text-foreground hover:bg-foreground/10`}
              >
                <ChartBarIcon className="w-5 h-5" />
              </Link>
            )}
            <button
              onClick={handleCopyLink}
              aria-label="링크 복사"
              title="링크 복사"
              className={`${iconBtnBase} text-muted-foreground hover:text-foreground hover:bg-foreground/10`}
            >
              <LinkIcon className="w-5 h-5" />
            </button>
            {isOwner && (
              <button
                disabled={deleting}
                aria-label="프로젝트 삭제"
                title="프로젝트 삭제"
                onClick={() => setShowDeleteDialog(true)}
                className={
                  deleting
                    ? `${iconBtnBase} opacity-50 cursor-not-allowed`
                    : `${iconBtnBase} text-muted-foreground hover:text-red-500 hover:bg-red-500/10`
                }
              >
                <TrashIcon className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 타이머 섹션 (핵심 기능 — 항상 상단) */}
      <div className="mt-4">
        {timers.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <TimerIcon className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="mt-4 text-muted-foreground">아직 타이머가 없습니다.</p>
            {isOwner && (
              <Button
                size="sm"
                className="mt-4"
                onClick={() => { setFormKey((k) => k + 1); setShowForm(true); }}
              >
                <PlusIcon className="w-4 h-4 mr-1" />
                타이머 만들기
              </Button>
            )}
          </div>
        ) : (
          <Link
            href={`/timers/${timers[0].id}`}
            className="block rounded-xl border border-accent/30 bg-accent-light/10 p-5 transition-colors hover:bg-accent-light/20"
          >
            <div className="flex items-center justify-between gap-4">
              <CountdownDisplay
                remainingSeconds={timers[0].remainingSeconds}
                status={timers[0].status}
                scheduledStartAt={timers[0].scheduledStartAt}
                createdAt={timers[0].createdAt}
                size="large"
              />
              <Badge variant={displayStatus === "SCHEDULED" ? "scheduled" : displayStatus === "RUNNING" ? "running" : "expired"}>
                {displayStatus === "SCHEDULED" ? "예약됨" : displayStatus === "RUNNING" ? "실행 중" : "만료"}
              </Badge>
            </div>
            {timers[0].title && (
              <p className="mt-2 text-sm text-muted-foreground">{timers[0].title}</p>
            )}
          </Link>
        )}
      </div>

      <FormDialog open={showForm} title="새 타이머 만들기" onClose={() => setShowForm(false)}>
        <CreateTimerForm
          key={formKey}
          projectId={projectId}
          onSuccess={handleCreateSuccess}
          onCancel={() => setShowForm(false)}
        />
      </FormDialog>

      {/* 목표 섹션 */}
      <GoalSection
        goals={goals}
        projectId={projectId}
        isOwner={isOwner}
        hasTimer={timers.length > 0}
        showGoalForm={showGoalForm}
        onShowGoalForm={() => setShowGoalForm(true)}
        onHideGoalForm={() => setShowGoalForm(false)}
        onGoalUpdate={fetchGoals}
      />

      <ConfirmDialog
        open={showDeleteDialog}
        title="프로젝트 삭제"
        description="정말로 이 프로젝트를 삭제하시겠습니까? 하위 타이머도 함께 삭제됩니다."
        confirmLabel="삭제"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </section>
  );
}
