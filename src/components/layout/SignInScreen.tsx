"use client";

import { rememberSignedIn } from "@/lib/auth-hint";
import { buttonClassName } from "@/components/ui/Button";
import { SITE_SUMMARY, SITE_TAGLINE } from "@/lib/site";

interface SignInScreenProps {
  /** 로그인 후 돌아갈 경로. 서버(로그인·콜백)에서도 다시 검증한다 */
  next?: string | null;
  /** 소개와 로그인 버튼 사이에 둘 한 줄 안내(세션 만료·로그인 실패) */
  notice?: React.ReactNode;
}

/**
 * 로그아웃 방문자의 진입 화면. /login과 로그아웃 상태의 /projects가 같은 컴포넌트를 써서
 * 같은 상황(로그인해야 쓸 수 있음)이 주소와 상관없이 같은 모양·같은 좌표로 보인다.
 * 바깥 상자(첫 화면 60% 높이 안 가운데)까지 여기서 정하므로 쓰는 쪽은 감싸지 않고 그대로 둔다.
 * 가운데 정렬 글은 text-balance로 줄 길이를 고르게 나눠 마지막 줄에 한두 낱말만 남지 않게 한다
 */
export function SignInScreen({ next, notice }: SignInScreenProps) {
  const loginHref = next ? `/api/auth/login?next=${encodeURIComponent(next)}` : "/api/auth/login";
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm space-y-6 px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-balance text-foreground">{SITE_TAGLINE}</h1>
          <p className="mt-2 text-sm text-balance text-muted-foreground">{SITE_SUMMARY}</p>
        </div>

        {notice}

        {/* API 라우트로 전체 이동해야 하므로 <a>다. 주 CTA라 공용 Button md(primary) 모양을 폭 전체로 쓴다.
            로그인 흐름(OAuth → callback → 돌아갈 화면)의 첫 로드가 로그아웃 골격을 그려 로그인 사용자에게 이동이 생기지 않게,
            이동 직전에 힌트를 미리 남긴다. 실패해 /login으로 돌아오면 헤더 fetchMe의 401이 다시 지운다 */}
        <a href={loginHref} onClick={() => rememberSignedIn(true)} className={buttonClassName({ className: "w-full text-center" })}>
          CHZZK로 로그인
        </a>
      </div>
    </div>
  );
}
