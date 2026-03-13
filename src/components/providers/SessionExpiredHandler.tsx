"use client";

import { useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import { onSessionExpired } from "@/lib/session-expired";

export function SessionExpiredHandler() {
  const { toast } = useToast();

  useEffect(() => {
    return onSessionExpired(() => {
      toast("세션이 만료되었습니다. 다시 로그인해주세요.", "error");
      setTimeout(() => {
        window.location.href = "/login";
      }, 1500);
    });
  }, [toast]);

  return null;
}
