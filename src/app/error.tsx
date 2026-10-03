"use client";

import { ErrorState } from "@/components/ui/ErrorState";

// 루트 레이아웃 아래 페이지의 렌더 오류 경계. 헤더·푸터는 그대로 두고 본문만 안내로 바꾼다.
// retry()는 서버 컴포넌트를 다시 받아 와서 reset()만으로는 회복되지 않는 오류도 다시 시도한다.
export default function AppError({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset: () => void;
}) {
  return (
    <div role="alert">
      <ErrorState
        message="화면을 표시하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요."
        onRetry={() => (retry ?? reset)()}
      />
      {error.digest && (
        <p className="-mt-8 text-center text-xs text-muted-foreground">
          오류 코드: <span className="font-mono select-all">{error.digest}</span>
        </p>
      )}
    </div>
  );
}
