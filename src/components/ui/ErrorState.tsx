"use client";

import { Button } from "@/components/ui/Button";
import { AlertCircleIcon } from "@/components/ui/Icons";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  message = "데이터를 불러오는데 실패했습니다.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/30">
        <AlertCircleIcon className="w-7 h-7 text-red-500" />
      </div>
      <p className="mt-4 text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          다시 시도
        </Button>
      )}
    </div>
  );
}
