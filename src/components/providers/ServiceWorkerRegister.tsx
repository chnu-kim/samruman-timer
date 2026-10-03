"use client";

import { useEffect } from "react";
import { isOverlayPath, SW_SCRIPT_PATH } from "@/lib/pwa";

/**
 * /sw.js를 등록한다. 프로덕션 여부는 서버 컴포넌트(layout.tsx)가 판단해 이 컴포넌트를 렌더할지 정한다.
 * next dev에서 SW가 돌면 HMR 자산이 캐시와 엉키므로 개발 중에는 대신 ServiceWorkerCleanup이 남은 SW를 지운다.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // 오버레이는 OBS 브라우저 소스(CEF)에서 열린다. 방송 화면에 영향이 없도록 등록 자체를 하지 않는다.
    // 이미 등록된 SW가 있는 브라우저에서도 sw.js가 오버레이 문서와 그 문서가 보낸 청크 요청은 넘긴다.
    if (isOverlayPath(window.location.pathname)) return;

    navigator.serviceWorker.register(SW_SCRIPT_PATH, { scope: "/" }).catch(() => {
      // 등록 실패는 앱 동작에 영향이 없으므로 무시한다 (설치·오프라인 안내만 빠진다)
    });
  }, []);

  return null;
}
