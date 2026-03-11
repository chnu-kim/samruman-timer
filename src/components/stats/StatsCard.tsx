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
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      {subtext && (
        <p className="mt-0.5 text-xs text-muted-foreground">{subtext}</p>
      )}
    </div>
  );
}
