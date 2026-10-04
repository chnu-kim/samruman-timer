"use client";

import { useCallback, useRef } from "react";
import { useToast } from "@/components/ui/Toast";
import { authFetch, isSessionExpired } from "@/lib/auth-fetch";
import { formatDeltaSeconds } from "@/lib/utils";
import type { ApiErrorResponse, ApiSuccessResponse, TimerLogResponse, TimerModifyResponse } from "@/types";

/** 성공 토스트 문구: '+10분 · 벌칙룰렛'. 결과 잔여 시간은 카운트다운과 겹치므로 넣지 않는다 */
export function formatModifySummary(log: Pick<TimerLogResponse, "actionType" | "deltaSeconds" | "actorName">): string {
  const sign = log.actionType === "SUBTRACT" ? "-" : "+";
  return `${sign}${formatDeltaSeconds(log.deltaSeconds)} · ${log.actorName}`;
}

/**
 * 시간 변경 성공 토스트(폼·모바일 바·숫자 단축키 공통). '되돌리기' 버튼이 그 기록을 취소 처리한다
 * (반대 방향 modify가 아니라 `POST /api/timers/[id]/logs/[logId]/revert`).
 *
 * onApplied는 되돌린 결과(modify와 같은 모양)를 화면에 반영한다. 렌더마다 바뀌어도 최신 것을 부른다.
 */
export function useUndoableModifyToast(timerId: string, onApplied?: (data: TimerModifyResponse) => void) {
  const { toast } = useToast();
  const onAppliedRef = useRef(onApplied);
  onAppliedRef.current = onApplied;

  return useCallback((log: TimerLogResponse) => {
    const summary = formatModifySummary(log);

    async function revert() {
      try {
        const res = await authFetch(`/api/timers/${timerId}/logs/${log.id}/revert`, { method: "POST" });
        if (res.ok) {
          const json = (await res.json()) as ApiSuccessResponse<TimerModifyResponse>;
          onAppliedRef.current?.(json.data);
          toast(`되돌렸습니다 (${summary})`, "success");
          return;
        }
        // 세션 만료는 그 안내가 따로 뜬다
        if (isSessionExpired(res)) return;
        const json = (await res.json().catch(() => null)) as ApiErrorResponse | null;
        toast(json?.error?.message || "되돌리지 못했습니다.", "error");
      } catch {
        toast("되돌리지 못했습니다.", "error");
      }
    }

    toast(summary, "success", { action: { label: "되돌리기", onClick: revert } });
  }, [timerId, toast]);
}
