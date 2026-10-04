import { useEffect, useRef, useState } from "react";
import { DISCONNECT_FAILURE_THRESHOLD, isDisconnected } from "@/lib/connection-status";

interface UsePollingOptions {
  /** 한 번의 조회. 서버 값을 받지 못했으면 reject(throw)해서 실패로 알린다 */
  fn: () => Promise<void>;
  interval: number;
  enabled: boolean;
}

interface PollingConnection {
  /** 폴링이 연속으로 실패했거나 브라우저가 오프라인이다. 다음 성공 응답에서 풀린다 */
  disconnected: boolean;
  /** 끊김 직전 마지막으로 성공한 시각(ms). 끊겨 있지 않으면 null */
  lastSuccessAtMs: number | null;
}

export function usePolling({ fn, interval, enabled }: UsePollingOptions): PollingConnection {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const [connection, setConnection] = useState<PollingConnection>({ disconnected: false, lastSuccessAtMs: null });

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    let failures = 0;
    // enabled가 켜지는 시점은 첫 조회가 막 성공한 뒤다
    let lastSuccessAtMs = Date.now();

    function update() {
      const disconnected = isDisconnected(failures);
      setConnection((prev) => {
        const next = { disconnected, lastSuccessAtMs: disconnected ? lastSuccessAtMs : null };
        return prev.disconnected === next.disconnected && prev.lastSuccessAtMs === next.lastSuccessAtMs ? prev : next;
      });
    }

    function run() {
      Promise.resolve()
        .then(() => fnRef.current())
        .then(
          () => {
            if (cancelled) return;
            failures = 0;
            lastSuccessAtMs = Date.now();
            update();
          },
          () => {
            if (cancelled) return;
            failures += 1;
            update();
          },
        );
    }

    function start() {
      if (timer) return;
      timer = setInterval(run, interval);
    }

    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function handleVisibility() {
      if (document.hidden) {
        stop();
      } else {
        run();
        start();
      }
    }

    // 오프라인이면 실패를 기다리지 않고 바로 끊김으로 본다. 다시 온라인이 되면 곧바로 조회하고, 그 응답이 성공해야 풀린다
    function handleOffline() {
      failures = Math.max(failures, DISCONNECT_FAILURE_THRESHOLD);
      update();
    }

    function handleOnline() {
      if (!document.hidden) run();
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) handleOffline();
    start();
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      setConnection({ disconnected: false, lastSuccessAtMs: null });
    };
  }, [interval, enabled]);

  return connection;
}
