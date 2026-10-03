"use client";

import { useEffect } from "react";
import { applyOverlayMode } from "@/lib/overlay-mode";
import { useOverlayRecovery } from "@/hooks/useOverlayRecovery";

// 오버레이 렌더 오류 경계. 방송 화면에 오류 문구가 보이지 않게 아무것도 그리지 않고,
// 투명 배경과 오버레이 모드를 다시 적용한 뒤 스스로 복구를 시도한다.
// retry()는 매번 router.refresh()로 RSC 요청을 보내 요청 한도를 소모하므로 reset()만 쓴다.
export default function OverlayError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => applyOverlayMode("transparent"), []);
  useOverlayRecovery(reset);
  return null;
}
