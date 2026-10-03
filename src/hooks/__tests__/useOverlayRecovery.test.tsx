// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { useOverlayRecovery } from "@/hooks/useOverlayRecovery";
import { __resetOverlayRecoveryForTest, reloadPage } from "@/lib/overlay-recovery";

vi.mock("@/lib/overlay-recovery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/overlay-recovery")>();
  return { ...actual, reloadPage: vi.fn() };
});

describe("useOverlayRecovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetOverlayRecoveryForTest();
    window.sessionStorage.clear();
    vi.mocked(reloadPage).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("enabled=false면 reset도 reload도 예약하지 않는다", () => {
    const reset = vi.fn();
    renderHook(() => useOverlayRecovery(reset, false));
    vi.advanceTimersByTime(600_000);
    expect(reset).not.toHaveBeenCalled();
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it("enabled가 true로 바뀌면 첫 reset을 5초 뒤에 예약한다", () => {
    const reset = vi.fn();
    const { rerender } = renderHook(({ enabled }) => useOverlayRecovery(reset, enabled), {
      initialProps: { enabled: false },
    });
    rerender({ enabled: true });
    vi.advanceTimersByTime(4_999);
    expect(reset).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
