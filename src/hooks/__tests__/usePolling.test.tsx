// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { usePolling } from "../usePolling";

describe("usePolling 연결 상태 (C027)", () => {
  let onLine = true;

  beforeEach(() => {
    vi.useFakeTimers();
    onLine = true;
    vi.spyOn(navigator, "onLine", "get").mockImplementation(() => onLine);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // 타이머를 진행시키고 조회 promise 체인이 끝날 때까지 기다린다
  async function tick(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  it("한 번 실패로는 끊김이 아니고, 두 번 연속 실패하면 끊김 + 마지막 성공 시각", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("down"));
    const start = Date.now();
    const { result } = renderHook(() => usePolling({ fn, interval: 5000, enabled: true }));

    await tick(5000);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.current.disconnected).toBe(false);

    await tick(5000);
    expect(result.current.disconnected).toBe(true);
    expect(result.current.lastSuccessAtMs).toBe(start);
  });

  it("실패 사이에 성공이 끼면 횟수가 초기화된다", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("down"));
    const { result } = renderHook(() => usePolling({ fn, interval: 5000, enabled: true }));

    await tick(15000);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(result.current.disconnected).toBe(false);
  });

  it("offline 이벤트면 바로 끊김, online 이벤트면 즉시 다시 조회하고 성공해야 풀린다", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePolling({ fn, interval: 5000, enabled: true }));

    onLine = false;
    await act(async () => { window.dispatchEvent(new Event("offline")); });
    expect(result.current.disconnected).toBe(true);
    expect(fn).not.toHaveBeenCalled();

    onLine = true;
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.current.disconnected).toBe(false);
    expect(result.current.lastSuccessAtMs).toBeNull();
  });

  it("online 직후 조회가 실패하면 끊김을 유지한다", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => usePolling({ fn, interval: 5000, enabled: true }));

    await act(async () => { window.dispatchEvent(new Event("offline")); });
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.current.disconnected).toBe(true);
  });

  it("처음부터 오프라인이면 끊김으로 시작한다", () => {
    onLine = false;
    const fn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePolling({ fn, interval: 5000, enabled: true }));
    expect(result.current.disconnected).toBe(true);
  });

  it("enabled가 꺼지면 상태를 되돌리고 조회를 멈춘다", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("down"));
    const { result, rerender } = renderHook(
      ({ enabled }) => usePolling({ fn, interval: 5000, enabled }),
      { initialProps: { enabled: true } },
    );
    await tick(10000);
    expect(result.current.disconnected).toBe(true);

    rerender({ enabled: false });
    expect(result.current.disconnected).toBe(false);
    await tick(10000);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
