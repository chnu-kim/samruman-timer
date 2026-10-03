"use client";

import { useEffect } from "react";
import { SW_CACHE_PREFIX, SW_SCRIPT_PATH } from "@/lib/pwa";

/**
 * 개발 모드(next dev)에서 이 앱의 서비스워커와 캐시를 지운다.
 * next start와 next dev는 같은 localhost:3000을 쓰므로, 프로덕션 빌드를 한 번 띄웠던 브라우저에는
 * /sw.js가 남아 /_next/static/*을 캐시 우선으로 내준다. 그대로 두면 dev 청크가 낡은 채로 보일 수 있다.
 * 같은 포트를 쓰는 다른 프로젝트의 SW는 건드리지 않도록 스크립트 경로와 캐시 접두사로 거른다.
 */
export function ServiceWorkerCleanup() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) =>
          Promise.all(
            regs
              .filter((reg) => {
                const scriptURL = (reg.active ?? reg.waiting ?? reg.installing)?.scriptURL;
                return scriptURL !== undefined && new URL(scriptURL).pathname === SW_SCRIPT_PATH;
              })
              .map((reg) => reg.unregister()),
          ),
        )
        .catch(() => {});
    }
    if (typeof caches !== "undefined") {
      caches
        .keys()
        .then((names) => Promise.all(names.filter((n) => n.startsWith(SW_CACHE_PREFIX)).map((n) => caches.delete(n))))
        .catch(() => {});
    }
  }, []);

  return null;
}
