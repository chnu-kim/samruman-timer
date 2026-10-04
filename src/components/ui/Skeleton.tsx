import { cn } from "@/lib/utils";
import { FILL_FIRST_SCREEN } from "@/components/layout/page-height";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse bg-foreground/10 rounded-control", className)}
      aria-hidden="true"
    />
  );
}

// ProjectCard와 같은 높이(모바일 118px·sm 이상 138px): 안쪽 여백 20px, 제목 줄 24px + 설명 줄(sm 이상은 설명 2줄 높이를 잡아 둔다), 메타 줄 16px
export function ProjectCardSkeleton() {
  return (
    <div className="flex flex-col rounded-xl border border-border p-5">
      <div className="flex-1 sm:min-h-[4.25rem]">
        <div className="flex h-6 items-center">
          <Skeleton className="h-5 w-3/4" />
        </div>
        <div className="mt-1 flex h-5 items-center">
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
      <div className="mt-3 flex h-4 items-center gap-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

export function TimerCardSkeleton() {
  return (
    <div className="rounded-xl border border-border p-5 space-y-3">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-7 w-32 mt-1" />
      <div className="flex items-center justify-between pt-1">
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
    </div>
  );
}

export function ProjectCardGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <ProjectCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function TimerCardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <TimerCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** 제목 줄(24px, text-base 섹션 제목) 골격. 막대를 줄 안 가운데에 두어 margin 붕괴 없이 실제 제목 줄 높이와 같다 */
function HeadingSkeleton({ className }: { className?: string }) {
  return (
    <div className="flex h-6 items-center">
      <Skeleton className={cn("h-4", className)} />
    </div>
  );
}

/**
 * 콘솔 골격의 모양. owner·viewer는 소유자인지 아는 경우(콘솔이 직접 다시 부를 때),
 * auto는 로그인 확인 전(프로젝트 화면 첫 로드)이라 로그인 힌트(html[data-auth], src/lib/auth-hint.ts)로 CSS가 고른다.
 * 로그아웃 방문자는 소유자일 수 없으므로 시청자 모양, 그 밖에는 콘솔을 가장 많이 여는 소유자 모양이다
 */
type ConsoleShape = "owner" | "viewer" | "auto";

/** shape에 따라 소유자 전용·시청자 전용 요소를 가르는 클래스. auto면 CSS 변형으로, 아니면 렌더 여부로 가른다 */
function shapeClasses(shape: ConsoleShape) {
  return {
    ownerOnly: shape === "auto" ? "signed-out:hidden" : "",
    viewerOnly: shape === "auto" ? "hidden signed-out:flex" : "",
    showOwner: shape !== "viewer",
    showViewer: shape !== "owner",
  };
}

/**
 * 프로젝트 콘솔(`projects/[id]/page`·`TimerConsole`)의 첫 화면 골격. 높이·열·줄바꿈을 실제 화면과 같게 둔다:
 * 헤더 줄(제목·설명 | 액션 버튼 셋, 시청자는 소유자 닉네임 줄 | 링크 복사), 카운트다운, 시간 카드 | 목표, 최근 기록 | 잔여 시간 추이.
 * 로그인 확인 전이라 모양은 로그인 힌트로 고른다(ConsoleShape auto)
 */
export function ProjectDetailSkeleton() {
  const { ownerOnly, viewerOnly } = shapeClasses("auto");
  return (
    <section className={FILL_FIRST_SCREEN} aria-busy="true">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex h-8 items-center">
            <Skeleton className="h-7 w-64 max-w-full" />
          </div>
          <div className="mt-1 flex h-6 items-center">
            <Skeleton className="h-4 w-48" />
          </div>
          {/* 시청자에게는 소유자 닉네임 줄이 하나 더 있다 */}
          <div className={cn("mt-1 h-5 items-center", viewerOnly)}>
            <Skeleton className="h-3.5 w-20" />
          </div>
        </div>
        {/* 소유자: 'OBS 오버레이'·'통계' 글자 버튼과 더보기. 시청자: 링크 복사 아이콘 버튼 하나 */}
        <div className={cn("flex shrink-0 flex-wrap items-center gap-2", ownerOnly)}>
          <Skeleton className="h-11 w-31 rounded-lg" />
          <Skeleton className="h-11 w-19 rounded-lg" />
          <Skeleton className="h-11 w-11 rounded-lg" />
        </div>
        <div className={cn("shrink-0", viewerOnly)}>
          <Skeleton className="h-11 w-11 rounded-lg" />
        </div>
      </div>

      <ConsoleSkeleton shape="auto" className="mt-6" />
    </section>
  );
}

/**
 * 콘솔(`TimerConsole`) 부분의 골격: 카운트다운, 시간 카드 | 목표(소유자), 최근 기록 | 잔여 시간 추이.
 * 프로젝트 화면 골격의 일부이고, 상위가 상세를 받지 못해 콘솔이 직접 다시 부르는 동안에도 같은 자리에 쓴다(busy).
 * 시청자 모양은 목표 영역을 두지 않는다(목표가 있을 때만 보이는데 받기 전에는 모른다)
 */
export function ConsoleSkeleton({ shape, className, busy = false }: { shape: ConsoleShape; className?: string; busy?: boolean }) {
  const { ownerOnly, showOwner } = shapeClasses(shape);
  return (
    <div className={cn("space-y-8", className)} aria-busy={busy || undefined}>
      {/* 카운트다운(CountdownDisplay와 같은 구조): 숫자 + '실행 중' 배지가 한 줄에 안 들어가면 배지가 아래로 내려간다.
          숫자 막대 폭은 실제 숫자 폭(높이의 4.6배, 실측 276/60)이라 줄바꿈이 본문과 같은 폭에서 일어난다. 아래는 종료 예정 줄(24px) */}
      <div className="flex flex-col">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <Skeleton className="h-[clamp(3rem,17vw,3.75rem)] w-[calc(clamp(3rem,17vw,3.75rem)*4.6)] sm:h-15 sm:w-69" />
          <Skeleton className="mt-2 h-5 w-13 rounded-full" />
        </div>
        <div className="mt-1 flex h-5 items-center">
          <Skeleton className="h-3.5 w-28" />
        </div>
      </div>

      {showOwner && (
        <div className={cn("grid gap-x-5 gap-y-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start", ownerOnly)}>
          {/* 시간 카드. md부터 프리셋 줄과 확인 버튼이 생겨 높아진다(모바일은 하단 바가 맡는다) */}
          <div className="h-70 overflow-hidden rounded-card border border-border p-5 md:h-87">
            <HeadingSkeleton className="w-12" />
            {/* 시청자 닉네임 라벨·입력 | 추가/차감(md부터 옆, 모바일은 아래) */}
            <div className="mt-3 flex h-5 items-center">
              <Skeleton className="h-3.5 w-24" />
            </div>
            <div className="mt-1.5 flex gap-4">
              <Skeleton className="h-10 min-w-0 flex-1" />
              <Skeleton className="hidden h-12 w-56 -translate-y-1 md:block" />
            </div>
            <Skeleton className="mt-5 h-12 w-full md:hidden" />
            {/* 프리셋 칩(md부터)과 시·분·초 입력 */}
            <div className="mt-5 hidden gap-1.5 md:flex">
              <Skeleton className="h-10 w-17" />
              <Skeleton className="h-10 w-17" />
              <Skeleton className="h-10 w-19" />
            </div>
            <Skeleton className="mt-5 h-10 w-full md:mt-2.5" />
            {/* 확인 버튼. 위에 '시간을 입력하면…' 안내 줄(20px)과 간격(20px)이 있다 */}
            <Skeleton className="mt-10 hidden h-12 w-full md:block" />
          </div>
          {/* 목표: 제목 줄(넘치는 '새 목표' 버튼만큼 아래 여백), 탭 줄, 목표 한 개 */}
          <div className="lg:pt-[1.3125rem]">
            <div className="box-content flex h-6 items-center justify-between pb-2 pointer-coarse:pb-2.5">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="-my-2 h-10 w-26 pointer-coarse:-my-2.5 pointer-coarse:h-11" />
            </div>
            <div className="mt-3 flex h-10 items-center gap-6 border-b border-border px-4">
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-3.5 w-12" />
            </div>
            <div className="h-[5.5rem] space-y-3 pt-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-2 w-full rounded-full" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-x-5 gap-y-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <div>
          <HeadingSkeleton className="w-20" />
          {/* 최근 기록 5행(행 61px): 배지·이름·변경량 줄과 시각·전후 줄 */}
          <div className="mt-3 h-[19.0625rem]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex h-[3.8125rem] flex-col justify-center gap-2 border-b border-border/50">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-5 w-10 rounded-full" />
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="ml-auto h-3.5 w-12" />
                </div>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-10" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <HeadingSkeleton className="w-28" />
          {/* 그래프 상자(안쪽 h-64 + 여백·테두리) */}
          <div className="mt-3 h-[18.625rem] rounded-card border border-border p-5">
            <Skeleton className="h-full w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function StatsPageSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-64" />
      </div>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border p-4 space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
      {/* Donor Table */}
      <div className="space-y-3">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
      {/* Charts */}
      <div className="space-y-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}
