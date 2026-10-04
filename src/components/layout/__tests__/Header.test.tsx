// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Header } from "../Header";
import { resetMeCache } from "@/lib/session-me";

// 테마 토글은 이 테스트와 무관하고 ThemeProvider·matchMedia가 필요하므로 대체한다
vi.mock("@/components/ui/ThemeToggle", () => ({ ThemeToggle: () => null }));

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

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

  it("허용되지 않는 경로(API 등)에서는 기본 링크(/login)로 이동한다", () => {
    location.pathname = "/api/auth/me";
    const { link, notPrevented } = clickLogin();
    expect(notPrevented).toBe(true);
    expect(link.getAttribute("href")).toBe("/login");
    expect(location.href).toBe("http://localhost/");
  });

  // C153: 로그인 화면에는 본문 로그인 버튼이 있으므로 같은 화면을 다시 여는 헤더 링크를 두지 않는다
  it("로그인 화면에서는 헤더 로그인 링크를 그리지 않는다", () => {
    pathname = "/login";
    try {
      render(<Header initialUser={null} />);
      expect(screen.queryByRole("link", { name: "로그인" })).not.toBeInTheDocument();
    } finally {
      pathname = "/";
    }
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
    resetMeCache();
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

// R10·R04·R21: 이니셜은 장식, 이름은 한 번만 읽힌다. 로그아웃은 테마 토글과 같은 높이이고 모바일 아이콘에도 이름이 보인다
describe("Header 로그인 상태", () => {
  const user = { id: "u1", chzzkUserId: "c1", nickname: "김차누", profileImageUrl: null };

  it("이니셜은 aria-hidden이고 이름은 sr-only로 남는다(모바일)", () => {
    const { container } = render(<Header initialUser={user} />);
    const initial = Array.from(container.querySelectorAll("span")).find((el) => el.textContent === "김")!;
    expect(initial).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("김차누")).toHaveClass("sr-only", "sm:not-sr-only");
  });

  it("로그아웃은 title을 갖고 데스크톱 40·터치 44 높이다", () => {
    render(<Header initialUser={user} />);
    const button = screen.getByRole("button", { name: "로그아웃" });
    expect(button).toHaveAttribute("title", "로그아웃");
    expect(button).toHaveClass("h-10", "pointer-coarse:min-h-11");
  });

  it("로그인 링크도 같은 높이다", () => {
    render(<Header initialUser={null} />);
    expect(screen.getByRole("link", { name: "로그인" })).toHaveClass("h-10", "pointer-coarse:min-h-11");
  });
});
