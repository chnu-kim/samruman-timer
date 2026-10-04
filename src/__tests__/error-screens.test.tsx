// @vitest-environment jsdom
import { configure, render, screen, within } from "@testing-library/react";
import NotFound from "@/app/not-found";
import ProjectDetailPage from "@/app/projects/[id]/page";
import { resetMeCache } from "@/lib/session-me";
import TimerStatsPage from "@/app/timers/[id]/stats/page";
import { ErrorState } from "@/components/ui/ErrorState";

// 페이지 전체(목록·상세·통계)를 그려 기다리므로 전체 테스트를 함께 돌리는 부하에서 기본 1초가 모자란 적이 있다
configure({ asyncUtilTimeout: 3000 });

// 화면 인스턴스를 유지한 채 경로의 id만 바뀌는 경우를 흉내 낼 수 있게 바꿀 수 있는 값으로 둔다
const route = vi.hoisted(() => ({ id: "x1" }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: route.id }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// 실제 모듈은 페이지 수명 동안 한 번만 이벤트를 보내 테스트 사이에 상태가 남으므로 호출만 센다
const sessionExpired = vi.hoisted(() => ({ fire: vi.fn() }));
vi.mock("@/lib/session-expired", () => ({
  fireSessionExpired: sessionExpired.fire,
  onSessionExpired: () => () => {},
}));

function unauthorized(code: "UNAUTHORIZED" | "SESSION_EXPIRED") {
  return new Response(JSON.stringify({ error: { code, message: "" } }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), { status, headers: { "Content-Type": "application/json" } });
}

function stubFetch(handler: (url: string) => Response) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => handler(String(input))) as typeof fetch;
}

