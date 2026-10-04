"use client";

import Link from "next/link";
import { Button, buttonClassName } from "@/components/ui/Button";
import { AlertCircleIcon } from "@/components/ui/Icons";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  /** 화면의 h1. 오류·안내가 그 화면의 전부일 때(404·권한 없음) 넘긴다 */
  title?: string;
  message?: string;
  onRetry?: () => void;
  /** 다음 행동 링크 하나. 재시도할 수 없는 안내에서 돌아갈 곳을 준다 */
  action?: { href: string; label: string };
  /**
   * error: 실패해서 다시 시도할 수 있는 오류(빨간 아이콘).
   * neutral: 찾을 수 없음·권한 없음처럼 정상적인 안내(중립 아이콘).
   */
  tone?: "error" | "neutral";
  /**
   * 화면 일부(섹션 본문)만 실패했을 때의 한 줄 양식: '…불러오지 못했습니다 · 다시 시도'.
   * 아이콘·제목 없이 섹션 안에 들어가고, 빈 상태 문구 자리를 대신한다
   */
  compact?: boolean;
  className?: string;
}

export function ErrorState({
  title,
  message = title ? undefined : "데이터를 불러오지 못했습니다.",
  onRetry,
  action,
  tone = "error",
  compact = false,
  className,
}: ErrorStateProps) {
  if (compact) {
    return (
      <div className={cn("flex flex-wrap items-center justify-center gap-x-1.5 py-8 text-center text-sm text-muted-foreground", className)}>
        <p>{message}</p>
        {onRetry && (
          <>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-control px-1.5 py-1 pointer-coarse:min-h-11 font-medium text-accent hover:bg-accent-light transition-colors"
            >
              다시 시도
            </button>
          </>
        )}
      </div>
    );
  }
  const neutral = tone === "neutral";
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
      <div
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-full",
          neutral ? "bg-foreground/5" : "bg-red-100 dark:bg-red-950/30",
        )}
      >
        <AlertCircleIcon className={cn("w-7 h-7", neutral ? "text-muted-foreground" : "text-red-500")} />
      </div>
      {title && <h1 className="mt-4 text-lg font-semibold text-foreground">{title}</h1>}
      {message && <p className={cn(title ? "mt-1" : "mt-4", "text-muted-foreground")}>{message}</p>}
      {onRetry && (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          다시 시도
        </Button>
      )}
      {action && (
        // Button은 <button>이라 링크에는 같은 secondary·md 모양의 클래스를 입힌다
        <Link href={action.href} className={buttonClassName({ variant: "secondary", className: "mt-4" })}>
          {action.label}
        </Link>
      )}
    </div>
  );
}
