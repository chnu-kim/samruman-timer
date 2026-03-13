import Link from "next/link";
import { cn } from "@/lib/utils";
import { CountdownDisplay } from "./CountdownDisplay";
import { Badge } from "@/components/ui/Badge";
import type { TimerListItem } from "@/types";

interface TimerCardProps {
  timer: TimerListItem;
  className?: string;
}

export function TimerCard({ timer, className }: TimerCardProps) {
  return (
    <Link
      href={`/timers/${timer.id}`}
      className="flex rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <article
        className={cn(
          "flex w-full flex-col border border-border rounded-xl p-5 transition-all duration-200 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 hover:border-accent/40",
          className,
        )}
        style={{ animation: "fade-in 0.2s ease-out forwards" }}
      >
        {/* 상단: 제목 + 설명 (가변 영역) */}
        <div className="flex-1 min-h-0">
          <h3 className="font-bold">{timer.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
            {timer.description || "\u00A0"}
          </p>
        </div>

        {/* 하단: 카운트다운 + 뱃지 (고정 영역) */}
        <div className="mt-3 flex items-end justify-between">
          <CountdownDisplay
            remainingSeconds={timer.remainingSeconds}
            status={timer.status}
            scheduledStartAt={timer.scheduledStartAt}
            createdAt={timer.createdAt}
            size="compact"
          />
          <Badge variant={timer.status === "SCHEDULED" ? "scheduled" : timer.status === "RUNNING" ? "running" : "expired"}>
            {timer.status === "SCHEDULED" ? "예약됨" : timer.status === "RUNNING" ? "실행 중" : "만료"}
          </Badge>
        </div>
      </article>
    </Link>
  );
}
