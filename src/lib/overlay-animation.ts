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
