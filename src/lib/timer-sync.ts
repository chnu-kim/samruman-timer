import type { TimerStatus } from "@/types";

/**
 * 폴링 값이 로컬 기대값과 이만큼(초) 벌어지면 다른 기기에서 시간을 바꾼 것으로 본다.
 * 초 단위 내림과 네트워크 지연에서 생기는 1~2초 오차보다 크게 잡는다.
 */
export const EXTERNAL_CHANGE_THRESHOLD_SECONDS = 3;

export interface SyncedTimerSnapshot {
  status: TimerStatus;
  remainingSeconds: number;
  /** 이 값을 화면에 반영한 시각 (ms) */
  syncedAtMs: number;
}

/**
 * 폴링 결과에 이 화면이 모르는 변경(상태 전이, 다른 기기의 시간 추가/차감)이 있는지 판단한다.
 * RUNNING이면 마지막으로 반영한 뒤 흐른 시간만큼 줄어든 값을 기대값으로 삼는다.
 * 클라이언트 전용 (src/lib/timer.ts는 D1에 의존하는 서버 모듈이라 따로 둔다).
 */
export function hasExternalChange(
  local: SyncedTimerSnapshot,
  server: { status: TimerStatus; remainingSeconds: number },
  nowMs: number,
): boolean {
  if (local.status !== server.status) return true;
  const elapsed = local.status === "RUNNING" ? Math.floor((nowMs - local.syncedAtMs) / 1000) : 0;
  const expected = Math.max(0, local.remainingSeconds - elapsed);
  return Math.abs(expected - server.remainingSeconds) >= EXTERNAL_CHANGE_THRESHOLD_SECONDS;
}

/**
 * 폴링 결과를 화면 값과 맞춘다. 다른 기기의 변경이 없으면 화면에 반영한 잔여시간과 그 시각을 그대로 두어
 * 카운트다운이 매 폴링마다 서버 값으로 다시 시작되지 않게 한다(초 단위 틱 위상이 흔들리는 것을 막는다).
 * 변경이 있거나 처음 받는 값이면 서버 값을 그대로 쓰고 기준 시각을 새로 잡는다.
 */
export function reconcilePolledTimer<T extends { status: TimerStatus; remainingSeconds: number }>(
  local: SyncedTimerSnapshot | undefined,
  server: T,
  nowMs: number,
): { item: T; snapshot: SyncedTimerSnapshot } {
  if (local && !hasExternalChange(local, server, nowMs)) {
    return { item: { ...server, remainingSeconds: local.remainingSeconds }, snapshot: local };
  }
  return {
    item: server,
    snapshot: { status: server.status, remainingSeconds: server.remainingSeconds, syncedAtMs: nowMs },
  };
}
