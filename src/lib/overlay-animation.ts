import type { TimerStatus } from "@/types";

/** 오버레이가 직전 폴링에서 본 타이머 상태 */
export interface TimerSnapshot {
  remainingSeconds: number;
  updatedAt: string;
  fetchedAt: number;
  status: TimerStatus;
}

export function formatDelta(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  if (m > 0) return `${m}:${String(s).padStart(2, "0")}`;
  return `${s}초`;
}

export interface TimerChangeResult {
  animClass: "overlay-anim-add" | "overlay-anim-subtract";
  floatingText: string;
}

export function detectTimerChange(
  prev: TimerSnapshot,
  current: { remainingSeconds: number; updatedAt: string },
  now: number,
): TimerChangeResult | null {
  if (prev.updatedAt === current.updatedAt) return null;
  // SCHEDULED에서는 시간 변경이 불가능하므로, 값이 바뀌었다면 예약 활성화(ACTIVATE)다
  if (prev.status === "SCHEDULED") return null;

  // 카운트다운은 RUNNING일 때만 진행되고 0 아래로 내려가지 않는다.
  // 만료 상태에서 흐른 시간까지 빼면 재오픈 시 변경량이 부풀려진다.
  const elapsedSec = prev.status === "RUNNING" ? Math.floor((now - prev.fetchedAt) / 1000) : 0;
  const expectedRemaining = Math.max(0, prev.remainingSeconds - elapsedSec);
  const delta = current.remainingSeconds - expectedRemaining;

  if (Math.abs(delta) <= 2) return null;

  const absDelta = Math.abs(delta);
  const sign = delta > 0 ? "+" : "-";
  return {
    animClass: delta > 0 ? "overlay-anim-add" : "overlay-anim-subtract",
    floatingText: `${sign}${formatDelta(absDelta)}`,
  };
}

/**
 * 폴링 요청은 취소하지 않으므로 이전 요청의 응답이 늦게 도착할 수 있다.
 * 직전에 반영한 것보다 오래된 응답은 버려야 화면이 과거 값으로 되돌아가거나
 * 가짜 변경 애니메이션이 뜨지 않는다.
 */
export function isStaleResponse(
  prev: TimerSnapshot | null,
  current: { updatedAt: string },
): boolean {
  if (!prev) return false;
  return Date.parse(current.updatedAt) < Date.parse(prev.updatedAt);
}
