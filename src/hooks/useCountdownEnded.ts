import { useEffect, useState } from "react";
import type { TimerStatus } from "@/types";

// setTimeout이 받는 최대 지연(약 24.8일). 이보다 길면 예약하지 않는다. 그 전에 폴링이 새 값을 준다
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * 서버가 RUNNING으로 준 타이머의 카운트다운이 0에 닿았는지 알려 준다.
 * 만료는 서버가 조회 시점에 lazy하게 기록하므로, 다음 폴링 전까지 배지가 '실행 중'으로 남지 않게 하는 용도다.
 * 새 값(폴링 결과)이 들어오면 그 값을 기준으로 다시 잰다.
 */
export function useCountdownEnded(
  remainingSeconds: number | undefined,
  status: TimerStatus | undefined,
): boolean {
  const key = `${status}:${remainingSeconds}`;
  // 어떤 값에 대해 0에 닿았는지 기록해 두면, 새 값이 들어왔을 때 따로 초기화하지 않아도 된다
  const [endedKey, setEndedKey] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "RUNNING" || remainingSeconds === undefined) return;
    const ms = Math.max(0, remainingSeconds) * 1000;
    if (ms > MAX_TIMEOUT_MS) return;
    const id = setTimeout(() => setEndedKey(key), ms);
    return () => clearTimeout(id);
  }, [key, status, remainingSeconds]);

  return status === "RUNNING" && endedKey === key;
}
