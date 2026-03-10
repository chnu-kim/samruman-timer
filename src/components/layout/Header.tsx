"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
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
    <header className="border-b border-foreground/10">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-bold">
            삼루먼타이머
          </Link>
          <nav aria-label="메인 네비게이션">
            <Link
              href="/projects"
              className="text-sm text-foreground/60 hover:text-foreground transition-colors"
            >
              프로젝트
            </Link>
          </nav>
        </div>

        <div className={cn("flex items-center gap-3", !loaded && "invisible")}>
          {user ? (
            <>
              <span className="text-sm">{user.nickname}</span>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                로그아웃
              </Button>
            </>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-lg border border-foreground/20 bg-transparent px-3 h-8 text-sm font-medium hover:bg-foreground/5 transition-colors"
            >
              로그인
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
