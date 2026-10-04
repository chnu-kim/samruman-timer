// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import NotFound from "@/app/not-found";
import ProjectDetailPage from "@/app/projects/[id]/page";
import TimerStatsPage from "@/app/timers/[id]/stats/page";
import { ErrorState } from "@/components/ui/ErrorState";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "x1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), { status, headers: { "Content-Type": "application/json" } });
}

function stubFetch(handler: (url: string) => Response) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => handler(String(input))) as typeof fetch;
}

afterEach(() => {
  vi.restoreAllMocks();
});

// 찾을 수 없음·권한 없음은 다시 시도로 풀리지 않는 안내라
// 빨간 오류 대신 중립 톤 + h1 + 돌아갈 링크 하나로 같은 틀을 쓴다 (C033·C034·C131)
function expectNoticeScreen(heading: string, link: { name: string; href: string }) {
  expect(screen.getByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
  const links = screen.getAllByRole("link");
  expect(links).toHaveLength(1);
  expect(links[0]).toHaveAccessibleName(link.name);
  expect(links[0]).toHaveAttribute("href", link.href);
  expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
}

describe("ErrorState 톤", () => {
  it("neutral은 빨간 아이콘을 쓰지 않고, 기본(error)은 쓴다", () => {
    const { container, unmount } = render(<ErrorState tone="neutral" title="찾을 수 없음" />);
    expect(container.innerHTML).not.toMatch(/red-/);
    unmount();

    const { container: errorContainer } = render(<ErrorState onRetry={vi.fn()} />);
    expect(errorContainer.innerHTML).toMatch(/text-red-500/);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});

describe("오류 화면", () => {
  it("없는 경로(not-found)는 한국어 h1과 프로젝트 목록 링크 하나", () => {
    render(<NotFound />);
    expectNoticeScreen("페이지를 찾을 수 없습니다", { name: "프로젝트 목록으로", href: "/projects" });
  });

  it("없는 프로젝트는 같은 틀로 목록 링크를 준다", async () => {
    stubFetch((url) => (url.startsWith("/api/auth/me") ? new Response(null, { status: 401 }) : new Response(null, { status: 404 })));
    render(<ProjectDetailPage />);
    await screen.findByRole("heading", { level: 1, name: "프로젝트를 찾을 수 없습니다" });
    expectNoticeScreen("프로젝트를 찾을 수 없습니다", { name: "프로젝트 목록으로", href: "/projects" });
    expect(screen.getByText("삭제되었거나 주소가 잘못되었습니다.")).toBeInTheDocument();
  });

  it("소유자가 아니면 통계 대신 프로젝트로 돌아가는 링크를 준다", async () => {
    stubFetch((url) => {
      if (url === "/api/timers/x1") return jsonResponse({ id: "x1", projectId: "p9" });
      if (url === "/api/timers/x1/stats") return new Response(null, { status: 403 });
      return new Response(null, { status: 403 });
    });
    render(<TimerStatsPage />);
    await screen.findByRole("heading", { level: 1, name: "통계를 볼 수 없습니다" });
    expectNoticeScreen("통계를 볼 수 없습니다", { name: "프로젝트로 돌아가기", href: "/projects/p9" });
  });

  it("타이머 조회까지 실패하면 프로젝트 목록으로 돌려보낸다", async () => {
    stubFetch(() => new Response(null, { status: 401 }));
    render(<TimerStatsPage />);
    await screen.findByRole("heading", { level: 1, name: "통계를 볼 수 없습니다" });
    expectNoticeScreen("통계를 볼 수 없습니다", { name: "프로젝트 목록으로", href: "/projects" });
  });

  it("없는 타이머의 통계는 찾을 수 없음 안내", async () => {
    stubFetch(() => new Response(null, { status: 404 }));
    render(<TimerStatsPage />);
    await screen.findByRole("heading", { level: 1, name: "타이머를 찾을 수 없습니다" });
    expectNoticeScreen("타이머를 찾을 수 없습니다", { name: "프로젝트 목록으로", href: "/projects" });
  });

  it("일시적 오류는 지금처럼 다시 시도를 보여 주고 링크는 없다", async () => {
    stubFetch(() => new Response(null, { status: 500 }));
    render(<TimerStatsPage />);
    const retry = await screen.findByRole("button", { name: "다시 시도" });
    expect(within(retry.parentElement!).queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });
});
