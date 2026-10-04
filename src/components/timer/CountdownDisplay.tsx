"use client";

import { useState, useEffect, useMemo, type ReactNode } from "react";
import { cn, formatDateTime, formatEndTime } from "@/lib/utils";
import type { TimerStatus } from "@/types";

interface CountdownDisplayProps {
  remainingSeconds: number;
  status: TimerStatus;
  scheduledStartAt?: string | null;
  size?: "compact" | "large";
  className?: string;
  /**
   * 숫자 바로 옆에 붙일 요소(상태 배지 등). 보조 문구('종료 예정' 등)보다 앞 행에 두어,
   * 좁은 폭에서 줄바꿈돼도 숫자 바로 아래에 붙고 보조 문구 뒤로 밀려나지 않는다
   */
  aside?: ReactNode;
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
  size = "compact",
  className,
  aside,
}: CountdownDisplayProps) {
  const [displayed, setDisplayed] = useState(remainingSeconds);
  // 종료 예정 시각은 잔여시간 값(서버 스냅샷)이 들어올 때 한 번만 잡는다. 1초 틱마다 '지금 + 남은 초'로 다시 재면
  // 내림 오차로 분 경계에서 두 값을 오간다. 폴링 값은 다른 기기의 변경이 없으면 그대로 오므로(reconcilePolledTimer) 고정된다
  const endAtMs = useMemo(
    () => (status === "RUNNING" ? Date.now() + remainingSeconds * 1000 : null),
    [remainingSeconds, status],
  );

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
  const isUrgent = isRunning && displayed < 300; // 5분 미만
  const isCritical = isRunning && displayed < 60; // 1분 미만

  // 생성 시각부터 잰 경과는 만료 후 다시 시작한 타이머에서 실제 진행 시간과 어긋나므로 종료 예정 시각만 보여 준다.
  // 오버레이의 종료 예정 줄과 같은 포맷(formatEndTime)을 쓴다
  const endTimeText = isRunning && endAtMs !== null
    ? `종료 예정 ${formatEndTime(new Date(endAtMs))}`
    : null;

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <span
          role="timer"
          className={cn(
            size === "large"
              ? "text-5xl sm:text-6xl font-mono font-bold tracking-tight"
              : "text-lg font-mono font-semibold",
            isExpired && "text-muted-foreground",
            isScheduled && "text-purple-600 dark:text-purple-400",
            isCritical && "text-red-600 dark:text-red-400 animate-pulse-urgent-fast",
            isUrgent && !isCritical && "text-amber-700 dark:text-amber-400 animate-pulse-urgent-slow",
            className,
          )}
          aria-label={
            isCritical
              ? `긴급: 남은 시간 ${formatTime(displayed)}, 1분 미만`
              : isUrgent
                ? `긴급: 남은 시간 ${formatTime(displayed)}, 5분 미만`
                : isScheduled
                  ? `예약 시간 ${formatTime(displayed)}`
                  : `남은 시간 ${formatTime(displayed)}`
          }
        >
          {formatTime(displayed)}
        </span>
        {aside}
      </div>
      {/* compact: 항상 서브텍스트 높이를 확보하여 카드 높이 일관성 유지 */}
      {size === "compact" && (
        <span className="text-xs text-purple-600 dark:text-purple-400 min-h-[1rem] mt-0.5">
          {isScheduled && scheduledStartAt
            ? `시작 대기 중 · ${formatDateTime(scheduledStartAt, { seconds: false })}`
            : "\u00A0"}
        </span>
      )}
      {/* large: 예약/실행/만료 시 서브텍스트 표시 */}
      {size === "large" && isScheduled && scheduledStartAt && (
        <span className="text-sm text-purple-600 dark:text-purple-400 mt-1">
          시작 대기 중 · {formatDateTime(scheduledStartAt, { seconds: false })}
        </span>
      )}
      {size === "large" && endTimeText && (
        <span className="text-sm text-muted-foreground mt-1">
          {endTimeText}
        </span>
      )}
      {size === "large" && isExpired && (
        <span className="text-sm text-muted-foreground mt-1">만료됨</span>
      )}
    </div>
  );
}
