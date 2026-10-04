"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, buttonClassName } from "@/components/ui/Button";
import { LogoIcon, LogOutIcon } from "@/components/ui/Icons";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { loginUrlWithNext } from "@/lib/safe-redirect";
import { fetchMe } from "@/lib/session-me";
import { cn } from "@/lib/utils";
import type { MeResponse } from "@/types";

interface HeaderProps {
  initialUser?: MeResponse | null;
}

/** 헤더 오른쪽 액션(로그인·로그아웃)의 Button 위 보강. Button md(h-10 px-4, 터치 min-h-11)가 테마 토글과 같은 높이를 낸다: 데스크톱 40, 터치 44 */
const HEADER_ACTION = "text-sm pointer-coarse:min-w-11";

export function Header({ initialUser }: HeaderProps = {}) {
  const [user, setUser] = useState<MeResponse | null>(initialUser ?? null);
  const [loaded, setLoaded] = useState(initialUser !== undefined);
  // 로그인 화면에는 본문에 로그인 버튼이 있어, 같은 화면을 다시 여는 헤더 링크를 두지 않는다
  const onLoginPage = usePathname() === "/login";

  useEffect(() => {
    if (initialUser !== undefined) return;
    let cancelled = false;
    fetchMe().then((me) => {
      if (cancelled) return;
      setUser(me);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [initialUser]);

  // 헤더는 레이아웃에 있어 페이지 이동 때 다시 그려지지 않으므로, 누르는 시점의 경로로 next를 만든다
  function handleLoginClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const url = loginUrlWithNext(window.location.pathname + window.location.search);
    if (url === "/login") return;
    e.preventDefault();
    window.location.href = url;
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <header className="border-b border-border">
      {/* 글자를 크게 키워 한 줄에 다 들어가지 않으면 높이를 고정하지 않고 오른쪽 묶음을 다음 줄로 내린다 */}
      <div className="mx-auto flex min-h-14 max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1.5">
        <div className="flex items-center gap-3 sm:gap-6">
          {/* 한글 글꼴(Noto Sans KR)이 늦게 받아지면 서비스 이름 폭이 대체 글꼴보다 약 6px 넓어져 옆 '프로젝트' 링크가 밀린다(CLS).
              nav가 보이는 sm부터는 두 글꼴 폭을 모두 덮는 최소 폭(글자 크기 비례)을 잡아 nav 자리를 고정한다 */}
          <Link href="/" className="flex pointer-coarse:min-h-11 items-center gap-2 text-base sm:text-lg sm:min-w-[7.25em] font-bold text-accent whitespace-nowrap">
            <LogoIcon className="w-5 h-5" />
            삼루먼타이머
          </Link>
          <nav aria-label="메인 네비게이션" className="hidden sm:block">
            <Link
              href="/projects"
              className="inline-flex pointer-coarse:min-h-11 items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              프로젝트
            </Link>
          </nav>
        </div>

        <div className={cn("flex items-center gap-2 shrink-0", !loaded && "invisible")}>
          <ThemeToggle />
          {user ? (
            <>
              {/* 이니셜은 장식이라 낭독에서 빼고, 이름은 모바일에서도 스크린 리더에는 남긴다 */}
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground"
                >
                  {user.nickname.charAt(0)}
                </span>
                <span className="sr-only sm:not-sr-only text-sm">{user.nickname}</span>
              </div>
              {/* 로그인·로그아웃은 같은 모양(C129)이고 테마 토글과 같은 높이(데스크톱 40, 터치 44)다 */}
              <Button variant="secondary" onClick={handleLogout} aria-label="로그아웃" title="로그아웃" className={cn(HEADER_ACTION, "max-sm:w-10 max-sm:px-0")}>
                <LogOutIcon className="w-4 h-4 sm:hidden" />
                <span className="hidden sm:inline">로그아웃</span>
              </Button>
            </>
          ) : onLoginPage ? null : (
            // 로그아웃 Button과 같은 클래스를 쓰는 링크(스타일이 갈라지지 않게 buttonClassName으로 만든다)
            <Link
              href="/login"
              onClick={handleLoginClick}
              className={buttonClassName({ variant: "secondary", className: HEADER_ACTION })}
            >
              로그인
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
