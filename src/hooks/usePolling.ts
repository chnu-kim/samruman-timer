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

  // 연결 상태는 enabled가 켜져 있는 동안 이어진다. interval은 타이머 상태(낙관적 갱신과 롤백 포함)에 따라 바뀌므로,
  // interval이 바뀔 때 실패 횟수·마지막 성공 시각을 초기화하면 장애 중에 배지가 정상으로 돌아가 버린다
  const stateRef = useRef({ failures: 0, lastSuccessAtMs: 0, generation: 0 });

  useEffect(() => {
    if (!enabled) return;
    const state = stateRef.current;
    // enabled가 켜지는 시점은 첫 조회가 막 성공한 뒤다
    state.failures = 0;
    state.lastSuccessAtMs = Date.now();
    return () => {
      // 꺼진 뒤 도착한 응답은 세지 않는다
      state.generation += 1;
      setConnection({ disconnected: false, lastSuccessAtMs: null });
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const state = stateRef.current;
    let timer: ReturnType<typeof setInterval> | null = null;

    function update() {
      const disconnected = isDisconnected(state.failures);
      setConnection((prev) => {
        const next = { disconnected, lastSuccessAtMs: disconnected ? state.lastSuccessAtMs : null };
        return prev.disconnected === next.disconnected && prev.lastSuccessAtMs === next.lastSuccessAtMs ? prev : next;
      });
    }

    // interval이 바뀌기 전에 보낸 조회의 결과도 센다. enabled가 꺼진 뒤의 결과만 버린다
    function run() {
      const generation = state.generation;
      Promise.resolve()
        .then(() => fnRef.current())
        .then(
          () => {
            if (state.generation !== generation) return;
            state.failures = 0;
            state.lastSuccessAtMs = Date.now();
            update();
          },
          () => {
            if (state.generation !== generation) return;
            state.failures += 1;
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
      state.failures = Math.max(state.failures, DISCONNECT_FAILURE_THRESHOLD);
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
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [interval, enabled]);

  return connection;
}
