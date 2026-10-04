"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sanitizeNextPath } from "@/lib/safe-redirect";
import { SITE_SUMMARY, SITE_TAGLINE } from "@/lib/site";

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  // 세션 만료로 온 경우 로그인 후 돌아갈 경로. 서버(로그인·콜백)에서도 다시 검증한다
  const next = sanitizeNextPath(searchParams.get("next"));
  const loginHref = next ? `/api/auth/login?next=${encodeURIComponent(next)}` : "/api/auth/login";
  const router = useRouter();

  // 이미 로그인한 사용자는 돌아갈 곳(next, 없으면 목록)으로 보낸다. 로그인 실패(?error=)로 온 경우는
  // 안내를 보여야 하고 되돌려 보내면 실패가 반복될 수 있어 머문다.
  // authFetch를 쓰지 않는다: 401이면 세션 만료 이벤트가 다시 /login으로 보내 제자리를 돈다(Header와 같은 이유)
  useEffect(() => {
    if (error) return;
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => {
        if (res.ok && !cancelled) router.replace(next ?? "/projects");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [error, next, router]);

  return (
    <div className="w-full max-w-sm space-y-6 px-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {SITE_TAGLINE}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {SITE_SUMMARY}
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-center text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400" role="alert">
          로그인에 실패했습니다. 다시 시도해 주세요.
        </div>
      )}

      {/* API 라우트로 전체 이동해야 하므로 <a>를 두고, 공용 Button primary와 같은 색·포커스 스타일을 쓴다 */}
      <a
        href={loginHref}
        className="flex w-full items-center justify-center text-center rounded-lg bg-accent px-4 h-12 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
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
