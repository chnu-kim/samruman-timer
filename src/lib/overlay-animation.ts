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
  current: { remainingSeconds: number; updatedAt: string; deltaSinceSeconds?: number | null },
  now: number,
): TimerChangeResult | null {
  if (prev.updatedAt === current.updatedAt) return null;
  // SCHEDULED에서는 시간 변경이 불가능하므로, 값이 바뀌었다면 예약 활성화(ACTIVATE)다
  if (prev.status === "SCHEDULED") return null;

  // 서버가 직전 updatedAt(since) 이후의 실제 변경량 합계를 주면 그대로 쓴다. 폴링 시각으로 추정하면
  // 폴링 시각과 서버의 초 내림 때문에 1~2초 어긋나 '+60초'가 '+1:01'로 보이고, 만료·재오픈이 끼면 더 어긋난다.
  // null은 그사이 시간 추가·차감이 없었다는 뜻(제목 수정, 만료 기록 등)이라 연출하지 않는다.
  // undefined(since를 보내지 않았거나, 그사이 되돌리기가 있었거나, 이 필드가 없는 이전 서버)일 때만 폴링 시각으로 추정한다
  if (current.deltaSinceSeconds === null) return null;
  let delta: number;
  if (typeof current.deltaSinceSeconds === "number") {
    // 실제 값이므로 오차 범위를 두지 않는다(+1초 추가, 2초 남았을 때의 차감도 연출한다)
    if (current.deltaSinceSeconds === 0) return null;
    delta = current.deltaSinceSeconds;
  } else {
    // 카운트다운은 RUNNING일 때만 진행되고 0 아래로 내려가지 않는다.
    // 만료 상태에서 흐른 시간까지 빼면 재오픈 시 변경량이 부풀려진다.
    const elapsedSec = prev.status === "RUNNING" ? Math.round((now - prev.fetchedAt) / 1000) : 0;
    const expectedRemaining = Math.max(0, prev.remainingSeconds - elapsedSec);
    delta = current.remainingSeconds - expectedRemaining;
    if (Math.abs(delta) <= NOISE_SECONDS) return null;
  }

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