afterEach(() => {
  // fetchMe는 확정 결과를 잠깐 같이 쓰므로 테스트마다 비워 이전 테스트의 로그인 상태가 남지 않게 한다
  resetMeCache();
  vi.restoreAllMocks();
  sessionExpired.fire.mockClear();
  route.id = "x1";
  document.title = "";
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

// G1: 전체 화면 오류의 복구 동작은 막다른 404의 이동 버튼과 같은 테두리 버튼이고, 글자 링크 모양은 카드 안(compact)에만 쓴다
describe("ErrorState 다시 시도 모양", () => {
  it("본형은 테두리 버튼, compact는 글자 링크", () => {
    const { unmount } = render(<ErrorState onRetry={vi.fn()} />);
    const full = screen.getByRole("button", { name: "다시 시도" });
    expect(full).toHaveClass("border-border", "rounded-control");
    expect(full).not.toHaveClass("text-accent");
    unmount();

    render(<ErrorState compact onRetry={vi.fn()} />);
    const compact = screen.getByRole("button", { name: "다시 시도" });
    expect(compact).toHaveClass("text-accent");
    expect(compact).not.toHaveClass("border-border");
  });
});

describe("오류 화면", () => {
  it("없는 경로(not-found)는 한국어 h1과 프로젝트 목록 링크 하나", () => {
    render(<NotFound />);
    expectNoticeScreen("페이지를 찾을 수 없습니다", { name: "프로젝트 목록으로", href: "/projects" });
    expect(screen.getByText("삭제되었거나 주소가 잘못되었습니다.")).toBeInTheDocument();
  });

  it("없는 프로젝트는 같은 틀로 목록 링크를 준다", async () => {
    stubFetch((url) => (url.startsWith("/api/auth/me") ? new Response(null, { status: 401 }) : new Response(null, { status: 404 })));
    render(<ProjectDetailPage />);
    await screen.findByRole("heading", { level: 1, name: "프로젝트를 찾을 수 없습니다" });
    expectNoticeScreen("프로젝트를 찾을 수 없습니다", { name: "프로젝트 목록으로", href: "/projects" });
    expect(document.title).toBe("찾을 수 없음 | 삼루먼타이머");
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
    expect(document.title).toBe("통계를 볼 수 없음 | 삼루먼타이머");
  });

  // 로그아웃 상태는 미들웨어가 라우트의 소유·존재 판별 전에 401을 낸다. 소유자 문구로 오해하지 않게 로그인 안내를 준다
  it("로그아웃 상태면 소유자 문구 대신 로그인 안내와 프로젝트 링크", async () => {
    stubFetch((url) => {
      if (url === "/api/timers/x1") return jsonResponse({ id: "x1", projectId: "p9" });
      return unauthorized("UNAUTHORIZED");
    });
    render(<TimerStatsPage />);
    await screen.findByRole("heading", { level: 1, name: "로그인이 필요합니다" });
    expectNoticeScreen("로그인이 필요합니다", { name: "프로젝트로 돌아가기", href: "/projects/p9" });
    expect(screen.queryByText(/소유자만/)).not.toBeInTheDocument();
    expect(sessionExpired.fire).not.toHaveBeenCalled();
    expect(document.title).toBe("통계를 볼 수 없음 | 삼루먼타이머");
  });

  it("로그아웃 상태의 없는 id도 찾을 수 없음이 아니라 로그인 안내, 링크는 프로젝트 목록", async () => {
    stubFetch((url) => (url === "/api/timers/x1/stats" ? unauthorized("UNAUTHORIZED") : new Response(null, { status: 404 })));
    render(<TimerStatsPage />);
    await screen.findByRole("heading", { level: 1, name: "로그인이 필요합니다" });
    expectNoticeScreen("로그인이 필요합니다", { name: "프로젝트 목록으로", href: "/projects" });
    expect(sessionExpired.fire).not.toHaveBeenCalled();
  });

  it("세션이 만료됐으면 세션 만료 흐름을 한 번 태운다", async () => {
    stubFetch((url) => {
      if (url === "/api/timers/x1") return jsonResponse({ id: "x1", projectId: "p9" });
      return unauthorized("SESSION_EXPIRED");
    });
    render(<TimerStatsPage />);
    await screen.findByRole("heading", { level: 1, name: "로그인이 필요합니다" });
    expect(sessionExpired.fire).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/소유자만/)).not.toBeInTheDocument();
  });

  it("없는 타이머의 통계는 찾을 수 없음 안내", async () => {
    stubFetch(() => new Response(null, { status: 404 }));
    render(<TimerStatsPage />);
    await screen.findByRole("heading", { level: 1, name: "타이머를 찾을 수 없습니다" });
    expectNoticeScreen("타이머를 찾을 수 없습니다", { name: "프로젝트 목록으로", href: "/projects" });
    expect(document.title).toBe("찾을 수 없음 | 삼루먼타이머");
  });

  it("안내를 띄운 뒤 다른 타이머를 정상으로 불러오면 이전 안내가 남지 않는다", async () => {
    stubFetch((url) => {
      if (url.startsWith("/api/timers/x1")) return new Response(null, { status: 404 });
      if (url === "/api/timers/x2") return jsonResponse({ id: "x2", projectId: "p2", projectName: "주말 서브어톤" });
      if (url === "/api/timers/x2/stats") {
        return jsonResponse({
          summary: { totalEvents: 0, totalAddedSeconds: 0, totalSubtractedSeconds: 0, netAddedSeconds: 0, uniqueDonors: 0, peakHour: null },
          topDonors: [],
          hourlyDistribution: [],
          dailyActivity: [],
        });
      }
      return jsonResponse({ mode: "cumulative", points: [] });
    });
    const { rerender } = render(<TimerStatsPage />);
    await screen.findByRole("heading", { level: 1, name: "타이머를 찾을 수 없습니다" });

    route.id = "x2";
    rerender(<TimerStatsPage />);
    expect(await screen.findByRole("heading", { level: 1, name: /주말 서브어톤 통계/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "타이머를 찾을 수 없습니다" })).not.toBeInTheDocument();
  });

  const emptyStats = {
    summary: { totalEvents: 0, totalAddedSeconds: 0, totalSubtractedSeconds: 0, netAddedSeconds: 0, uniqueDonors: 0, peakHour: null },
    topDonors: [],
    hourlyDistribution: [],
    dailyActivity: [],
  };

  it("정상 통계를 본 뒤 없는 타이머로 바뀌면 이전 통계 대신 안내를 보인다", async () => {
    stubFetch((url) => {
      if (url === "/api/timers/x1") return jsonResponse({ id: "x1", projectId: "p1", projectName: "첫 방송" });
      if (url === "/api/timers/x1/stats") return jsonResponse(emptyStats);
      if (url.startsWith("/api/timers/x1/graph")) return jsonResponse({ mode: "cumulative", points: [] });
      return new Response(null, { status: 404 });
    });
    const { rerender } = render(<TimerStatsPage />);
    await screen.findByRole("heading", { level: 1, name: /첫 방송 통계/ });

    route.id = "x2";
    rerender(<TimerStatsPage />);
    await screen.findByRole("heading", { level: 1, name: "타이머를 찾을 수 없습니다" });
    expect(screen.queryByRole("heading", { name: /첫 방송 통계/ })).not.toBeInTheDocument();
  });

  it("늦게 도착한 이전 타이머의 응답이 새 타이머 화면을 덮어쓰지 않는다", async () => {
    let releaseOld: () => void = () => {};
    const oldGate = new Promise<void>((r) => { releaseOld = r; });
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/timers/x1")) {
        await oldGate;
        if (url === "/api/timers/x1") return jsonResponse({ id: "x1", projectId: "p1", projectName: "이전 방송" });
        if (url === "/api/timers/x1/stats") return jsonResponse(emptyStats);
        return jsonResponse({ mode: "cumulative", points: [] });
      }
      if (url === "/api/timers/x2") return jsonResponse({ id: "x2", projectId: "p2", projectName: "새 방송" });
      if (url === "/api/timers/x2/stats") return jsonResponse(emptyStats);
      return jsonResponse({ mode: "cumulative", points: [] });
    }) as typeof fetch;

    const { rerender } = render(<TimerStatsPage />);
    route.id = "x2";
    rerender(<TimerStatsPage />);
    await screen.findByRole("heading", { level: 1, name: /새 방송 통계/ });

    releaseOld();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByRole("heading", { level: 1, name: /새 방송 통계/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /이전 방송 통계/ })).not.toBeInTheDocument();
  });

  // 다시 시도할 수 있는 실패라도 화면 제목(h1)과 돌아갈 경로는 남기고, 오류는 본문 한 덩어리(아이콘·문장·다시 시도)로만
  it("일시적 오류에도 h1 '통계'와 프로젝트로 돌아가는 링크 하나, 본문에 다시 시도", async () => {
    stubFetch((url) => (url === "/api/timers/x1" ? jsonResponse({ id: "x1", projectId: "p9" }) : new Response(null, { status: 500 })));
    render(<TimerStatsPage />);
    const retry = await screen.findByRole("button", { name: "다시 시도" });
    expect(within(retry.parentElement!).queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("통계");
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName("프로젝트로 돌아가기");
    expect(links[0]).toHaveAttribute("href", "/projects/p9");
  });

  // Codex P3: 통계 요청만 네트워크 오류로 끊겨도 받아 둔 타이머 응답(돌아갈 프로젝트)을 버리지 않는다
  it("통계 요청만 네트워크 오류여도 프로젝트로 돌아가는 링크를 남긴다", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/timers/x1") return jsonResponse({ id: "x1", projectId: "p9" });
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    render(<TimerStatsPage />);
    await screen.findByRole("button", { name: "다시 시도" });
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName("프로젝트로 돌아가기");
    expect(links[0]).toHaveAttribute("href", "/projects/p9");
  });

  it("타이머 조회까지 실패하면 돌아갈 곳은 프로젝트 목록", async () => {
    stubFetch(() => new Response(null, { status: 500 }));
    render(<TimerStatsPage />);
    await screen.findByRole("button", { name: "다시 시도" });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/projects");
  });
});
