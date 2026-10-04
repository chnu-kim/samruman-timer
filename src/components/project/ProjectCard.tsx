import Link from "next/link";
import { cn, formatDuration, formatRelativeDate } from "@/lib/utils";
import type { ProjectListItem } from "@/types";

interface ProjectCardProps {
  project: ProjectListItem;
  /** 소유자 이름 표시. '내 프로젝트' 탭에서는 모두 본인이라 끈다 */
  showOwner?: boolean;
  className?: string;
}

function formatScheduledAt(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * 목록 응답 시점의 타이머 상태 한 줄. 초 단위로 움직이지 않는 정적 값이다.
 * 상태 이름은 콘솔 배지와 같은 말(실행 중·예약됨·만료)을 쓰고, 색 점은 보조 단서다.
 * 타이머가 없으면 아무것도 보이지 않는다(없는 것이 기본).
 */
function TimerStatusLine({ project }: { project: ProjectListItem }) {
  const { timerStatus, remainingSeconds, scheduledStartAt } = project;
  if (timerStatus === "RUNNING") {
    const left = remainingSeconds !== null && remainingSeconds < 60 ? "1분 미만" : formatDuration(remainingSeconds ?? 0);
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-green-600 dark:bg-green-400" />
        실행 중 · {left} 남음
      </span>
    );
  }
  if (timerStatus === "SCHEDULED") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-purple-600 dark:bg-purple-400" />
        {scheduledStartAt ? `예약됨 · ${formatScheduledAt(scheduledStartAt)}` : "예약됨"}
      </span>
    );
  }
  if (timerStatus === "EXPIRED") return <span>만료</span>;
  return null;
}

export function ProjectCard({ project, showOwner = true, className }: ProjectCardProps) {
  const titleId = `project-title-${project.id}`;
  const metaId = `project-meta-${project.id}`;
  return (
    <Link
      href={`/projects/${project.id}`}
      aria-labelledby={titleId}
      aria-describedby={metaId}
      className="flex rounded-xl"
    >
      <article
        className={cn(
          "flex w-full flex-col border border-border rounded-xl p-5 transition-all duration-200 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 hover:border-accent/40",
          className,
        )}
        style={{ animation: "fade-in 0.2s ease-out forwards" }}
      >
        {/* 상단: 제목 + 설명 (가변 영역). 그리드에서 카드 높이를 맞추는 빈 설명 줄은 sm 이상에서만 둔다 */}
        <div className="flex-1 min-h-0">
          <h2 id={titleId} className="font-bold">{project.name}</h2>
          <p
            className={cn(
              "mt-1 text-sm text-muted-foreground line-clamp-2 sm:min-h-[2.5rem]",
              !project.description && "hidden sm:block",
            )}
          >
            {project.description || " "}
          </p>
        </div>

        {/* 하단: 메타 정보 (고정 영역) */}
        <div id={metaId} className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <TimerStatusLine project={project} />
          {showOwner && <span>{project.ownerNickname}</span>}
          <span>{formatRelativeDate(project.createdAt)}</span>
        </div>
      </article>
    </Link>
  );
}
