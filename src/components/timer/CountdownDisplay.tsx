"use client";

import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useAnnounce } from "@/components/ui/Toast";
import { cn, formatDateTime, formatEndTime } from "@/lib/utils";
import type { TimerStatus } from "@/types";

interface CountdownDisplayProps {
  remainingSeconds: number;
  status: TimerStatus;
  /**
   * 타이머 스냅샷이 실제로 바뀌었음을 알리는 값(updatedAt, 낙관적 반영 횟수 등). 종료 예정 시각은 이 값이나 status가
   * 바뀔 때만 다시 잡는다. 없으면 remainingSeconds가 바뀔 때마다 잡는다
   */
  snapshotKey?: string | number;
  scheduledStartAt?: string | null;
  size?: "compact" | "large";
  className?: string;
  /**
   * 숫자에 딸린 상태 배지 등. large에서 sm 이상은 숫자 옆, 모바일은 숫자 아래 보조 문구('종료 예정' 등) 앞에 둔다.
   * 위치는 이 컴포넌트가 정하므로 넘기는 쪽은 여백을 주지 않는다
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
  snapshotKey,
  scheduledStartAt,
  size = "compact",
  className,
  aside,
}: CountdownDisplayProps) {
  const [displayed, setDisplayed] = useState(remainingSeconds);
  // 종료 예정 시각은 타이머 스냅샷이 실제로 바뀔 때(snapshotKey·status 변화)만 잡는다. 1초 틱이나 폴링 응답마다
  // '지금 + 남은 초'로 다시 재면 서버 초 내림·응답 지연 때문에 분 경계에서 두 값을 오간다(오버레이도 같은 기준)
  const endAtKey = snapshotKey ?? remainingSeconds;
  const endAtMs = useMemo(
    () => (status === "RUNNING" ? Date.now() + remainingSeconds * 1000 : null),
    // remainingSeconds는 의도적으로 뺀다: 같은 스냅샷에서 값만 흔들리는 폴링 응답은 다시 재지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [endAtKey, status],
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

  // 임박(5분 미만)·긴급(1분 미만) 단계로 올라갈 때 한 번만 스크린리더에 알린다. 색·깜박임은 보이지 않는 사용자에게
  // 전해지지 않고, 매초 바뀌는 숫자는 live region에 넣을 수 없어서다. 처음 그릴 때 이미 그 단계이거나 단계가 내려갈 때는 알리지 않는다
  const announce = useAnnounce();
  const level = isCritical ? 2 : isUrgent ? 1 : 0;
  const prevLevelRef = useRef(level);
  useEffect(() => {
    const prev = prevLevelRef.current;
    prevLevelRef.current = level;
    if (size !== "large" || level <= prev) return;
    announce(level === 2 ? "남은 시간이 1분 미만입니다" : "남은 시간이 5분 미만입니다");
  }, [level, size, announce]);

  // 생성 시각부터 잰 경과는 만료 후 다시 시작한 타이머에서 실제 진행 시간과 어긋나므로 종료 예정 시각만 보여 준다.
  // 오버레이의 종료 예정 줄과 같은 포맷(formatEndTime)을 쓴다
  const endTimeText = isRunning && endAtMs !== null
    ? `종료 예정 ${formatEndTime(new Date(endAtMs))}`
    : null;

  const timerEl = (
    <span
      role="timer"
      className={cn(
        size === "large"
          // 모바일은 폭에 비례해 키우되 sm(60px)을 넘지 않게 3.75rem에서 멈춘다(353px부터 60px, 320px에서 약 54px). 가장 작은 폭에서도 한 줄에 들어가게 아래를 3rem으로 막는다
          ? "basis-full text-[length:clamp(3rem,17vw,3.75rem)] leading-none sm:basis-auto sm:text-6xl font-mono font-bold tracking-tight"
          : "text-lg font-mono font-semibold",
        isExpired && "text-muted-foreground",
        isScheduled && "text-purple-600 dark:text-purple-400",
        isCritical && "text-red-800 dark:text-red-400 animate-pulse-urgent-fast",
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
  );

  // large: 숫자가 첫 줄을 홀로 쓰고 배지(aside)는 보조 문구('종료 예정' 등) 앞, 같은 줄에 붙는다(모바일). sm 이상은 숫자 옆에 배지,
  // 다음 줄에 보조 문구다. 모바일 폭(320~639px)에서 숫자(최대 276px)+배지가 한 줄에 들어가는지가 폭마다 갈려(353~376px은 줄바꿈)
  // 배치와 높이가 바뀌던 것을 없앤다. 배지와 보조 문구는 둘 다 20px 줄이라 줄이 늘지 않는다
  if (size === "large") {
    return (
      <div className="flex flex-wrap items-center gap-x-2 sm:items-start sm:gap-x-4">
        {timerEl}
        {aside && <span className="mt-1 flex sm:mt-2">{aside}</span>}
        {isScheduled && scheduledStartAt && (
          <span className="mt-1 text-sm text-purple-600 sm:basis-full dark:text-purple-400">
            시작 대기 중 · {formatDateTime(scheduledStartAt, { seconds: false })}
          </span>
        )}
        {endTimeText && (
          <span className="mt-1 text-sm text-muted-foreground sm:basis-full">
            {endTimeText}
          </span>
        )}
        {isExpired && (
          <span className="mt-1 text-sm text-muted-foreground sm:basis-full">만료됨</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        {timerEl}
        {aside}
      </div>
      {/* compact: 항상 서브텍스트 높이를 확보하여 카드 높이 일관성 유지 */}
      <span className="text-xs text-purple-600 dark:text-purple-400 min-h-[1rem] mt-0.5">
        {isScheduled && scheduledStartAt
          ? `시작 대기 중 · ${formatDateTime(scheduledStartAt, { seconds: false })}`
          : "\u00A0"}
      </span>
    </div>
  );
}
