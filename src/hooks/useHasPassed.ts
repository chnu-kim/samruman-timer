import { useEffect, useReducer } from "react";

// setTimeout이 받는 최대 지연(약 24.8일). 이보다 먼 시각은 상한까지 기다린 뒤 다시 잰다
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * 고른 시각(ms)이 지났는지. 렌더 때 지금 시각과 비교하고, 아직이면 그 시각에만 타이머를 하나 두어 다시 그린다.
 * 폼을 열어 둔 채 시각이 지나도 버튼·안내가 그 순간 바뀌고, 시각을 바꾸면 같은 렌더에서 바로 판정한다(한 프레임 어긋남 없음).
 * 대화상자 안 폼(클라이언트에서만 그려짐)용이다. 서버 렌더에 쓰면 하이드레이션 값이 어긋날 수 있다
 */
export function useHasPassed(targetMs: number | null): boolean {
  // 상한까지 기다렸는데 아직이면 다시 예약하도록 effect 의존성에 넣는다
  const [tick, rerender] = useReducer((n: number) => n + 1, 0);
  const passed = targetMs !== null && targetMs <= Date.now();

  useEffect(() => {
    if (targetMs === null || passed) return;
    // 타이머는 지연보다 일찍 깨지 않으므로 깨어난 렌더에서 '<=' 비교가 참이 된다
    const delay = Math.min(targetMs - Date.now(), MAX_TIMEOUT_MS);
    const id = setTimeout(rerender, delay);
    return () => clearTimeout(id);
  }, [targetMs, passed, tick]);

  return passed;
}
