"use client";

import { useEffect, useState, useCallback } from "react";
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
import { GoalCard } from "@/components/goal/GoalCard";
import { GoalForm } from "@/components/goal/GoalForm";
import Link from "next/link";
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
          완료 ({inactiveGoals.length})
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
            완료된 목표가 없습니다.
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

  const fetchTimers = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/timers`);
      if (res.ok) {
        const json = (await res.json()) as ApiSuccessResponse<TimerListItem[]>;
        setTimers(json.data);
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

  useEffect(() => {
    const timer = timers[0];
    if (!timer || timer.status !== "SCHEDULED") return;
    const interval = setInterval(fetchTimers, 5_000);
    return () => clearInterval(interval);
  }, [timers, fetchTimers]);

  // ACTIVE 목표가 있으면 30초 간격 폴링
  useEffect(() => {
    const hasActiveGoal = goals.some((g) => g.status === "ACTIVE");
    if (!hasActiveGoal) return;
    const interval = setInterval(fetchGoals, 30_000);
    return () => clearInterval(interval);
  }, [goals, fetchGoals]);

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href);
    toast("링크가 복사되었습니다", "success");
  }

  async function handleSaveName(name: string) {
    const res = await fetch(`/api/projects/${projectId}`, {
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
    const res = await fetch(`/api/projects/${projectId}`, {
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

  if (error || !project) {
    return (
      <ErrorState
        message="프로젝트를 찾을 수 없습니다."
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
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/projects");
      } else {
        setDeleting(false);
      }
    } catch {
      setDeleting(false);
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
              <Badge variant={timers[0].status === "SCHEDULED" ? "scheduled" : timers[0].status === "RUNNING" ? "running" : "expired"}>
                {timers[0].status === "SCHEDULED" ? "예약됨" : timers[0].status === "RUNNING" ? "실행 중" : "만료"}
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
