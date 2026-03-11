"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CountdownDisplay } from "@/components/timer/CountdownDisplay";
import type { ApiSuccessResponse, TimerDetailResponse } from "@/types";

export default function TimerOverlayPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const timerId = params.id;

  const fontSize = searchParams.get("fontSize") || "96";
  const color = searchParams.get("color") || "#ffffff";
  const bg = searchParams.get("bg") || "transparent";

  const [timer, setTimer] = useState<TimerDetailResponse | null>(null);

  // 오버레이 모드: 헤더/푸터 숨기고 body 배경 투명 처리
  useEffect(() => {
    document.body.style.background = bg;
    document.body.classList.add("overlay-mode");
    const style = document.createElement("style");
    style.id = "overlay-style";
    style.textContent = `
      .overlay-mode header, .overlay-mode footer, .overlay-mode main {
        display: none !important;
      }
      .overlay-mode { background: ${bg} !important; }
    `;
    document.head.appendChild(style);

    return () => {
      document.body.classList.remove("overlay-mode");
      document.body.style.background = "";
      document.getElementById("overlay-style")?.remove();
    };
  }, [bg]);

  const fetchTimer = useCallback(async () => {
    try {
      const res = await fetch(`/api/timers/${timerId}`);
      if (res.ok) {
        const json = (await res.json()) as ApiSuccessResponse<TimerDetailResponse>;
        setTimer(json.data);
      }
    } catch {
      // ignore
    }
  }, [timerId]);

  useEffect(() => {
    fetchTimer();
    const interval = setInterval(fetchTimer, 30_000);
    return () => clearInterval(interval);
  }, [fetchTimer]);

  if (!timer) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
        }}
      />
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color,
        fontSize: `${fontSize}px`,
        fontFamily: "var(--font-geist-mono), monospace",
        zIndex: 9999,
      }}
    >
      <CountdownDisplay
        remainingSeconds={timer.remainingSeconds}
        status={timer.status}
        scheduledStartAt={timer.scheduledStartAt}
        size="large"
        className="!text-[inherit]"
      />
    </div>
  );
}
