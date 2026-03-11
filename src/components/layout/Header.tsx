"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TimerIcon } from "@/components/ui/Icons";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { cn } from "@/lib/utils";
import type { MeResponse } from "@/types";

interface HeaderProps {
  initialUser?: MeResponse | null;
}

export function Header({ initialUser }: HeaderProps = {}) {
  const [user, setUser] = useState<MeResponse | null>(initialUser ?? null);
  const [loaded, setLoaded] = useState(initialUser !== undefined);

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

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold text-accent">
            <TimerIcon className="w-5 h-5" />
            삼루먼타이머
          </Link>
          <nav aria-label="메인 네비게이션">
            <Link
              href="/projects"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              프로젝트
            </Link>
          </nav>
        </div>

        <div className={cn("flex items-center gap-2", !loaded && "invisible")}>
          <ThemeToggle />
          {user ? (
            <>
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                  {user.nickname.charAt(0)}
                </span>
                <span className="text-sm">{user.nickname}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                로그아웃
              </Button>
            </>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-lg border border-border bg-transparent px-3 h-8 text-sm font-medium hover:bg-foreground/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              로그인
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
