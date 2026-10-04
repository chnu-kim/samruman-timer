"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CreateTimerForm } from "@/components/timer/CreateTimerForm";
import { TimerConsole } from "@/components/timer/TimerConsole";
import { OverlaySettings } from "@/components/timer/OverlaySettings";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EditableText } from "@/components/ui/EditableText";
import { FormDialog } from "@/components/ui/FormDialog";
import { ErrorState } from "@/components/ui/ErrorState";
import { MoreMenu } from "@/components/ui/MoreMenu";
import { PlusIcon, TimerIcon, LinkIcon, ChartBarIcon, SettingsIcon } from "@/components/ui/Icons";
import { ProjectDetailSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { GoalCard } from "@/components/goal/GoalCard";
import { GoalForm } from "@/components/goal/GoalForm";
import { authFetch } from "@/lib/auth-fetch";
import { cn } from "@/lib/utils";
import { useDocumentTitle, APP_TITLE } from "@/hooks/useDocumentTitle";
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
  className,
}: {
  goals: GoalResponse[];
  projectId: string;
  isOwner: boolean;
  hasTimer: boolean;
  showGoalForm: boolean;
  onShowGoalForm: () => void;
  onHideGoalForm: () => void;
  onGoalUpdate: () => void;
  className?: string;
}) {
  const [goalTab, setGoalTab] = useState<"active" | "completed">("active");
  const [goalFormKey, setGoalFormKey] = useState(0);

  const activeGoals = goals.filter((g) => g.status === "ACTIVE");
  const inactiveGoals = goals.filter((g) => g.status !== "ACTIVE");

  const tabClass = (active: boolean) =>
    `px-4 py-2 pointer-coarse:min-h-11 text-sm font-medium transition-colors border-b-2 -mb-px rounded-t-lg ${
      active
        ? "border-accent text-accent"
        : "border-transparent text-muted-foreground hover:text-foreground"
    }`;

  // WAI-ARIA Tabs 패턴: 화살표 키로 선택을 옮길 때 포커스도 새 탭으로 옮긴다(프로젝트 목록 탭과 같다)
  function handleGoalTabKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = goalTab === "active" ? "completed" : "active";
    setGoalTab(next);
    document.getElementById(`goal-tab-${next}`)?.focus();
  }

  return (
    <section className={cn("space-y-4", className)} aria-label="목표">
      {/* 헤더 — 제목 + 추가 버튼 */}
      <div className="flex items-center justify-between gap-4">
        <h2 className="border-l-2 border-accent pl-3 text-lg font-bold">목표</h2>
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

      {/* 탭 — 진행 중 / 종료 */}
      <div className="flex gap-1 border-b border-border" role="tablist" aria-label="목표 상태 필터">
        <button
          role="tab"
          id="goal-tab-active"
          aria-selected={goalTab === "active"}
          aria-controls="goal-tabpanel"
          tabIndex={goalTab === "active" ? 0 : -1}
          onClick={() => setGoalTab("active")}
          onKeyDown={handleGoalTabKeyDown}
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
          onKeyDown={handleGoalTabKeyDown}
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

// 프로젝트와 타이머는 1:1이라 이 화면 하나가 방송 중 조작 콘솔이다.
// 프로젝트 정보·목표는 여기서, 카운트다운·시간 조작·기록·그래프는 TimerConsole이 맡는다.
// (/timers/[id]는 이 화면으로 보내고, OBS 오버레이와 통계만 타이머 주소에 남는다)
export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const projectId = params.id;

  const [project, setProject] = useState<ProjectDetailResponse | null>(null);
  const [timers, setTimers] = useState<TimerListItem[]>([]);
  const [timersLoaded, setTimersLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // 404는 다시 시도해도 같으므로 일시적 오류와 구분한다
  const [notFound, setNotFound] = useState(false);
  const [user, setUser] = useState<MeResponse | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showTimerDeleteDialog, setShowTimerDeleteDialog] = useState(false);
  const [showOverlaySettings, setShowOverlaySettings] = useState(false);
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

  // 타이머가 있는지와 그 ID만 쓴다. 남은 시간과 상태의 폴링은 TimerConsole이 한 곳에서 한다
  const fetchTimers = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/timers`);
      if (res.ok) {
        const json = (await res.json()) as ApiSuccessResponse<TimerListItem[]>;
        setTimers(json.data);
      }
    } catch {
      // ignore
    } finally {
      setTimersLoaded(true);
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

  // ACTIVE 목표가 있으면 30초 간격으로도 맞춘다. 시간이 바뀐 직후의 갱신은 TimerConsole의 onTimeChanged가 한다
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

  useDocumentTitle(project ? `${project.name} · ${APP_TITLE}` : null);

  if (loading) {
    return <ProjectDetailSkeleton />;
  }

  if (notFound) {
    return (
      <ErrorState
        tone="neutral"
        title="프로젝트를 찾을 수 없습니다"
        message="삭제되었거나 주소가 잘못되었습니다."
        action={{ href: "/projects", label: "프로젝트 목록으로" }}
      />
    );
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
  const timer = timers[0] ?? null;
  const headerButton =
    "inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5";

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

  // 다른 탭·기기에서 타이머를 지우면 콘솔 폴링이 404를 받는다. 지워진 타이머를 계속 조작하게 두지 않는다
  function handleTimerRemoved() {
    setTimers([]);
    toast("타이머가 다른 곳에서 삭제되었습니다", "info");
    fetchTimers();
    fetchGoals();
  }

  // 타이머만 지우면 이 화면에 남아 '타이머 없음' 상태와 남은 목표 기록을 보여 준다
  async function handleDeleteTimer() {
    if (!timer) return;
    setShowTimerDeleteDialog(false);
    setDeleting(true);
    try {
      const res = await authFetch(`/api/timers/${timer.id}`, { method: "DELETE" });
      if (res.ok) {
        setTimers([]);
        toast("타이머가 삭제되었습니다", "success");
        fetchTimers();
        fetchGoals();
      } else {
        toast("타이머 삭제에 실패했습니다", "error");
      }
    } catch {
      toast("타이머 삭제에 실패했습니다", "error");
    } finally {
      setDeleting(false);
    }
  }

  const goalSection = (className?: string) => (
    <GoalSection
      goals={goals}
      projectId={projectId}
      isOwner={isOwner}
      hasTimer={!!timer}
      showGoalForm={showGoalForm}
      onShowGoalForm={() => setShowGoalForm(true)}
      onHideGoalForm={() => setShowGoalForm(false)}
      onGoalUpdate={fetchGoals}
      className={className}
    />
  );

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
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
              placeholder="설명 추가…"
            />
          )}
          {!isOwner && (
            <p className="mt-1 text-sm text-muted-foreground">
              {project.owner.nickname}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isOwner && timer && (
            <>
              <button type="button" onClick={() => setShowOverlaySettings(true)} className={headerButton}>
                <SettingsIcon className="w-4 h-4" />
                OBS 오버레이
              </button>
              <Link href={`/timers/${timer.id}/stats`} className={headerButton}>
                <ChartBarIcon className="w-4 h-4" />
                통계
              </Link>
            </>
          )}
          {isOwner ? (
            <MoreMenu
              label="더보기"
              items={[
                { label: "링크 복사", onSelect: handleCopyLink },
                ...(timer ? [{ label: "타이머 삭제", onSelect: () => setShowTimerDeleteDialog(true), danger: true, disabled: deleting }] : []),
                { label: "프로젝트 삭제", onSelect: () => setShowDeleteDialog(true), danger: true, disabled: deleting },
              ]}
            />
          ) : (
            <button
              onClick={handleCopyLink}
              aria-label="링크 복사"
              title="링크 복사"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
            >
              <LinkIcon className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-6">
        {!timersLoaded ? (
          <div className="h-40" aria-busy="true" />
        ) : timer ? (
          <TimerConsole
            key={timer.id}
            timerId={timer.id}
            isOwner={isOwner}
            onTimeChanged={fetchGoals}
            onTimerRemoved={handleTimerRemoved}
            aside={
              // 시청자에게 빈 목표 영역은 의미가 없으므로 목표가 있을 때만 보여 준다
              isOwner || goals.length > 0
                ? goalSection("rounded-xl border border-border p-5")
                : undefined
            }
          />
        ) : (
          <>
            <div className="py-16 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <TimerIcon className="w-8 h-8 text-muted-foreground" />
              </div>
              {/* 만들 수 있는 소유자에게는 만들면 생기는 것을, 시청자에게는 지금 상태만 한 문장으로 */}
              <p className="mt-4 text-muted-foreground">
                {isOwner
                  ? "타이머를 만들면 방송 화면에 띄울 카운트다운과 OBS 주소가 생깁니다."
                  : "아직 타이머가 없습니다."}
              </p>
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
            {/* 타이머를 삭제한 뒤에도 남은 목표 기록은 볼 수 있게 목표가 있으면 보여 준다 */}
            {goals.length > 0 && goalSection("mt-6")}
          </>
        )}
      </div>

      <FormDialog open={showForm} title="새 타이머 만들기" onClose={() => setShowForm(false)}>
        <CreateTimerForm
          key={formKey}
          projectId={projectId}
          defaultTitle={project.name}
          onSuccess={handleCreateSuccess}
          onCancel={() => setShowForm(false)}
        />
      </FormDialog>

      {showOverlaySettings && timer && (
        <OverlaySettings
          timerId={timer.id}
          onClose={() => setShowOverlaySettings(false)}
        />
      )}

      <ConfirmDialog
        open={showTimerDeleteDialog}
        title="타이머 삭제"
        description="삭제하면 방송 화면의 오버레이가 사라지며 되돌릴 수 없습니다. 목표 기록은 남습니다."
        confirmLabel="타이머 삭제"
        variant="danger"
        onConfirm={handleDeleteTimer}
        onCancel={() => setShowTimerDeleteDialog(false)}
      />

      <ConfirmDialog
        open={showDeleteDialog}
        title="프로젝트 삭제"
        description="타이머·목표·변경 기록이 함께 지워지고 되돌릴 수 없습니다."
        confirmLabel="프로젝트 삭제"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </section>
  );
}
