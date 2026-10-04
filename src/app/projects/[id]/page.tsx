"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CreateTimerForm } from "@/components/timer/CreateTimerForm";
import { TimerConsole, loadConsoleSnapshot, type ConsoleSnapshot } from "@/components/timer/TimerConsole";
import { OverlaySettings } from "@/components/timer/OverlaySettings";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EditableText } from "@/components/ui/EditableText";
import { FormDialog } from "@/components/ui/FormDialog";
import { ErrorState } from "@/components/ui/ErrorState";
import { MoreMenu } from "@/components/ui/MoreMenu";
import { PlusIcon, TimerIcon, LinkIcon, ChartBarIcon, SettingsIcon } from "@/components/ui/Icons";
import { ProjectDetailSkeleton } from "@/components/ui/Skeleton";
import { FILL_FIRST_SCREEN } from "@/components/layout/page-height";
import { useToast } from "@/components/ui/Toast";
import { GoalCard } from "@/components/goal/GoalCard";
import { GoalForm } from "@/components/goal/GoalForm";
import { authFetch, isSessionExpired } from "@/lib/auth-fetch";
import { fetchMe } from "@/lib/session-me";
import { consumeNewTimerFlag } from "@/lib/project-flow";
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
  error,
  onRetry,
  projectId,
  isOwner,
  hasTimer,
  showGoalForm,
  onShowGoalForm,
  onHideGoalForm,
  onGoalUpdate,
  className,
}: {
  /** null은 아직 받지 못한 상태. 빈 배열(받았는데 0건)과 구분한다 */
  goals: GoalResponse[] | null;
  /** 목록을 받지 못했다. 빈 상태 문구 대신 오류 한 줄을 보인다 */
  error: boolean;
  onRetry: () => void;
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

  const activeGoals = (goals ?? []).filter((g) => g.status === "ACTIVE");
  const inactiveGoals = (goals ?? []).filter((g) => g.status !== "ACTIVE");
  // 개수는 받은 결과가 있을 때만. 실패·로딩 중 '(0)'은 목표가 없다는 거짓말이 된다
  const showCounts = goals !== null && !error;

  const tabClass = (active: boolean) =>
    `h-10 px-4 pointer-coarse:min-h-11 text-sm font-medium transition-colors border-b-2 -mb-px rounded-t-lg ${
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

  // 받은 결과가 0건일 때만 비운다. 로딩·오류 중에 탭을 숨겼다가 다시 보이면 레이아웃이 밀리기 때문이다
  const noGoals = goals !== null && !error && goals.length === 0;
  // 마지막 목표를 지우면 탭이 사라지므로 선택도 처음으로 되돌린다(다음 목표를 만들면 '종료' 탭이 열려 있지 않게). 렌더 중 상태 조정 패턴
  if (noGoals && goalTab !== "active") setGoalTab("active");

  const newGoalButton = isOwner && (
    <Button
      variant="primary"
      size="md"
      onClick={() => { setGoalFormKey((k) => k + 1); onShowGoalForm(); }}
      disabled={!hasTimer}
      title={!hasTimer ? "타이머를 먼저 생성하세요" : undefined}
    >
      <PlusIcon className="w-4 h-4 mr-1" />
      새 목표
    </Button>
  );

  return (
    <section className={cn("space-y-3", className)} aria-label="목표">
      {/* 헤더 — 제목 + 추가 버튼. 버튼(데스크톱 40px·터치 44px)이 줄을 키우지 않게 음수 여백으로 제목 높이(24px)에 맞춘다.
          시간 카드·기록·그래프의 제목 줄과 같은 높이라 제목→내용 간격이 12px로 같다 */}
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold">목표</h2>
        {newGoalButton && <div className="-my-2 pointer-coarse:-my-2.5">{newGoalButton}</div>}
      </div>

      {/* 목표 생성 모달 */}
      <FormDialog open={showGoalForm} title="새 목표 설정" onClose={onHideGoalForm}>
        <GoalForm
          key={goalFormKey}
          projectId={projectId}
          onSuccess={() => { onHideGoalForm(); onGoalUpdate(); }}
        />
      </FormDialog>

      {noGoals ? (
        // 목표가 하나도 없으면 탭·안내문 없이 한 줄만 둔다
        <p className="text-sm text-muted-foreground">
          {hasTimer ? "아직 목표가 없습니다." : "타이머를 먼저 생성하면 목표를 설정할 수 있습니다."}
        </p>
      ) : (
      // 탭과 목록은 한 덩어리다: 밑줄→첫 목표 간격이 목표 사이 간격(카드 안쪽 위 여백 16px)과 같다
      <div>
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
          진행 중{showCounts && ` (${activeGoals.length})`}
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
          종료{showCounts && ` (${inactiveGoals.length})`}
        </button>
      </div>

      {/* 탭 콘텐츠 */}
      <div
        className="flex flex-col"
        role="tabpanel"
        id="goal-tabpanel"
        aria-labelledby={goalTab === "active" ? "goal-tab-active" : "goal-tab-completed"}
        tabIndex={0}
      >
        {error ? (
          <ErrorState compact message="목표를 불러오지 못했습니다." onRetry={onRetry} />
        ) : goals === null ? (
          <div className="h-21" />
        ) : goalTab === "active" ? (
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
            // 이 자리는 종료된 목표만 있을 때다(목표가 0건이면 탭 자체가 없다). 새 목표 버튼이 바로 위에 보이므로 안내는 한 줄
            <p className="py-8 text-center text-sm text-muted-foreground">
              {!hasTimer
                ? "타이머를 먼저 생성하면 목표를 설정할 수 있습니다."
                : "진행 중인 목표가 없습니다."}
            </p>
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
      </div>
      )}
    </section>
  );
}

// 프로젝트와 타이머는 1:1이라 이 화면 하나가 방송 중 조작 콘솔이다.
// 프로젝트 정보·목표는 여기서, 카운트다운·시간·기록·그래프는 TimerConsole이 맡는다.
// (/timers/[id]는 이 화면으로 보내고, OBS 오버레이와 통계만 타이머 주소에 남는다)
export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const projectId = params.id;

  const [project, setProject] = useState<ProjectDetailResponse | null>(null);
  const [timers, setTimers] = useState<TimerListItem[]>([]);
  const [timersLoaded, setTimersLoaded] = useState(false);
  // 콘솔의 첫 화면을 골격 다음 한 번에 그리려고 타이머 상세·최근 기록·그래프의 첫 조회도 목록과 이어서 여기서 한다(이후 폴링·갱신은 TimerConsole)
  const [consoleSnapshot, setConsoleSnapshot] = useState<ConsoleSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // 404는 다시 시도해도 같으므로 일시적 오류와 구분한다
  const [notFound, setNotFound] = useState(false);
  const [user, setUser] = useState<MeResponse | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showTimerDeleteDialog, setShowTimerDeleteDialog] = useState(false);
  const [showOverlaySettings, setShowOverlaySettings] = useState(false);
  const [goals, setGoals] = useState<GoalResponse[] | null>(null);
  const [goalsError, setGoalsError] = useState(false);
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

  // silent: 30초 주기·시간 변경·연결 복구 때의 백그라운드 갱신. 실패해도 보이던 목록(또는 오류 줄)을 그대로 둔다.
  // 직접 부른 조회(첫 로드·다시 시도·목표 변경 뒤)가 실패하면 오류 줄을 띄운다. 비-ok 응답과 예외는 같은 실패다.
  // 세션 만료는 그 안내가 맡는다(이 GET은 공개라 보통 오지 않는다)
  const fetchGoals = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    try {
      const res = await authFetch(`/api/projects/${projectId}/goals`);
      if (res.ok) {
        const json = (await res.json()) as ApiSuccessResponse<GoalResponse[]>;
        setGoals(json.data);
        setGoalsError(false);
      } else if (!silent && !isSessionExpired(res)) {
        setGoalsError(true);
      }
    } catch {
      if (!silent) setGoalsError(true);
    }
  }, [projectId]);
  const refreshGoalsSilently = useCallback(() => fetchGoals({ silent: true }), [fetchGoals]);

  // 타이머가 있는지와 그 ID, 그리고 콘솔이 처음 그릴 데이터 한 번. 남은 시간과 상태의 폴링은 TimerConsole이 한 곳에서 한다
  const fetchTimers = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/timers`);
      if (res.ok) {
        const json = (await res.json()) as ApiSuccessResponse<TimerListItem[]>;
        let list = json.data;
        let snapshot: ConsoleSnapshot | null = null;
        if (list[0]) {
          const loaded = await loadConsoleSnapshot(list[0].id);
          // 목록을 받은 직후 다른 곳에서 삭제됐다. 보지도 못한 타이머라 알림 없이 '타이머 없음'으로 그린다
          if (loaded === "removed") list = [];
          else snapshot = loaded;
        }
        setConsoleSnapshot(snapshot);
        setTimers(list);
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
    // 헤더도 같은 첫 로드에 세션을 확인하므로 fetchMe로 한 요청을 같이 쓴다. 비로그인·오류면 null이라 실패하지 않는다
    fetchMe()
      .then((me) => {
        if (me) setUser(me);
      })
      .finally(() => setAuthChecked(true));
  }, [projectId, fetchProject, fetchTimers, fetchGoals]);

  // ACTIVE 목표가 있거나 목록을 받지 못했으면 30초 간격으로도 맞춘다(오류 줄이 저절로 풀린다).
  // 시간이 바뀐 직후·연결이 돌아온 직후의 갱신은 TimerConsole의 onTimeChanged가 한다
  const hasActiveGoal = !!goals?.some((g) => g.status === "ACTIVE");
  useEffect(() => {
    if (!hasActiveGoal && !goalsError) return;
    const interval = setInterval(refreshGoalsSilently, 30_000);
    return () => clearInterval(interval);
  }, [hasActiveGoal, goalsError, refreshGoalsSilently]);

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

  // 목록에서 프로젝트를 막 만들고 넘어왔으면 타이머 만들기 창을 바로 연다(만들기 두 단계를 한 흐름으로).
  // 소유자이고 타이머가 아직 없을 때만, 한 번만 연다. 조건을 판정할 수 있게 되면(프로젝트·타이머·로그인 확인 끝)
  // 열든 안 열든 플래그는 지운다. 남겨 두면 '링크 복사'가 플래그 붙은 주소를 시청자에게 건넨다
  const autoOpenedRef = useRef(false);
  const ownsProject = !!project && !!user && user.id === project.owner.id;
  const hasTimer = timers.length > 0;
  const flowReady = !!project && timersLoaded && authChecked;
  useEffect(() => {
    if (autoOpenedRef.current || !flowReady) return;
    autoOpenedRef.current = true;
    if (consumeNewTimerFlag() && ownsProject && !hasTimer) {
      setFormKey((k) => k + 1);
      setShowForm(true);
    }
  }, [flowReady, ownsProject, hasTimer]);

  // 화면 모양을 정하는 것(프로젝트, 소유자인지, 타이머와 콘솔 첫 데이터, 목표가 있는지)을 모두 받은 뒤 한 번에 그린다.
  // 요청은 함께 떠나므로 기다림은 가장 늦은 하나만큼이고, 골격 → 본문 사이에 헤더 버튼·목표 영역이 뒤늦게 끼어들어 아래를 밀지 않는다
  if (loading || !timersLoaded || !authChecked || (goals === null && !goalsError)) {
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
        // 세션 만료는 그 안내가 따로 뜬다
        if (!isSessionExpired(res)) toast("프로젝트 삭제에 실패했습니다", "error");
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

  // 타이머 초기화 = 타이머만 지우기. 이 화면에 남아 '타이머 없음' 상태와 남은 목표 기록을 보여 준다
  async function handleDeleteTimer() {
    if (!timer) return;
    setShowTimerDeleteDialog(false);
    setDeleting(true);
    try {
      const res = await authFetch(`/api/timers/${timer.id}`, { method: "DELETE" });
      if (res.ok) {
        setTimers([]);
        toast("타이머를 초기화했습니다", "success");
        fetchTimers();
        fetchGoals();
      } else if (!isSessionExpired(res)) {
        toast("타이머를 초기화하지 못했습니다", "error");
      }
    } catch {
      toast("타이머를 초기화하지 못했습니다", "error");
    } finally {
      setDeleting(false);
    }
  }

  const goalSection = (className?: string) => (
    <GoalSection
      goals={goals}
      error={goalsError}
      onRetry={() => fetchGoals()}
      projectId={projectId}
      isOwner={isOwner}
      hasTimer={!!timer}
      showGoalForm={showGoalForm}
      onShowGoalForm={() => setShowGoalForm(true)}
      onHideGoalForm={() => setShowGoalForm(false)}
      onGoalUpdate={() => fetchGoals()}
      className={className}
    />
  );

  return (
    <section className={FILL_FIRST_SCREEN}>
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
                ...(timer ? [{ label: "타이머 초기화(목표 유지)", onSelect: () => setShowTimerDeleteDialog(true), danger: true, disabled: deleting }] : []),
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
        {timer ? (
          <TimerConsole
            key={timer.id}
            timerId={timer.id}
            initialSnapshot={consoleSnapshot?.timer.id === timer.id ? consoleSnapshot : null}
            isOwner={isOwner}
            onTimeChanged={refreshGoalsSilently}
            onTimerRemoved={handleTimerRemoved}
            aside={
              // 시청자에게 빈 목표 영역은 의미가 없으므로 목표가 있을 때만 보여 준다.
              // 받지 못했으면 있는지 모르므로 오류 줄을 보인다(실패를 '목표 없음'으로 가리지 않는다)
              isOwner || goalsError || (goals?.length ?? 0) > 0
                ? goalSection(isOwner ? "lg:pt-[1.3125rem]" : undefined) // 왼쪽 시간 카드의 테두리 1px + 안쪽 여백 20px에 제목 줄을 맞춘다
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
                  className="mt-4"
                  onClick={() => { setFormKey((k) => k + 1); setShowForm(true); }}
                >
                  <PlusIcon className="w-4 h-4 mr-1" />
                  타이머 만들기
                </Button>
              )}
            </div>
            {/* 타이머를 삭제한 뒤에도 남은 목표 기록은 볼 수 있게 목표가 있으면 보여 준다 */}
            {(goalsError || (goals?.length ?? 0) > 0) && goalSection("mt-6")}
          </>
        )}
      </div>

      <FormDialog open={showForm} title="새 타이머 만들기" onClose={() => setShowForm(false)}>
        <CreateTimerForm
          key={formKey}
          projectId={projectId}
          defaultTitle={project.name}
          onSuccess={handleCreateSuccess}
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
        title="타이머 초기화"
        // 목표 진행률은 지금 타이머의 기록으로 계산한다(src/lib/goal.ts). 목표 행은 남아도 진행 중인 목표는 0부터 다시 쌓이므로 그 사실을 알린다
        description={`지금 타이머와 기록이 지워지고 방송 화면의 오버레이가 사라집니다. 되돌릴 수 없으며 목표 기록은 남습니다.${
          hasActiveGoal ? " 진행 중인 목표의 진행률은 새 타이머 기준으로 처음부터 다시 쌓입니다." : ""
        } 새 타이머는 오버레이 주소가 달라서 OBS 브라우저 소스에 새 주소를 다시 넣어야 합니다.`}
        confirmLabel="타이머 초기화"
        variant="danger"
        onConfirm={handleDeleteTimer}
        onCancel={() => setShowTimerDeleteDialog(false)}
      />

      <ConfirmDialog
        open={showDeleteDialog}
        title="프로젝트 삭제"
        description="타이머·목표·기록이 함께 지워지고 되돌릴 수 없습니다."
        confirmLabel="프로젝트 삭제"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </section>
  );
}
