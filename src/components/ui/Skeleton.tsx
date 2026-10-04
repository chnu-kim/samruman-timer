import { cn } from "@/lib/utils";
import { FILL_FIRST_SCREEN } from "@/components/layout/page-height";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse bg-foreground/10",
        // cn은 이어 붙이기만 해서 rounded-card가 rounded-control에 CSS 순서로 진다. 호출부가 모서리를 정하면 기본값을 뺀다
        !/(^|\s)rounded-/.test(className ?? "") && "rounded-control",
        className,
      )}
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

/**
 * 프로젝트 콘솔(`projects/[id]/page`·`TimerConsole`)의 첫 화면 골격. 높이·열·줄바꿈을 실제 화면과 같게 둔다:
 * 헤더 줄(제목·설명 | 액션 버튼 셋), 카운트다운, 시간 카드 | 목표, 최근 기록 | 잔여 시간 추이.
 * 로그인 확인 전이라 소유자인지 모르므로 콘솔을 가장 많이 여는 소유자 화면의 모양이다
 */
export function ProjectDetailSkeleton() {
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
        </div>
        {/* 'OBS 오버레이'·'통계' 글자 버튼과 더보기 */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Skeleton className="h-11 w-31 rounded-lg" />
          <Skeleton className="h-11 w-19 rounded-lg" />
          <Skeleton className="h-11 w-11 rounded-lg" />
        </div>
      </div>

      <div className="mt-6 space-y-8">
        {/* 카운트다운(숫자 48/60px + 종료 예정 줄)과 상태 배지 */}
        <div className="flex h-18 items-start gap-4 sm:h-21">
          <Skeleton className="h-12 w-56 sm:h-15 sm:w-72" />
          <Skeleton className="mt-2 h-6 w-16 rounded-full" />
        </div>

        <div className="grid gap-x-5 gap-y-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
          {/* 시간 카드. md부터 프리셋·입력이 두 열이 되어 높아진다 */}
          <div className="h-70 rounded-card border border-border p-5 md:h-89">
            <Skeleton className="my-1 h-4 w-12" />
            <Skeleton className="mt-3 h-11 w-full" />
            <Skeleton className="mt-5 h-12 w-full" />
          </div>
          <div className="lg:pt-[1.3125rem]">
            <Skeleton className="my-1 h-4 w-12" />
            <div className="mt-3 h-55 space-y-4 border-t border-border pt-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          </div>
        </div>

        <div className="grid gap-x-5 gap-y-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
          <div>
            <Skeleton className="my-1 h-4 w-20" />
            {/* 최근 기록 5행 */}
            <div className="mt-3 h-[19.0625rem] space-y-6 pt-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
          <div>
            <Skeleton className="my-1 h-4 w-28" />
            {/* 그래프 상자(안쪽 h-64 + 여백·테두리) */}
            <div className="mt-3 h-[18.625rem] rounded-card border border-border p-5">
              <Skeleton className="h-full w-full" />
            </div>
          </div>
        </div>
      </div>
    </section>
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
