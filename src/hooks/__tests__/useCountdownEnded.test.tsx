// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { useCountdownEnded } from "../useCountdownEnded";
import type { TimerStatus } from "@/types";

describe("useCountdownEnded (UX-34)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(remainingSeconds: number, status: TimerStatus) {
    return renderHook(
      ({ remainingSeconds, status }) => useCountdownEnded(remainingSeconds, status),
      { initialProps: { remainingSeconds, status } },
    );
  }

  it("RUNNING 잔여가 0에 닿기 전에는 false, 닿으면 true", () => {
    const { result } = setup(3, "RUNNING");
    expect(result.current).toBe(false);

    act(() => { vi.advanceTimersByTime(2_999); });
    expect(result.current).toBe(false);

    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe(true);
  });

  it("폴링으로 새 잔여가 들어오면 그 값을 기준으로 다시 잰다", () => {
    const { result, rerender } = setup(2, "RUNNING");
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(result.current).toBe(true);

    // 다른 곳에서 시간을 추가해 서버가 다시 RUNNING 60초를 준 경우
    rerender({ remainingSeconds: 60, status: "RUNNING" });
    expect(result.current).toBe(false);

    act(() => { vi.advanceTimersByTime(59_000); });
    expect(result.current).toBe(false);
  });

  it("RUNNING이 아니면 항상 false (예약, 만료는 서버 상태를 그대로 쓴다)", () => {
    const scheduled = setup(0, "SCHEDULED");
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(scheduled.result.current).toBe(false);

    const expired = setup(0, "EXPIRED");
    expect(expired.result.current).toBe(false);
  });

  it("setTimeout 한도를 넘는 긴 잔여는 예약하지 않는다 (즉시 만료로 오인하지 않음)", () => {
    const { result } = setup(60 * 60 * 24 * 365, "RUNNING");
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(result.current).toBe(false);
  });
});
