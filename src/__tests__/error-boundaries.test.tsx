// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import AppError from "@/app/error";
import GlobalError from "@/app/global-error";

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
  });

  // global-error는 html/body를 직접 그리므로 문자열로 렌더해 확인한다
  it("일반 경로에서는 자체 html/body에 안내·오류 코드·다시 시도 버튼을 그린다", () => {
    const html = renderToStaticMarkup(<GlobalError error={withDigest} reset={vi.fn()} />);

    expect(html).toMatch(/^<html lang="ko">/);
    expect(html).toContain("<body>");
    expect(html).toContain("문제가 발생했습니다");
    expect(html).toContain("123456789");
    expect(html).toContain("다시 시도");
    expect(html).not.toContain("boom");
  });

  it("오버레이 경로에서는 방송 화면에 아무 문구도 그리지 않는다", () => {
    window.history.replaceState(null, "", "/timers/abc/overlay?fontSize=72");
    const html = renderToStaticMarkup(<GlobalError error={withDigest} reset={vi.fn()} />);

    expect(html).toContain('<body style="margin:0;background:transparent"></body>');
    expect(html).not.toContain("문제가 발생했습니다");
    expect(html).not.toContain("다시 시도");
  });
});
