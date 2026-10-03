// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import AppError from "@/app/error";
import GlobalError from "@/app/global-error";
import { __resetOverlayRecoveryForTest, reloadPage } from "@/lib/overlay-recovery";

vi.mock("@/lib/overlay-recovery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/overlay-recovery")>();
  return { ...actual, reloadPage: vi.fn() };
});

const withDigest = Object.assign(new Error("boom"), { digest: "123456789" });

describe("루트 오류 경계 (error.tsx)", () => {
  afterEach(cleanup);

  it("한국어 안내와 오류 코드(digest)를 보여 준다", () => {
    render(<AppError error={withDigest} reset={vi.fn()} retry={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent("문제가 발생했습니다");
    expect(screen.getByText("123456789")).toBeInTheDocument();
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
  });

  it("다시 시도는 retry를 부르고, retry가 없으면 reset을 부른다", () => {
    const retry = vi.fn();
    const reset = vi.fn();
    const { unmount } = render(<AppError error={withDigest} reset={reset} retry={retry} />);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
    unmount();

    render(<AppError error={new Error("x")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/오류 코드/)).not.toBeInTheDocument();
  });
});

describe("전역 오류 경계 (global-error.tsx)", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
    document.documentElement.removeAttribute("data-overlay");
  });

  // global-error는 html/body를 직접 그리므로 문자열로 렌더해 확인한다(서버 렌더와 같은 경로)
  it("자체 html/body에 안내·오류 코드·다시 시도 버튼을 그린다", () => {
    const html = renderToStaticMarkup(<GlobalError error={withDigest} reset={vi.fn()} />);

    expect(html).toMatch(/^<html lang="ko">/);
    expect(html).toContain("문제가 발생했습니다");
    expect(html).toContain("123456789");
    expect(html).toContain("다시 시도");
    expect(html).not.toContain("boom");
  });

  it("서버 렌더 마크업은 오버레이 경로이면 data-overlay를 붙이는 스크립트와 숨김 CSS를 담는다", () => {
    const html = renderToStaticMarkup(<GlobalError error={withDigest} reset={vi.fn()} />);
    const script = html.match(/<script>(.*?)<\/script>/)?.[1];
    expect(script).toBeDefined();
    expect(html).toContain("html[data-overlay] body > * { display: none !important; }");

    window.history.replaceState(null, "", "/timers/abc/overlay?fontSize=72");
    new Function(script!)();
    expect(document.documentElement.hasAttribute("data-overlay")).toBe(true);

    document.documentElement.removeAttribute("data-overlay");
    window.history.replaceState(null, "", "/timers/abc");
    new Function(script!)();
    expect(document.documentElement.hasAttribute("data-overlay")).toBe(false);
  });

  it("클라이언트에서 그려질 때도 오버레이 경로이면 data-overlay를 붙인다", () => {
    window.history.replaceState(null, "", "/timers/abc/overlay");
    // html/body를 그리는 컴포넌트라 document에 직접 렌더한다
    const { unmount } = render(<GlobalError error={withDigest} reset={vi.fn()} />, { container: document });
    expect(document.documentElement.hasAttribute("data-overlay")).toBe(true);
    unmount();
  });

  describe("자동 복구", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      __resetOverlayRecoveryForTest();
      window.sessionStorage.clear();
      vi.mocked(reloadPage).mockClear();
    });

    afterEach(() => {
      cleanup();
      vi.useRealTimers();
      window.sessionStorage.clear();
    });

    /** reset()이 실패하면 오류 경계가 새로 마운트되는 흐름을 흉내 낸다 */
    function mountGlobalError(reset: () => void) {
      cleanup();
      return render(<GlobalError error={withDigest} reset={reset} />, { container: document });
    }

    it("오버레이 경로이면 reset()을 백오프로 예약하고, 5번 실패하면 reload한다", () => {
      window.history.replaceState(null, "", "/timers/abc/overlay");
      const reset = vi.fn();
      mountGlobalError(reset);
      for (const delay of [5_000, 10_000, 20_000, 40_000, 60_000]) {
        vi.advanceTimersByTime(delay - 1);
        expect(reset).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(reset).toHaveBeenCalledTimes(1);
        reset.mockClear();
        mountGlobalError(reset);
      }
      expect(reloadPage).toHaveBeenCalledTimes(1);
    });

    it("오버레이 경로가 아니면 자동으로 reset하거나 reload하지 않는다", () => {
      window.history.replaceState(null, "", "/timers/abc");
      const reset = vi.fn();
      mountGlobalError(reset);
      vi.advanceTimersByTime(600_000);
      expect(reset).not.toHaveBeenCalled();
      expect(reloadPage).not.toHaveBeenCalled();
    });
  });
});
