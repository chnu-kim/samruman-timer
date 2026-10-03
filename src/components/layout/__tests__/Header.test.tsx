// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Header } from "../Header";

// 테마 토글은 이 테스트와 무관하고 ThemeProvider·matchMedia가 필요하므로 대체한다
vi.mock("@/components/ui/ThemeToggle", () => ({ ThemeToggle: () => null }));

// 비로그인 상태에서 헤더의 '로그인'을 누르면 보던 화면을 next로 실어 보낸다
describe("Header 로그인 링크", () => {
  const originalLocation = window.location;
  let location: { pathname: string; search: string; href: string };

  beforeEach(() => {
    location = { pathname: "/", search: "", href: "http://localhost/" };
    Object.defineProperty(window, "location", { configurable: true, value: location });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  function clickLogin(init?: MouseEventInit) {
    render(<Header initialUser={null} />);
    const link = screen.getByRole("link", { name: "로그인" });
    const notPrevented = fireEvent.click(link, init);
    return { link, notPrevented };
  }

  it("보던 경로와 쿼리를 next로 넘긴다", () => {
    location.pathname = "/timers/abc";
    location.search = "?tab=logs";
    const { notPrevented } = clickLogin();
    expect(notPrevented).toBe(false);
    expect(location.href).toBe(`/login?next=${encodeURIComponent("/timers/abc?tab=logs")}`);
  });

  it("허용되지 않는 경로(로그인 화면)에서는 기본 링크(/login)로 이동한다", () => {
    location.pathname = "/login";
    const { link, notPrevented } = clickLogin();
    expect(notPrevented).toBe(true);
    expect(link.getAttribute("href")).toBe("/login");
    expect(location.href).toBe("http://localhost/");
  });

  it("수정자 키를 누른 클릭(새 탭 열기 등)은 가로채지 않는다", () => {
    location.pathname = "/timers/abc";
    const { notPrevented } = clickLogin({ metaKey: true });
    expect(notPrevented).toBe(true);
    expect(location.href).toBe("http://localhost/");
  });
});

// /api/auth/me는 보호 라우트라 access 만료 뒤 첫 페이지 로드에서 refresh를 일으킨다.
// refresh 중 D1 장애면 미들웨어가 500을 주는데, 헤더는 fetch(authFetch 아님)로 부르고 res.ok만 보므로
// 오류 안내 없이 비로그인 화면(로그인 링크)으로 그린다. 세션 만료 이동도 일어나지 않는다
describe("Header: /api/auth/me 500", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("500이면 오류 안내 없이 로그인 링크를 보여 준다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "서버 오류가 발생했습니다" } }), {
        status: 500,
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const expired = vi.fn();
    window.addEventListener("session-expired", expired);

    render(<Header />);

    expect(await screen.findByRole("link", { name: "로그인" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me");
    expect(expired).not.toHaveBeenCalled();
    window.removeEventListener("session-expired", expired);
  });
});
