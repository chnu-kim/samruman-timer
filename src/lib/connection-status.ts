// 콘솔이 서버와의 연결이 끊겼다고 보는 기준. 클라이언트·테스트 공용 순수 함수만 둔다.

/**
 * 폴링이 연속으로 이만큼 실패하면 연결 끊김으로 본다.
 * 한 번의 일시 실패(약 5초)로는 배지를 바꾸지 않고, 두 번째(약 10초)부터 바꾼다.
 */
export const DISCONNECT_FAILURE_THRESHOLD = 2;

export function isDisconnected(consecutiveFailures: number): boolean {
  return consecutiveFailures >= DISCONNECT_FAILURE_THRESHOLD;
}

/**
 * 연결 끊김 배지에 붙일 경과 문구('12초 전 기준'). 마지막으로 서버 값을 받은 지 얼마나 지났는지 보여 준다.
 * 시각을 모르면 null
 */
export function connectionLostAgo(lastSyncedAtMs: number | null, nowMs: number): string | null {
  if (lastSyncedAtMs === null) return null;
  const seconds = Math.max(0, Math.floor((nowMs - lastSyncedAtMs) / 1000));
  if (seconds < 60) return `${seconds}초 전 기준`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전 기준`;
  return `${Math.floor(seconds / 3600)}시간 전 기준`;
}
