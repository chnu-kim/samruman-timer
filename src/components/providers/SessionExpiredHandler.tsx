"use client";

import { useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import { onSessionExpired } from "@/lib/session-expired";
import { loginUrlWithNext } from "@/lib/safe-redirect";

export function SessionExpiredHandler() {
  const { toast } = useToast();

  useEffect(() => {
    return onSessionExpired(() => {
      toast("세션이 만료되었습니다. 다시 로그인해주세요.", "error");
      // 다시 로그인한 뒤 보던 화면으로 돌아오도록 현재 경로를 next로 넘긴다
      const loginUrl = loginUrlWithNext(window.location.pathname + window.location.search);
      setTimeout(() => {
        window.location.href = loginUrl;
      }, 1500);
    });
  }, [toast]);

  return null;
}
