"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  /** 토스트 안의 버튼 하나(예: 되돌리기). 누르면 실행하고 토스트를 닫는다 */
  action?: ToastAction;
  /** 표시 시간(ms). 기본 3초, 버튼이 있으면 6초 */
  duration?: number;
}

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
  duration: number;
  exiting?: boolean;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 3000;
const ACTION_DURATION_MS = 6000;
const EXIT_MS = 200;

let toastId = 0;

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const variantStyles: Record<ToastVariant, string> = {
  success: "border-green-500/30 bg-green-50 text-green-800 dark:bg-green-950/50 dark:text-green-300",
  error: "border-red-500/30 bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-300",
  info: "border-accent/30 bg-accent-light text-accent dark:text-accent",
};

const iconPaths: Record<ToastVariant, string> = {
  success: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  error: "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z",
  info: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
};

/**
 * 토스트는 한 번에 하나다. 새 토스트가 이전 것을 바로 교체한다(연속 조작에서 쌓이지 않게).
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<ToastItem | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (removeTimerRef.current) clearTimeout(removeTimerRef.current);
    hideTimerRef.current = null;
    removeTimerRef.current = null;
  }, []);

  const scheduleHide = useCallback((id: number, duration: number) => {
    clearTimers();
    hideTimerRef.current = setTimeout(() => {
      setCurrent((prev) => (prev?.id === id ? { ...prev, exiting: true } : prev));
      removeTimerRef.current = setTimeout(() => {
        setCurrent((prev) => (prev?.id === id ? null : prev));
      }, EXIT_MS);
    }, duration);
  }, [clearTimers]);

  const toast = useCallback((message: string, variant: ToastVariant = "info", options: ToastOptions = {}) => {
    const id = ++toastId;
    const duration = options.duration ?? (options.action ? ACTION_DURATION_MS : DEFAULT_DURATION_MS);
    setCurrent({ id, message, variant, action: options.action, duration });
    scheduleHide(id, duration);
  }, [scheduleHide]);

  useEffect(() => clearTimers, [clearTimers]);

  function dismiss() {
    clearTimers();
    setCurrent(null);
  }

  // 버튼이 있는 토스트는 마우스를 올리거나 포커스가 들어간 동안 닫지 않는다(시간 제한 안에 누를 수 있게).
  // 이미 사라지는 중(exiting)이면 멈추지 않는다. 제거 타이머까지 지우면 보이지 않는 토스트가 남는다
  function pause() {
    if (current?.action && !current.exiting) clearTimers();
  }
  function resume() {
    if (current?.action && !current.exiting) scheduleHide(current.id, current.duration);
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* 컨테이너는 탭을 아래(모바일 하단 빠른 액션 바 등)로 통과시킨다. 버튼이 있는 토스트만 포인터를 받는다.
          모바일 하단 바가 있으면 그 바로 위(--quick-bar-h, globals.css)에, 없으면 홈 인디케이터(safe-area) 위에 띄운다 */}
      <div className="fixed left-4 right-4 bottom-[calc(var(--quick-bar-h,env(safe-area-inset-bottom,0px))+0.5rem)] md:bottom-4 z-50 flex flex-col items-stretch gap-2 pointer-events-none md:left-auto md:items-end">
        {current && (
          // 바깥은 불투명 배경(다크의 반투명 틴트 아래로 콘텐츠가 비치지 않게), 안쪽이 변형 색
          <div
            key={current.id}
            className={cn("rounded-lg bg-background shadow-md", current.action && "pointer-events-auto")}
            style={{
              animation: current.exiting
                ? `toast-out ${EXIT_MS / 1000}s ease-in forwards`
                : `toast-in ${EXIT_MS / 1000}s ease-out`,
            }}
            // 터치의 탭은 mouseenter만 흉내 내고 leave가 없어 멈춘 채 남는다. 마우스 포인터일 때만 멈춘다
            onPointerEnter={(e) => e.pointerType === "mouse" && pause()}
            onPointerLeave={(e) => e.pointerType === "mouse" && resume()}
            onFocus={pause}
            onBlur={resume}
            // 오류는 개별 alert로 즉시 읽힌다. 성공·정보는 아래 상시 live region이 읽는다
            role={current.variant === "error" ? "alert" : undefined}
          >
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg border text-sm font-medium",
                current.action ? "py-1 pl-4 pr-1" : "px-4 py-3",
                variantStyles[current.variant],
              )}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={iconPaths[current.variant]} />
              </svg>
              <span className="min-w-0 flex-1">{current.message}</span>
              {current.action && (
                <button
                  type="button"
                  onClick={() => {
                    const action = current.action;
                    dismiss();
                    action?.onClick();
                  }}
                  className="min-h-11 shrink-0 rounded-control px-3 font-semibold underline underline-offset-2 hover:bg-foreground/10"
                >
                  {current.action.label}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {/* 성공·정보 토스트용 live region. 토스트와 함께 새로 삽입된 role=status 노드는
          스크린리더가 읽지 않을 수 있으므로 영역은 항상 렌더하고 내용만 바꾼다 */}
      <div role="status" aria-live="polite" className="sr-only">
        {current && current.variant !== "error" && (
          <p key={current.id}>{current.message}</p>
        )}
      </div>
    </ToastContext.Provider>
  );
}
