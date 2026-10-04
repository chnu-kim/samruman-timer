"use client";

import { useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import { onSessionExpired } from "@/lib/session-expired";
import { sessionExpiredLoginUrl } from "@/lib/safe-redirect";

/** 세션 만료 안내 문구. 같은 순간 화면의 알림은 이것 하나다(조작 화면은 401에 따로 알리지 않는다) */
export const SESSION_EXPIRED_TOAST = "세션이 만료되어 로그인 화면으로 이동합니다.";

export function SessionExpiredHandler() {
  const { toast } = useToast();

  useEffect(() => {
    return onSessionExpired(() => {
      toast(SESSION_EXPIRED_TOAST, "error");
      // 다시 로그인한 뒤 보던 화면으로 돌아오도록 현재 경로를 next로 넘긴다.
      // 로그인 화면이 왜 왔는지 알리도록 만료 표시(expired=1)도 싣는다
      const loginUrl = sessionExpiredLoginUrl(window.location.pathname + window.location.search);
      setTimeout(() => {
        window.location.href = loginUrl;
      }, 1500);
    });
  }, [toast]);

  return null;
}
