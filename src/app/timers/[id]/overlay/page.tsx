"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useParams, useSearchParams } from "next/navigation";
import { formatTime } from "@/components/timer/CountdownDisplay";
import { formatDateTime } from "@/lib/utils";
import type { ApiSuccessResponse, TimerDetailResponse } from "@/types";

type Position = "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

const positionStyles: Record<Position, React.CSSProperties> = {
  center: { alignItems: "center", justifyContent: "center" },
  "top-left": { alignItems: "flex-start", justifyContent: "flex-start", padding: "24px" },
  "top-right": { alignItems: "flex-start", justifyContent: "flex-end", padding: "24px" },
  "bottom-left": { alignItems: "flex-end", justifyContent: "flex-start", padding: "24px" },
  "bottom-right": { alignItems: "flex-end", justifyContent: "flex-end", padding: "24px" },
};

function isValidPosition(value: string): value is Position {
  return value in positionStyles;
}

export default function TimerOverlayPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const timerId = params.id;

  const fontSize = searchParams.get("fontSize") || "72";
  const color = searchParams.get("color") || "#ffffff";
  const bg = searchParams.get("bg") || "transparent";
  const showTitle = searchParams.get("showTitle") === "true";
  const showEndDate = searchParams.get("showEndDate") === "true";
  const shadow = searchParams.get("shadow") !== "false"; // 기본 활성화: OBS에서 가독성 확보
  const positionParam = searchParams.get("position") || "center";
  const position: Position = isValidPosition(positionParam) ? positionParam : "center";

  const [timer, setTimer] = useState<TimerDetailResponse | null>(null);
  const [displayed, setDisplayed] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
        setDisplayed(json.data.remainingSeconds);
      }
    } catch {
      // ignore
    }
  }, [timerId]);

  // 5초 폴링
  useEffect(() => {
    fetchTimer();
    const interval = setInterval(fetchTimer, 5_000);
    return () => clearInterval(interval);
  }, [fetchTimer]);

  // RUNNING 상태에서 클라이언트 1초 카운트다운 (Date.now 기반)
  useEffect(() => {
    if (!timer || timer.status !== "RUNNING" || timer.remainingSeconds <= 0) return;

    const startTime = Date.now();
    const startValue = timer.remainingSeconds;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const next = Math.max(0, startValue - elapsed);
      setDisplayed(next);
      if (next <= 0) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [timer]);

  const isExpired =
    timer?.status === "EXPIRED" || (timer?.status !== "SCHEDULED" && displayed <= 0 && timer !== null);
  const isScheduled = timer?.status === "SCHEDULED";

  const fontSizePx = parseInt(fontSize, 10) || 72;
  const titleFontSize = Math.round(fontSizePx * 0.35);
  const labelFontSize = Math.round(fontSizePx * 0.3);
  const textShadow = shadow
    ? "0 2px 8px rgba(0,0,0,0.7), 0 0 2px rgba(0,0,0,0.5)"
    : "none";

  const containerStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: bg,
    display: "flex",
    flexDirection: position === "center" ? "column" : undefined,
    flexWrap: "wrap",
    alignContent: positionStyles[position].alignItems,
    zIndex: 9999,
    fontFamily: "var(--font-geist-mono), monospace",
    ...positionStyles[position],
  };

  if (!mounted) return null;

  const textColor = isExpired ? "#ef4444" : isScheduled ? "#a855f7" : color;

  const textAlign = position === "center"
    ? "center" as const
    : position.endsWith("right")
      ? "right" as const
      : "left" as const;

  const overlay = (
    <div style={containerStyle}>
      {timer && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: position === "center"
              ? "center"
              : position.endsWith("right")
                ? "flex-end"
                : "flex-start",
            gap: `${Math.round(fontSizePx * 0.08)}px`,
            textAlign,
          }}
        >
          {showTitle && (
            <span
              style={{
                color: textColor,
                fontSize: `${titleFontSize}px`,
                fontFamily: "var(--font-noto-kr), sans-serif",
                fontWeight: 600,
                lineHeight: 1.3,
                whiteSpace: "nowrap",
                textShadow,
              }}
            >
              {timer.title}
            </span>
          )}
          <span
            role="timer"
            aria-label={isScheduled ? `예약 시간 ${formatTime(displayed)}` : `남은 시간 ${formatTime(displayed)}`}
            style={{
              color: textColor,
              fontSize: `${fontSizePx}px`,
              fontWeight: 700,
              lineHeight: 1,
              whiteSpace: "nowrap",
              letterSpacing: "-0.02em",
              textShadow,
              ...(isExpired ? { animation: "pulse-expired 2s ease-in-out infinite" } : {}),
            }}
          >
            {formatTime(displayed)}
          </span>
          {isExpired && (
            <span
              style={{
                color: "#ef4444",
                fontSize: `${labelFontSize}px`,
                fontWeight: 600,
                lineHeight: 1,
                textShadow,
                animation: "pulse-expired 2s ease-in-out infinite",
              }}
            >
              만료됨
            </span>
          )}
          {isScheduled && (
            <span
              style={{
                color: "#a855f7",
                fontSize: `${labelFontSize}px`,
                fontWeight: 600,
                lineHeight: 1,
                textShadow,
              }}
            >
              시작 대기 중
            </span>
          )}
          {showEndDate && !isExpired && !isScheduled && timer.status === "RUNNING" && displayed > 0 && (
            <span
              style={{
                color: textColor,
                fontSize: `${labelFontSize}px`,
                fontWeight: 500,
                lineHeight: 1,
                opacity: 0.8,
                textShadow,
              }}
            >
              종료 예정 · {formatDateTime(new Date(Date.now() + displayed * 1000).toISOString())}
              {(() => {
                const startedAt = timer.scheduledStartAt ?? timer.createdAt;
                const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
                return elapsed > 0 ? ` (${formatTime(elapsed)} 경과)` : "";
              })()}
            </span>
          )}
        </div>
      )}
    </div>
  );

  return createPortal(overlay, document.body);
}
