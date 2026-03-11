"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // OAuth 콜백은 API route에서 처리되므로
    // 이 페이지에 직접 도달한 경우 홈으로 리다이렉트
    router.replace("/");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">
        로그인 처리 중...
      </p>
    </div>
  );
}
