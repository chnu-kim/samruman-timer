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

/** 추정 변경량이 이 범위 안이면 시간 흐름의 오차로 보고 연출하지 않는다 */
const NOISE_SECONDS = 2;

export function detectTimerChange(
  prev: TimerSnapshot,
  current: { remainingSeconds: number; updatedAt: string; status?: TimerStatus; lastDeltaSeconds?: number | null },
  now: number,
): TimerChangeResult | null {
  if (prev.updatedAt === current.updatedAt) return null;
  // SCHEDULED에서는 시간 변경이 불가능하므로, 값이 바뀌었다면 예약 활성화(ACTIVATE)다
  if (prev.status === "SCHEDULED") return null;

  // 카운트다운은 RUNNING일 때만 진행되고 0 아래로 내려가지 않는다.
  // 만료 상태에서 흐른 시간까지 빼면 재오픈 시 변경량이 부풀려진다.
  const elapsedSec = prev.status === "RUNNING" ? Math.round((now - prev.fetchedAt) / 1000) : 0;
  const expectedRemaining = Math.max(0, prev.remainingSeconds - elapsedSec);
  const estimated = current.remainingSeconds - expectedRemaining;

  // 추정값은 폴링 시각과 서버의 초 내림 때문에 1~2초 어긋나 '+60초'가 '+1:01'·'59초'로 보인다.
  // 서버가 준 실제 변경량이 추정과 맞으면(폴링 사이 변경이 한 번이면) 실제 값을 쓰고,
  // 크게 다르면 폴링 사이에 여러 번 바뀐 것이므로 합계에 가까운 추정값을 쓴다.
  // 폴링 사이에 만료·재오픈이 끼면 카운트다운이 흐른 시간을 알 수 없어 추정이 최대 그 간격만큼 어긋나므로
  // (만료 → +60초 → 3초 뒤 폴링이면 추정 57초) 그때는 폴링 간격까지 맞는 것으로 본다
  const actual = current.lastDeltaSeconds;
  const statusChanged = prev.status !== "RUNNING" || (current.status !== undefined && current.status !== "RUNNING");
  const tolerance = statusChanged
    ? Math.ceil(Math.max(0, now - prev.fetchedAt) / 1000) + NOISE_SECONDS
    : NOISE_SECONDS;
  const delta =
    typeof actual === "number" && Math.abs(estimated - actual) <= tolerance ? actual : estimated;

  if (Math.abs(delta) <= NOISE_SECONDS) return null;

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
