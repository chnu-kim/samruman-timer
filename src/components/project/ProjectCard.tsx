import Link from "next/link";
import { cn, formatRelativeDate } from "@/lib/utils";
import type { ProjectListItem } from "@/types";

interface ProjectCardProps {
  project: ProjectListItem;
  className?: string;
}

export function ProjectCard({ project, className }: ProjectCardProps) {
  return (
    <Link href={`/projects/${project.id}`} className="flex rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      <article
        className={cn(
          "flex w-full flex-col border border-border rounded-xl p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-accent/40",
          className,
        )}
        style={{ animation: "fade-in 0.2s ease-out forwards" }}
      >
        {/* 상단: 제목 + 설명 (가변 영역) */}
        <div className="flex-1 min-h-0">
          <h3 className="font-bold">{project.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
            {project.description || "\u00A0"}
          </p>
        </div>

        {/* 하단: 메타 정보 (고정 영역) */}
        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          <span>{project.ownerNickname}</span>
          <span>{formatRelativeDate(project.createdAt)}</span>
        </div>
      </article>
    </Link>
  );
}
