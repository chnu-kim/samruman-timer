"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { LogoIcon, LogOutIcon } from "@/components/ui/Icons";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { loginUrlWithNext } from "@/lib/safe-redirect";
import { cn } from "@/lib/utils";
import type { MeResponse } from "@/types";

interface HeaderProps {
  initialUser?: MeResponse | null;
}

export function Header({ initialUser }: HeaderProps = {}) {
  const [user, setUser] = useState<MeResponse | null>(initialUser ?? null);
  const [loaded, setLoaded] = useState(initialUser !== undefined);
  // 로그인 화면에는 본문에 로그인 버튼이 있어, 같은 화면을 다시 여는 헤더 링크를 두지 않는다
  const onLoginPage = usePathname() === "/login";

  useEffect(() => {
    if (initialUser !== undefined) return;
    fetch("/api/auth/me")
      .then(async (res) => {
        if (res.ok) {
          const json = (await res.json()) as { data: MeResponse };
          setUser(json.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
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
          <Link href="/" className="flex items-center gap-2 text-base sm:text-lg font-bold text-accent whitespace-nowrap">
            <LogoIcon className="w-5 h-5" />
            삼루먼타이머
          </Link>
          <nav aria-label="메인 네비게이션" className="hidden sm:block">
            <Link
              href="/projects"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              프로젝트
            </Link>
          </nav>
        </div>

        <div className={cn("flex items-center gap-2 shrink-0", !loaded && "invisible")}>
          <ThemeToggle />
          {user ? (
            <>
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                  {user.nickname.charAt(0)}
                </span>
                <span className="hidden sm:inline text-sm">{user.nickname}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={handleLogout} aria-label="로그아웃">
                <LogOutIcon className="w-4 h-4 sm:hidden" />
                <span className="hidden sm:inline">로그아웃</span>
              </Button>
            </>
          ) : onLoginPage ? null : (
            <Link
              href="/login"
              onClick={handleLoginClick}
              className="inline-flex items-center justify-center rounded-lg border border-border bg-transparent px-3 h-8 text-sm font-medium hover:bg-foreground/5 transition-colors"
            >
              로그인
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
