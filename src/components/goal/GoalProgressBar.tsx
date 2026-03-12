"use client";

import { cn } from "@/lib/utils";
import type { GoalStatus } from "@/types";

interface GoalProgressBarProps {
  percentage: number;
  status: GoalStatus;
  className?: string;
}

const statusColors: Record<GoalStatus, { bar: string; bg: string }> = {
  ACTIVE: {
    bar: "bg-accent",
    bg: "bg-accent/15",
  },
  COMPLETED: {
    bar: "bg-green-500 dark:bg-green-400",
    bg: "bg-green-500/15",
  },
  FAILED: {
    bar: "bg-red-500 dark:bg-red-400",
    bg: "bg-red-500/15",
  },
  CANCELLED: {
    bar: "bg-gray-400 dark:bg-gray-500",
    bg: "bg-gray-400/15",
  },
};

export function GoalProgressBar({ percentage, status, className }: GoalProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, percentage));
  const colors = statusColors[status];

  return (
    <div className={cn("w-full", className)}>
      <div className={cn("h-2 rounded-full overflow-hidden", colors.bg)}>
        <div
          className={cn("h-full rounded-full transition-all duration-500", colors.bar)}
          style={{ width: `${clamped}%` }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`목표 진행률 ${clamped}%`}
        />
      </div>
    </div>
  );
}
