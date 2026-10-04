"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { rememberSignedIn } from "@/lib/auth-hint";
import { SESSION_EXPIRED_PARAM, sanitizeNextPath } from "@/lib/safe-redirect";
import { fetchMe } from "@/lib/session-me";
import { SITE_SUMMARY, SITE_TAGLINE } from "@/lib/site";

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  // 세션 만료로 온 경우 로그인 후 돌아갈 경로. 서버(로그인·콜백)에서도 다시 검증한다
  const next = sanitizeNextPath(searchParams.get("next"));
  // 세션 만료로 보내졌을 때만 이유를 한 줄 알린다(헤더 '로그인'도 next를 실으므로 next로는 구분하지 않는다)
  const expired = !error && searchParams.get(SESSION_EXPIRED_PARAM) === "1";
  const loginHref = next ? `/api/auth/login?next=${encodeURIComponent(next)}` : "/api/auth/login";
  const router = useRouter();

  // 이미 로그인한 사용자는 돌아갈 곳(next, 없으면 목록)으로 보낸다. 로그인 실패(?error=)로 온 경우는
  // 안내를 보여야 하고 되돌려 보내면 실패가 반복될 수 있어 머문다.
  // 헤더도 같은 첫 로드에 세션을 확인하므로 fetchMe로 한 요청을 같이 쓴다(로그아웃 상태 401이 한 번만 난다)
  useEffect(() => {
    if (error) return;
    let cancelled = false;
    fetchMe().then((me) => {
      if (me && !cancelled) router.replace(next ?? "/projects");
    });
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

      {expired && (
        <p role="status" className="text-center text-sm text-muted-foreground">세션이 만료되어 다시 로그인합니다.</p>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-center text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400" role="alert">
          로그인에 실패했습니다. 다시 시도해 주세요.
        </div>
      )}

      {/* API 라우트로 전체 이동해야 하므로 <a>를 두고, 공용 Button primary와 같은 색·포커스 스타일을 쓴다 */}
      <a
        href={loginHref}
        // 로그인 흐름(OAuth → callback → 돌아갈 화면)의 첫 로드가 로그아웃 골격을 그려 로그인 사용자에게 이동이 생기지 않게,
        // 이동 직전에 힌트를 미리 남긴다. 실패해 /login으로 돌아오면 헤더 fetchMe의 401이 다시 지운다
        onClick={() => rememberSignedIn(true)}
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
