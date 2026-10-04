// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import LoginPage from "@/app/(auth)/login/page";
import { Header } from "@/components/layout/Header";
import { resetMeCache } from "@/lib/session-me";
import { SITE_SUMMARY, SITE_TAGLINE } from "@/lib/site";

const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => "/login",
}));
// 테마 토글은 ThemeProvider가 필요하고 이 테스트와 무관하다
vi.mock("@/components/ui/ThemeToggle", () => ({ ThemeToggle: () => null }));

function mockMe(status: number) {
  global.fetch = vi.fn(async () =>
    status === 200
      ? new Response(JSON.stringify({ data: { id: "u1", chzzkUserId: "c1", nickname: "삼루먼", profileImageUrl: null } }), { status })
      : new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "인증이 필요합니다" } }), { status })
  ) as typeof fetch;
}

afterEach(() => {
  // 세션 확인 결과는 문서(페이지 로드) 단위로 캐시되므로 테스트마다 새 문서처럼 비운다
  resetMeCache();
  replace.mockReset();
  search = "";
  vi.restoreAllMocks();
});

// C153: 제목은 브랜드명 반복 대신 서비스 설명. 공개 소개 문구에는 플랫폼 이름을 넣지 않고 로그인 버튼에만 둔다
describe("로그인 화면 문구", () => {
  it("제목·부제가 서비스 설명이고 로그인 버튼은 가운데 정렬이다", () => {
    mockMe(401);
    render(<LoginPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(SITE_TAGLINE);
    expect(screen.getByText(SITE_SUMMARY)).toBeInTheDocument();
    expect(`${SITE_TAGLINE} ${SITE_SUMMARY}`).not.toMatch(/CHZZK|치지직/);
    const cta = screen.getByRole("link", { name: "CHZZK로 로그인" });
    expect(cta.className).toContain("text-center");
  });

  it("next가 있으면 로그인 버튼이 next를 들고 간다", () => {
    mockMe(401);
    search = `next=${encodeURIComponent("/timers/abc")}`;
    render(<LoginPage />);
    expect(screen.getByRole("link", { name: "CHZZK로 로그인" })).toHaveAttribute(
      "href",
      `/api/auth/login?next=${encodeURIComponent("/timers/abc")}`
    );
  });
});

// C029: 세션 만료로 보내졌을 때만 이유를 한 줄 알린다. 헤더 '로그인'도 next를 실으므로 next만으로는 알리지 않는다
describe("세션 만료 안내", () => {
  const LINE = "세션이 만료되어 다시 로그인합니다.";

  it("expired=1이 있으면 만료 안내를 한 줄 보여 주고 로그인 버튼은 next를 들고 간다", () => {
    mockMe(401);
    search = `next=${encodeURIComponent("/projects/abc")}&expired=1`;
    render(<LoginPage />);
    expect(screen.getByText(LINE)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CHZZK로 로그인" })).toHaveAttribute(
      "href",
      `/api/auth/login?next=${encodeURIComponent("/projects/abc")}`
    );
  });

  it("next만 있으면(헤더 '로그인') 만료 안내를 보여 주지 않는다", () => {
    mockMe(401);
    search = `next=${encodeURIComponent("/projects/abc")}`;
    render(<LoginPage />);
    expect(screen.queryByText(LINE)).toBeNull();
  });

  it("로그인 실패(?error=)와 겹치면 실패 안내만 보여 준다", () => {
    mockMe(401);
    search = "error=auth_failed&expired=1";
    render(<LoginPage />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(LINE)).toBeNull();
  });
});

// C155: 이미 로그인한 사용자가 /login에 오면 로그인 화면을 보여 주지 않고 보낸다
describe("로그인 상태에서 /login", () => {
  it("next가 없으면 프로젝트 목록으로 보낸다", async () => {
    mockMe(200);
    render(<LoginPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/projects"));
    expect(global.fetch).toHaveBeenCalledWith("/api/auth/me");
  });

  it("next가 있으면 그곳으로 보낸다", async () => {
    mockMe(200);
    search = `next=${encodeURIComponent("/timers/abc?tab=logs")}`;
    render(<LoginPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/timers/abc?tab=logs"));
  });

  it("허용되지 않는 next(외부 주소)는 무시하고 목록으로 보낸다", async () => {
    mockMe(200);
    search = `next=${encodeURIComponent("//evil.com")}`;
    render(<LoginPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/projects"));
  });

  it("?error=가 있으면 실패 안내를 보여 주고 머문다(되돌려 보내 반복되지 않게)", async () => {
    mockMe(200);
    search = "error=auth_failed";
    render(<LoginPage />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 20));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("로그아웃 상태(401)면 머물고 세션 만료 이벤트를 내지 않는다", async () => {
    mockMe(401);
    const expired = vi.fn();
    window.addEventListener("session-expired", expired);
    render(<LoginPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(replace).not.toHaveBeenCalled();
    expect(expired).not.toHaveBeenCalled();
    window.removeEventListener("session-expired", expired);
  });
});

// R24: 헤더와 로그인 화면이 같은 첫 로드에 세션을 확인해도 /api/auth/me는 한 번만 부른다(로그아웃 상태 401 한 건)
describe("세션 확인 한 번", () => {
  it("헤더와 로그인 화면을 함께 그려도 요청은 1회다", async () => {
    mockMe(401);
    render(
      <>
        <Header />
        <LoginPage />
      </>,
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
