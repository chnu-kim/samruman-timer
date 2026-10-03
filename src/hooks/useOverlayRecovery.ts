"use client";

import { useEffect } from "react";
import {
  RESET_MAX_DELAY_MS,
  nextRecoveryStep,
  recordReload,
  recordResetAttempt,
  reloadPage,
} from "@/lib/overlay-recovery";

/**
 * 오버레이 렌더 오류 경계의 자동 복구(src/lib/overlay-recovery.ts 정책).
 * reset()을 지수 백오프로 예약하고, 여러 번 실패하면 상한 안에서 location.reload()한다.
 * enabled가 false면 아무것도 하지 않는다(global-error처럼 오버레이 경로일 때만 복구하는 경계용).
 */
export function useOverlayRecovery(reset: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const step = nextRecoveryStep();
    if (step.kind === "reload") {
      if (recordReload()) {
        reloadPage();
        return;
      }
      // 횟수를 기록할 수 없으면 reload하지 않고 최대 간격 reset으로 버틴다
    }
    const delayMs = step.kind === "reset" ? step.delayMs : RESET_MAX_DELAY_MS;
    const handle = setTimeout(() => {
      recordResetAttempt();
      reset();
    }, delayMs);
    return () => clearTimeout(handle);
  }, [reset, enabled]);
}
