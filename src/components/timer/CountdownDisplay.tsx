"use client";

import { useState, useEffect } from "react";
import { cn, formatDateTime } from "@/lib/utils";
import type { TimerStatus } from "@/types";

interface CountdownDisplayProps {
  remainingSeconds: number;
  status: TimerStatus;
  scheduledStartAt?: string | null;
  createdAt?: string;
  size?: "compact" | "large";
  className?: string;
}

export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  return `${hh}:${mm}:${ss}`;
}

export function CountdownDisplay({
  remainingSeconds,
  status,
  scheduledStartAt,
  createdAt,
  size = "compact",
  className,
}: CountdownDisplayProps) {
  const [displayed, setDisplayed] = useState(remainingSeconds);

  useEffect(() => {
    setDisplayed(remainingSeconds);

    if (status !== "RUNNING" || remainingSeconds <= 0) return;

    const startTime = Date.now();
    const startValue = remainingSeconds;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const next = Math.max(0, startValue - elapsed);
      setDisplayed(next);
      if (next <= 0) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [remainingSeconds, status]);

  const isExpired = status === "EXPIRED" || (status !== "SCHEDULED" && displayed <= 0);
  const isScheduled = status === "SCHEDULED";
  const isRunning = status === "RUNNING" && displayed > 0;

  const startedAt = scheduledStartAt ?? createdAt;
  const elapsedSeconds = isRunning && startedAt
    ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
    : 0;

  const endTimeText = isRunning
    ? `종료 예정 · ${formatDateTime(new Date(Date.now() + displayed * 1000).toISOString())}${elapsedSeconds > 0 ? ` (${formatTime(elapsedSeconds)} 경과)` : ""}`
    : null;

  return (
    <div className="flex flex-col">
      <span
        role="timer"
        className={cn(
          size === "large"
            ? "text-5xl sm:text-6xl font-mono font-bold tracking-tight"
            : "text-lg font-mono font-semibold",
          isExpired && "text-muted-foreground",
          isScheduled && "text-purple-600 dark:text-purple-400",
          className,
        )}
        aria-label={isScheduled ? `예약 시간 ${formatTime(displayed)}` : `남은 시간 ${formatTime(displayed)}`}
      >
        {formatTime(displayed)}
      </span>
      {/* compact: 항상 서브텍스트 높이를 확보하여 카드 높이 일관성 유지 */}
      {size === "compact" && (
        <span className="text-xs text-purple-600 dark:text-purple-400 min-h-[1rem] mt-0.5">
          {isScheduled && scheduledStartAt
            ? `시작 대기 중 · ${formatDateTime(scheduledStartAt)}`
            : "\u00A0"}
        </span>
      )}
      {/* large: 예약/실행 시 서브텍스트 표시 */}
      {size === "large" && isScheduled && scheduledStartAt && (
        <span className="text-sm text-purple-600 dark:text-purple-400 mt-1">
          시작 대기 중 · {formatDateTime(scheduledStartAt)}
        </span>
      )}
      {size === "large" && endTimeText && (
        <span className="text-sm text-muted-foreground mt-1">
          {endTimeText}
        </span>
      )}
    </div>
  );
}
