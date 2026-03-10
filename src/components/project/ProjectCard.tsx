import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ProjectListItem } from "@/types";

interface ProjectCardProps {
  project: ProjectListItem;
  className?: string;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "오늘";
  if (diffDays === 1) return "어제";
  if (diffDays < 30) return `${diffDays}일 전`;
  return date.toLocaleDateString("ko-KR");
}

export function ProjectCard({ project, className }: ProjectCardProps) {
  return (
    <Link href={`/projects/${project.id}`} className="flex">
      <article
        className={cn(
          "flex w-full flex-col border border-foreground/20 rounded-xl p-5 transition-colors hover:border-foreground/40",
          className,
        )}
      >
        {/* 상단: 제목 + 설명 (가변 영역) */}
        <div className="flex-1 min-h-0">
          <h3 className="font-bold">{project.name}</h3>
          <p className="mt-1 text-sm text-foreground/60 line-clamp-2 min-h-[2.5rem]">
            {project.description || "\u00A0"}
          </p>
        </div>

        {/* 하단: 메타 정보 (고정 영역) */}
        <div className="mt-3 flex items-center gap-3 text-xs text-foreground/40">
          <span>{project.ownerNickname}</span>
          <span>{formatDate(project.createdAt)}</span>
        </div>
      </article>
    </Link>
  );
}
