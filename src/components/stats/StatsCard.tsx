import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface StatsCardProps {
  label: string;
  value: string;
  subtext?: string;
  icon?: ReactNode;
  className?: string;
}

export function StatsCard({ label, value, subtext, icon, className }: StatsCardProps) {
  return (
    <div className={cn("rounded-xl border border-border bg-background p-4", className)}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon && <span className="shrink-0">{icon}</span>}
        <span>{label}</span>
      </div>
      {/* 390px 두 칸 그리드에서 '+12시간 50분'이 글자 단위로 끊기지 않게 좁은 화면은 한 단계 작게, 줄바꿈은 어절 단위로 */}
      <p className="mt-1 text-xl font-bold text-foreground break-keep sm:text-2xl">{value}</p>
      {subtext && (
        <p className="mt-0.5 text-xs text-muted-foreground">{subtext}</p>
      )}
    </div>
  );
}
