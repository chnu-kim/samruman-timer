"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams, useSearchParams } from "next/navigation";
import { formatTime } from "@/components/timer/CountdownDisplay";
import { detectTimerChange, isStaleResponse, type TimerSnapshot } from "@/lib/overlay-animation";
import { formatEndTime } from "@/lib/utils";
import { isOverlayBackground, isOverlayColor } from "@/lib/overlay-style";
import { applyOverlayMode } from "@/lib/overlay-mode";
import { classifyFailedResponse, nextPollDelay, type PollOutcome } from "@/lib/overlay-polling";
import { RECOVERY_STABLE_MS, clearRecovery } from "@/lib/overlay-recovery";
import { pageTitle } from "@/lib/site";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
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

function colorParam(value: string | null, fallback: string): string {
  return value && isOverlayColor(value) ? value : fallback;
}

export default function TimerOverlayPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const timerId = params.id;

  const fontSize = searchParams.get("fontSize") || "72";
  const color = colorParam(searchParams.get("color"), "#ffffff");
  const bgParam = searchParams.get("bg");
  const bg = bgParam && isOverlayBackground(bgParam) ? bgParam : "transparent";
  const showTitle = searchParams.get("showTitle") === "true";
  const showEndDate = searchParams.get("showEndDate") === "true";
  const shadow = searchParams.get("shadow") !== "false"; // 기본 활성화: OBS에서 가독성 확보
  const positionParam = searchParams.get("position") || "center";
  const position: Position = isValidPosition(positionParam) ? positionParam : "center";
  const urgentColor = colorParam(searchParams.get("urgentColor"), "#f59e0b"); // amber-500
  const criticalColor = colorParam(searchParams.get("criticalColor"), "#ef4444"); // red-500

  // 기본 활성화. 끄면 변경 효과와 긴급·만료 펄스를 모두 끈다(긴급함은 색으로 전달된다)
  const animation = searchParams.get("animation") !== "false";
  const [timer, setTimer] = useState<TimerDetailResponse | null>(null);
  const [displayed, setDisplayed] = useState(0);
  // 종료 예정 시각(ms). 렌더마다 '지금 + 남은 초'로 재면 내림 오차로 분 경계에서 두 값을 오가므로 응답을 받을 때 정한다
  const [endAtMs, setEndAtMs] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [animClass, setAnimClass] = useState<string | null>(null);
  const [floatingText, setFloatingText] = useState<string | null>(null);
  const [floatingKey, setFloatingKey] = useState(0);
  const prevTimerRef = useRef<TimerSnapshot | null>(null);
  // 폴링마다 같은 경고가 쌓이지 않게 마지막으로 경고한 원인(상태 코드·네트워크·해석 실패·처리 중 예외)을 기억한다
  const warnedRef = useRef<number | "network" | "invalid" | "exception" | null>(null);
  const warnOnce = useCallback((key: number | "network" | "invalid" | "exception", message: string) => {
    if (warnedRef.current === key) return;
    warnedRef.current = key;
    console.warn(message);
  }, []);
  // 다른 화면과 같은 '이름 | 삼루먼타이머' 모양(통계는 '… 통계', 여기는 '… 오버레이')
  useDocumentTitle(timer ? pageTitle(`${timer.title} 오버레이`) : null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 오버레이 모드: 헤더/푸터 숨기고 body 배경 투명 처리
  useEffect(() => applyOverlayMode(bg), [bg]);

  // 데이터를 그린 뒤 RECOVERY_STABLE_MS 동안 렌더 오류 없이 버티면 복구 상태(reset 횟수·reload 상한)를 되돌린다.
  // 그 전에 다시 터지면 오류 경계가 이 페이지를 언마운트하면서 예약이 취소되므로 백오프와 reload 상한이 이어진다
  const hasTimer = timer !== null;
  useEffect(() => {
    if (!hasTimer) return;
    const handle = setTimeout(clearRecovery, RECOVERY_STABLE_MS);
    return () => clearTimeout(handle);
  }, [hasTimer]);

  const fetchTimer = useCallback(async (): Promise<PollOutcome> => {
    // 직전에 본 updatedAt을 since로 보내 그 뒤의 실제 변경량 합계를 받는다('+N' 연출용)
    const since = prevTimerRef.current?.updatedAt ?? null;
    let res: Response;
    try {
      res = await fetch(
        since ? `/api/timers/${timerId}?since=${encodeURIComponent(since)}` : `/api/timers/${timerId}`,
      );
    } catch {
      warnOnce("network", "[오버레이] 서버에 연결하지 못했습니다. 잠시 후 다시 시도합니다.");
      return "network";
    }

    if (!res.ok) {
      const outcome = classifyFailedResponse(res);
      // 방송 화면에 오류 문구를 띄우면 시청자에게 그대로 보이므로 화면에는 아무것도 그리지 않고 콘솔에만 남긴다
      warnOnce(
        res.status,
        outcome === "not_found"
          ? `[오버레이] 타이머 ${timerId}를 찾을 수 없습니다. 삭제되었거나 URL이 잘못되었습니다.`
          : `[오버레이] 타이머를 불러오지 못했습니다 (HTTP ${res.status}).`,
      );
      // 타이머가 사라졌으면(삭제) 마지막 시간을 계속 세면 거짓 시간이 방송에 나가므로 화면을 비운다.
      // 5xx·네트워크 오류는 곧 회복될 수 있어 마지막 값을 유지한다
      if (outcome === "not_found") {
        prevTimerRef.current = null;
        setTimer(null);
      }
      return outcome;
    }

    let data: TimerDetailResponse;
    try {
      const json = (await res.json()) as ApiSuccessResponse<TimerDetailResponse> | null;
      // 200인데 data가 없으면(프록시·CDN이 끼워 넣은 응답 등) 해석 실패와 같이 다룬다
      if (!json?.data) throw new TypeError("응답에 data가 없습니다");
      data = json.data;
    } catch {
      // 200인데 JSON이 아니면 프록시·캐시가 끼워 넣은 엉뚱한 페이지처럼 곧 바뀌지 않을 응답으로 보고 긴 백오프를 건다
      warnOnce("invalid", "[오버레이] 서버 응답을 해석하지 못했습니다. 잠시 후 다시 시도합니다.");
      return "rate_limited";
    }

    const now = Date.now();
    if (isStaleResponse(prevTimerRef.current, data)) {
      warnedRef.current = null;
      return "ok";
    }

    // 변경 감지: updatedAt이 바뀌었으면 수동 조작 발생
    if (animation && prevTimerRef.current) {
      // 요청을 보낸 뒤 다른 응답이 먼저 반영돼 기준(since)이 바뀌었으면 합계가 겹치므로 서버 값을 쓰지 않고 추정한다
      const change = detectTimerChange(
        prevTimerRef.current,
        prevTimerRef.current.updatedAt === since ? data : { ...data, deltaSinceSeconds: undefined },
        now,
      );
      if (change) {
        setFloatingText(change.floatingText);
        setFloatingKey((k) => k + 1);
        setAnimClass(change.animClass);
      }
    }

    // 폴링마다 다시 재면 서버 잔여시간의 초 내림·응답 지연만큼 흔들려 분 경계에서 바뀌었다 돌아온다.
    // 시간이 바뀌었거나(updatedAt) 상태가 바뀐 스냅샷, 처음 받은 값에서만 다시 잡는다
    const prevSnapshot = prevTimerRef.current;
    if (!prevSnapshot || prevSnapshot.updatedAt !== data.updatedAt || prevSnapshot.status !== data.status) {
      setEndAtMs(now + data.remainingSeconds * 1000);
    }
    prevTimerRef.current = { remainingSeconds: data.remainingSeconds, updatedAt: data.updatedAt, fetchedAt: now, status: data.status };
    setTimer(data);
    setDisplayed(data.remainingSeconds);
    // 처리를 끝까지 마친 뒤에야 경고 억제를 풀어, 처리 중 예외가 반복될 때 경고가 폴링마다 쌓이지 않게 한다
    warnedRef.current = null;
    return "ok";
  }, [timerId, animation, warnOnce]);

  // 폴링: 성공하면 5초, 연속 실패하면 원인별 상한까지 간격을 두 배씩 늘린다(overlay-polling.ts)
  useEffect(() => {
    let cancelled = false;
    let handle: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const tick = async () => {
      let outcome: PollOutcome;
      try {
        outcome = await fetchTimer();
      } catch {
        // 예상하지 못한 예외에도 폴링 체인이 끊기지 않게 일시적 실패로 보고 다음 요청을 예약한다
        warnOnce("exception", "[오버레이] 서버 응답을 처리하지 못했습니다. 잠시 후 다시 시도합니다.");
        outcome = "server";
      }
      // 응답을 기다리는 사이 언마운트됐으면 다음 폴링을 예약하지 않는다
      if (cancelled) return;
      failures = outcome === "ok" ? 0 : failures + 1;
      handle = setTimeout(tick, nextPollDelay(outcome, failures));
    };
    void tick();

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [fetchTimer, warnOnce]);

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
  const isRunning = timer?.status === "RUNNING" && displayed > 0;
  const isUrgent = isRunning && displayed < 300; // 5분 미만
  const isCritical = isRunning && displayed < 60; // 1분 미만

  const fontSizePx = parseInt(fontSize, 10) || 72;
  const titleFontSize = Math.round(fontSizePx * 0.35);
  const labelFontSize = Math.round(fontSizePx * 0.3);
  const textShadow = shadow
    ? "0 2px 8px rgba(0,0,0,0.7), 0 0 2px rgba(0,0,0,0.5)"
    : "none";
  // 제목·종료 예정 같은 보조 줄은 글자가 가늘어 밝은 방송 화면에서 번져 보이므로 짧은 그림자를 겹쳐 외곽선처럼 두른다
  const subTextShadow = shadow
    ? "0 0 3px rgba(0,0,0,0.9), 0 0 3px rgba(0,0,0,0.9), 0 2px 8px rgba(0,0,0,0.7)"
    : "none";
  // 숫자(카운트다운·변경량)만 고정폭 서체다. 한글 보조 줄까지 고정폭이면 글자 폭이 벌어져 카운트다운보다 길어진다
  const monoFont = "var(--font-geist-mono), monospace";
  const sansFont = "var(--font-noto-kr), sans-serif";

  const containerStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: bg,
    display: "flex",
    flexDirection: position === "center" ? "column" : undefined,
    flexWrap: "wrap",
    alignContent: positionStyles[position].alignItems,
    zIndex: 9999,
    fontFamily: sansFont,
    ...positionStyles[position],
  };

  if (!mounted) return null;

  const textColor = isExpired
    ? "#ef4444"
    : isScheduled
      ? "#a855f7"
      : isCritical
        ? criticalColor
        : isUrgent
          ? urgentColor
          : color;

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
            position: "relative",
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
                fontFamily: sansFont,
                fontWeight: 600,
                lineHeight: 1.3,
                whiteSpace: "nowrap",
                textShadow: subTextShadow,
              }}
            >
              {timer.title}
            </span>
          )}
          {/* 변경량('+N')은 숫자 줄의 안쪽 옆에 붙여 띄운다. 위로 띄우면 제목과 겹치고 위쪽 배치에서 화면 밖으로 잘리며,
              아래로 띄우면 '만료됨'·'종료 예정' 줄과 겹치고 아래쪽 배치에서 잘린다. 숫자 줄 안에서만 움직이므로 어느 배치에서도 겹치지 않는다 */}
          <div style={{ position: "relative", display: "flex" }}>
            <span
              role="timer"
              aria-label={
                isCritical
                  ? `긴급: 남은 시간 ${formatTime(displayed)}, 1분 미만`
                  : isUrgent
                    ? `긴급: 남은 시간 ${formatTime(displayed)}, 5분 미만`
                    : isScheduled
                      ? `예약 시간 ${formatTime(displayed)}`
                      : `남은 시간 ${formatTime(displayed)}`
              }
              style={{
                color: textColor,
                fontSize: `${fontSizePx}px`,
                fontFamily: monoFont,
                fontVariantNumeric: "tabular-nums",
                fontWeight: 700,
                lineHeight: 1,
                whiteSpace: "nowrap",
                letterSpacing: "-0.02em",
                textShadow,
                ...(animClass === "overlay-anim-add"
                  ? { animation: "overlay-flash-add 0.6s ease-out" }
                  : animClass === "overlay-anim-subtract"
                    ? { animation: "overlay-flash-subtract 0.5s ease-out" }
                    : !animation
                      ? {}
                      : isExpired
                        ? { animation: "pulse-expired 2s ease-in-out infinite" }
                        : isCritical
                          ? { animation: "pulse-urgent-fast 0.8s ease-in-out infinite" }
                          : isUrgent
                            ? { animation: "pulse-urgent-slow 2s ease-in-out infinite" }
                            : {}),
              }}
              onAnimationEnd={() => {
                if (animClass) setAnimClass(null);
              }}
            >
              {formatTime(displayed)}
            </span>
            {floatingText && (
              <span
                key={floatingKey}
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: "50%",
                  // 오른쪽 배치는 숫자 왼쪽에, 나머지는 숫자 오른쪽에 둬서 화면 가장자리 쪽으로 넘치지 않게 한다
                  ...(position.endsWith("right")
                    ? { right: "100%", marginRight: `${Math.round(fontSizePx * 0.25)}px` }
                    : { left: "100%", marginLeft: `${Math.round(fontSizePx * 0.25)}px` }),
                  fontSize: `${Math.round(fontSizePx * 0.4)}px`,
                  fontFamily: monoFont,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: floatingText.startsWith("+") ? "#22c55e" : "#ef4444",
                  whiteSpace: "nowrap",
                  pointerEvents: "none",
                  animation: "overlay-float-up 1.2s ease-out forwards",
                  textShadow,
                }}
                onAnimationEnd={() => setFloatingText(null)}
              >
                {floatingText}
              </span>
            )}
          </div>
          {isExpired && (
            <span
              style={{
                color: "#ef4444",
                fontSize: `${labelFontSize}px`,
                fontWeight: 600,
                lineHeight: 1,
                textShadow: subTextShadow,
                animation: animation ? "pulse-expired 2s ease-in-out infinite" : undefined,
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
                textShadow: subTextShadow,
              }}
            >
              시작 대기 중
            </span>
          )}
          {showEndDate && !isExpired && !isScheduled && timer.status === "RUNNING" && displayed > 0 && endAtMs !== null && (
            <span
              data-testid="overlay-end-time"
              style={{
                color: textColor,
                fontSize: `${labelFontSize}px`,
                fontFamily: sansFont,
                fontVariantNumeric: "tabular-nums",
                fontWeight: 600,
                lineHeight: 1,
                whiteSpace: "nowrap",
                textShadow: subTextShadow,
              }}
            >
              {/* 생성·예약 시각부터 잰 경과는 만료 뒤 다시 시작한 타이머에서 틀리므로 붙이지 않는다(콘솔 CountdownDisplay와 같은 규칙) */}
              종료 예정 {formatEndTime(new Date(endAtMs))}
            </span>
          )}
        </div>
      )}
    </div>
  );

  return createPortal(overlay, document.body);
}
