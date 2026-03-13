import { useEffect, useRef } from "react";

interface UsePollingOptions {
  fn: () => Promise<void>;
  interval: number;
  enabled: boolean;
}

export function usePolling({ fn, interval, enabled }: UsePollingOptions) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    function start() {
      if (timer) return;
      timer = setInterval(() => fnRef.current(), interval);
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
        fnRef.current();
        start();
      }
    }

    start();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [interval, enabled]);
}
