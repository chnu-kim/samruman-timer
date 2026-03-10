"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { TimerStatus } from "@/types";

interface CountdownDisplayProps {
  remainingSeconds: number;
  status: TimerStatus;
  scheduledStartAt?: string | null;
  size?: "compact" | "large";
  className?: string;
}

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  if (days > 0) {
    return `${days}d ${hh}:${mm}:${ss}`;
  }
  return `${hh}:${mm}:${ss}`;
}

export function CountdownDisplay({
  remainingSeconds,
  status,
  scheduledStartAt,
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

  return (
    <div className="flex flex-col">
      <span
        className={cn(
          size === "large"
            ? "text-5xl sm:text-6xl font-mono font-bold tracking-tight"
            : "text-lg font-mono font-semibold",
          isExpired && "text-foreground/40",
          isScheduled && "text-purple-600 dark:text-purple-400",
          className,
        )}
        aria-label={isScheduled ? `예약 시간 ${formatTime(displayed)}` : `남은 시간 ${formatTime(displayed)}`}
      >
        {formatTime(displayed)}
      </span>
      {/* compact: 항상 서브텍스트 높이를 확보하여 카드 높이 일관성 유지 */}
      {size === "compact" && (
        <span className="text-xs text-purple-500 dark:text-purple-400 min-h-[1rem] mt-0.5">
          {isScheduled && scheduledStartAt
            ? `시작 대기 중 · ${new Date(scheduledStartAt).toLocaleString("ko-KR")}`
            : "\u00A0"}
        </span>
      )}
      {/* large: 예약 시에만 서브텍스트 표시 */}
      {size === "large" && isScheduled && scheduledStartAt && (
        <span className="text-sm text-purple-500 dark:text-purple-400 mt-1">
          시작 대기 중 · {new Date(scheduledStartAt).toLocaleString("ko-KR")}
        </span>
      )}
    </div>
  );
}
