"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  return (
    <div className="w-full max-w-sm space-y-6 px-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          삼루먼타이머
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          CHZZK 계정으로 로그인하세요
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-center text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400" role="alert">
          로그인에 실패했습니다. 다시 시도해주세요.
        </div>
      )}

      {/* API 라우트로 전체 이동해야 하므로 <a>를 두고, 공용 Button primary와 같은 색·포커스 스타일을 쓴다 */}
      <a
        href="/api/auth/login"
        className="flex w-full items-center justify-center rounded-lg bg-accent px-4 h-12 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        CHZZK로 로그인
      </a>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-background">
      <Suspense>
        <LoginContent />
      </Suspense>
    </div>
  );
}
