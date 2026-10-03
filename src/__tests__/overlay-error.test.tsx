// @vitest-environment jsdom
import { render, cleanup } from "@testing-library/react";
import OverlayError from "@/app/timers/[id]/overlay/error";
import { __resetOverlayRecoveryForTest, clearRecovery, MAX_RELOADS, reloadPage } from "@/lib/overlay-recovery";

vi.mock("@/lib/overlay-recovery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/overlay-recovery")>();
  return { ...actual, reloadPage: vi.fn() };
});

const RELOAD_KEY = "overlay-reload-count";
const error = Object.assign(new Error("render failed"), { digest: undefined });

/** reset()이 실패하면 Next 오류 경계는 오류 컴포넌트를 새로 마운트한다. 그 흐름을 흉내 낸다 */
function mountAgain(reset: () => void) {
  cleanup();
  return render(<OverlayError error={error} reset={reset} />);
}

describe("오버레이 렌더 오류 경계", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetOverlayRecoveryForTest();
    window.sessionStorage.clear();
    vi.mocked(reloadPage).mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("아무것도 그리지 않고 투명 배경과 오버레이 모드를 다시 적용한다", () => {
    const { container } = render(<OverlayError error={error} reset={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
    expect(document.body.classList.contains("overlay-mode")).toBe(true);
    expect(document.body.style.getPropertyValue("background")).toBe("transparent");
    expect(document.querySelectorAll("#overlay-style")).toHaveLength(1);
    expect(document.getElementById("overlay-style")?.textContent).toContain("display: none");
  });

  it("언마운트하면 오버레이 모드와 예약된 reset을 정리한다", () => {
    const reset = vi.fn();
    const { unmount } = render(<OverlayError error={error} reset={reset} />);
    unmount();

    expect(document.body.classList.contains("overlay-mode")).toBe(false);
    expect(document.getElementById("overlay-style")).toBeNull();
    vi.advanceTimersByTime(600_000);
    expect(reset).not.toHaveBeenCalled();
  });

  it("reset을 5초부터 두 배씩, 최대 60초 간격으로 예약한다(다시 마운트돼도 이어서 센다)", () => {
    const reset = vi.fn();
    render(<OverlayError error={error} reset={reset} />);

    for (const delay of [5_000, 10_000, 20_000, 40_000, 60_000]) {
      vi.advanceTimersByTime(delay - 1);
      expect(reset).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(reset).toHaveBeenCalledTimes(1);
      reset.mockClear();
      mountAgain(reset);
    }
  });

  it("reset이 5번 실패하면 reload하고, reload는 장애당 2번까지만 한다", () => {
    const reset = vi.fn();
    // 앞선 5번의 reset 실패
    render(<OverlayError error={error} reset={reset} />);
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(60_000);
      mountAgain(reset);
    }
    expect(reloadPage).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(RELOAD_KEY)).toBe("1");

    // reload 뒤 모듈 상태는 새로 시작하지만 sessionStorage 카운터는 남는다
    for (let reloadRound = 2; reloadRound <= 3; reloadRound++) {
      __resetOverlayRecoveryForTest();
      mountAgain(reset);
      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(60_000);
        mountAgain(reset);
      }
    }
    expect(reloadPage).toHaveBeenCalledTimes(MAX_RELOADS);
    expect(window.sessionStorage.getItem(RELOAD_KEY)).toBe(String(MAX_RELOADS));

    // 상한에 닿으면 60초 간격 reset을 계속한다
    reset.mockClear();
    vi.advanceTimersByTime(59_999);
    expect(reset).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("sessionStorage를 쓸 수 없으면 reload하지 않고 60초 간격 reset을 계속한다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    const reset = vi.fn();
    render(<OverlayError error={error} reset={reset} />);
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(60_000);
      mountAgain(reset);
    }

    expect(reloadPage).not.toHaveBeenCalled();
    expect(reset).toHaveBeenCalledTimes(6);
  });

  it("카운터는 읽히지만 저장이 실패하면(QuotaExceeded 등) reload하지 않고 60초 뒤 reset한다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    const reset = vi.fn();
    render(<OverlayError error={error} reset={reset} />);
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(60_000);
      mountAgain(reset);
    }
    expect(reset).toHaveBeenCalledTimes(5);
    expect(reloadPage).not.toHaveBeenCalled();

    // reload 차례였지만 기록하지 못했으므로 60초 간격 reset으로 버틴다
    reset.mockClear();
    vi.advanceTimersByTime(59_999);
    expect(reset).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it("오버레이가 회복되면(clearRecovery) reset 간격과 reload 상한을 되돌린다", () => {
    window.sessionStorage.setItem(RELOAD_KEY, String(MAX_RELOADS));
    const reset = vi.fn();
    render(<OverlayError error={error} reset={reset} />);
    vi.advanceTimersByTime(5_000);
    mountAgain(reset);

    clearRecovery();
    expect(window.sessionStorage.getItem(RELOAD_KEY)).toBeNull();

    reset.mockClear();
    mountAgain(reset);
    vi.advanceTimersByTime(5_000);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
