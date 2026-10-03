// (클라이언트) 오버레이 렌더 오류 복구 정책.
// error.tsx는 reset()이 실패할 때마다 새 인스턴스로 다시 마운트되므로 시도 횟수를 컴포넌트 상태에 둘 수 없다.
// 그래서 모듈 변수(같은 문서 안)와 sessionStorage(reload를 넘어서)에 둔다.

export const RESET_BASE_DELAY_MS = 5_000;
export const RESET_MAX_DELAY_MS = 60_000;
/** 이 횟수만큼 reset()이 실패하면 location.reload()로 넘어간다 */
export const MAX_RESETS_BEFORE_RELOAD = 5;
/** 결정적인 렌더 오류에서 reload가 무한히 반복되지 않게 세션당 reload 횟수를 제한한다 */
export const MAX_RELOADS = 2;
const RELOAD_COUNT_KEY = "overlay-reload-count";

let resetAttempts = 0;

export type RecoveryStep = { kind: "reset"; delayMs: number } | { kind: "reload" };

/** 다음 복구 동작. reset 지연은 5초부터 두 배씩 늘어 최대 60초. reload 상한에 닿으면 60초 간격 reset을 계속한다 */
export function nextRecoveryStep(): RecoveryStep {
  if (resetAttempts < MAX_RESETS_BEFORE_RELOAD) {
    return { kind: "reset", delayMs: Math.min(RESET_BASE_DELAY_MS * 2 ** resetAttempts, RESET_MAX_DELAY_MS) };
  }
  if (readReloadCount() < MAX_RELOADS) return { kind: "reload" };
  return { kind: "reset", delayMs: RESET_MAX_DELAY_MS };
}

export function recordResetAttempt(): void {
  resetAttempts += 1;
}

/** reload 횟수를 1 올린다. 저장에 실패하면 false를 돌려주고, 호출 측은 reload하지 않는다(무한 reload 방지) */
export function recordReload(): boolean {
  try {
    const next = readReloadCountOrThrow() + 1;
    window.sessionStorage.setItem(RELOAD_COUNT_KEY, String(next));
    return true;
  } catch {
    return false;
  }
}

/** 오버레이가 데이터를 그리는 데 성공하면 부른다. 몇 시간 뒤의 새 오류에서도 다시 reload할 수 있게 상한을 되돌린다 */
export function clearRecovery(): void {
  resetAttempts = 0;
  try {
    window.sessionStorage.removeItem(RELOAD_COUNT_KEY);
  } catch {
    // 저장소를 쓸 수 없으면 지울 것도 없다
  }
}

/** 테스트에서 vi.mock으로 바꿀 수 있게 분리한다(jsdom의 location.reload는 spy할 수 없다) */
export function reloadPage(): void {
  window.location.reload();
}

function readReloadCountOrThrow(): number {
  const raw = window.sessionStorage.getItem(RELOAD_COUNT_KEY);
  const n = raw === null ? 0 : Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function readReloadCount(): number {
  try {
    return readReloadCountOrThrow();
  } catch {
    // 저장소를 읽을 수 없으면 상한에 닿은 것으로 본다
    return MAX_RELOADS;
  }
}

/** 테스트 전용: 모듈 상태 초기화 */
export function __resetOverlayRecoveryForTest(): void {
  resetAttempts = 0;
}
