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

      <a
        href="/api/auth/login"
        className="flex w-full items-center justify-center rounded-lg bg-foreground px-4 h-12 text-sm font-medium text-background transition-colors hover:opacity-80"
      >
        CHZZK로 로그인
      </a>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Suspense>
        <LoginContent />
      </Suspense>
    </div>
  );
}
