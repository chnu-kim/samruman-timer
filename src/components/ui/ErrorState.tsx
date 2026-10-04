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
}

export function ErrorState({
  title,
  message = title ? undefined : "데이터를 불러오지 못했습니다.",
  onRetry,
  action,
  tone = "error",
}: ErrorStateProps) {
  const neutral = tone === "neutral";
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
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
        <Button variant="link" className="mt-3" onClick={onRetry}>
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
