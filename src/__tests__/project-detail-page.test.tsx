// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import ProjectDetailPage from "@/app/projects/[id]/page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "p1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// jsdom에는 native <dialog>의 showModal/close가 없다
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
}

const owner = { id: "u1", chzzkUserId: "c1", nickname: "스트리머", profileImageUrl: null };

const project = {
  id: "p1",
  name: "테스트 프로젝트",
  description: null,
  owner: { id: "u1", nickname: "스트리머", profileImageUrl: null },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const timer = {
  id: "t1",
  projectId: "p1",
  title: "서브어톤",
  description: null,
  remainingSeconds: 0,
  status: "EXPIRED",
  scheduledStartAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const timerDetail = {
  ...timer,
  projectName: "테스트 프로젝트",
  createdBy: { id: "u1", nickname: "스트리머" },
  projectOwnerId: "u1",
};

const logs = [
  {
    id: "l1",
    actionType: "EXPIRE",
    actorName: "system",
    actorUserId: null,
    deltaSeconds: 0,
    beforeSeconds: 0,
    afterSeconds: 0,
    createdAt: "2026-01-02T00:00:00.000Z",
  },
];

const goal = {
  id: "g1",
  projectId: "p1",
  title: "100시간 달성",
  status: "CANCELLED",
};

type FetchCall = { url: string; method: string };

function stubApi({ timers, goals, me = null }: { timers: unknown[]; goals: unknown[]; me?: unknown }) {
  const calls: FetchCall[] = [];
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    if (url.startsWith("/api/auth/me")) return me ? jsonResponse(me) : new Response(null, { status: 401 });
    if (url === "/api/projects/p1/timers") return jsonResponse(timers);
    if (url === "/api/projects/p1/goals") return jsonResponse(goals);
    if (url.startsWith("/api/timers/t1/logs")) {
      return jsonResponse({ logs, pagination: { page: 1, limit: 5, total: 1, totalPages: 1 } });
    }
    if (url.startsWith("/api/timers/t1/graph")) return jsonResponse({ mode: "remaining", points: [] });
    if (url === "/api/timers/t1" && method === "DELETE") return jsonResponse({ id: "t1" });
    if (url === "/api/timers/t1") return jsonResponse(timerDetail);
    return jsonResponse(project);
  }) as typeof fetch;
  return calls;
}

afterEach(() => {
  vi.restoreAllMocks();
});

// UX-50: 타이머가 없으면 누를 수 없는 목표 버튼과 빈 탭을 보여 주지 않는다
describe("프로젝트 상세 목표 섹션 (UX-50)", () => {
  it("타이머와 목표가 모두 없으면 목표 섹션을 렌더하지 않는다", async () => {
    stubApi({ timers: [], goals: [] });
    render(<ProjectDetailPage />);
    await screen.findByText("아직 타이머가 없습니다.");
    expect(screen.queryByRole("heading", { name: "목표" })).not.toBeInTheDocument();
  });

  it("타이머가 있고 소유자면 목표 섹션을 보여 준다", async () => {
    stubApi({ timers: [timer], goals: [], me: owner });
    render(<ProjectDetailPage />);
    expect(await screen.findByRole("heading", { name: "목표" })).toBeInTheDocument();
  });

  it("타이머를 삭제했어도 남은 목표 기록이 있으면 목표 섹션을 보여 준다", async () => {
    stubApi({ timers: [], goals: [goal] });
    render(<ProjectDetailPage />);
    await screen.findByText("아직 타이머가 없습니다.");
    await waitFor(() => expect(screen.getByRole("heading", { name: "목표" })).toBeInTheDocument());
  });

  it("시청자에게는 목표가 없을 때 빈 목표 영역을 보여 주지 않는다", async () => {
    stubApi({ timers: [timer], goals: [] });
    render(<ProjectDetailPage />);
    await screen.findByRole("heading", { name: "잔여 시간 추이" });
    expect(screen.queryByRole("heading", { name: "목표" })).not.toBeInTheDocument();
  });
});

// 프로젝트와 타이머는 1:1이라 프로젝트 화면이 곧 조작 콘솔이다
describe("프로젝트 콘솔", () => {
  it("소유자는 이 화면에서 바로 시간을 조작하고 목표를 함께 본다", async () => {
    stubApi({ timers: [timer], goals: [], me: owner });
    render(<ProjectDetailPage />);
    expect(await screen.findByRole("heading", { name: "시간 조작" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "목표" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /통계/ })).toHaveAttribute("href", "/timers/t1/stats");
  });

  it("시청자에게는 조작·통계·더보기 메뉴를 보여 주지 않는다", async () => {
    stubApi({ timers: [timer], goals: [] });
    render(<ProjectDetailPage />);
    await screen.findByRole("heading", { name: "잔여 시간 추이" });
    expect(screen.queryByRole("heading", { name: "시간 조작" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /통계/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "더보기" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "링크 복사" })).toBeInTheDocument();
  });

  // UX-73: 만료 로그의 행위자를 'system' 대신 '자동'으로 보여 준다
  it("시스템이 남긴 만료 로그의 행위자를 '자동'으로 표시한다", async () => {
    stubApi({ timers: [timer], goals: [] });
    render(<ProjectDetailPage />);
    await waitFor(() => expect(screen.getAllByText("자동").length).toBeGreaterThan(0));
    expect(screen.queryByText("system")).not.toBeInTheDocument();
  });

  it("최근 기록은 몇 건만 불러오고, 펼치면 필터와 함께 전체 기록을 불러온다", async () => {
    const calls = stubApi({ timers: [timer], goals: [] });
    render(<ProjectDetailPage />);
    await screen.findByRole("heading", { name: "최근 변경" });
    expect(calls.some((c) => c.url.startsWith("/api/timers/t1/logs") && c.url.includes("limit=5"))).toBe(true);
    expect(screen.queryByRole("button", { name: "추가" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "전체 기록" }));
    expect(await screen.findByRole("heading", { name: "변경 기록" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "추가", pressed: false })).toBeInTheDocument();
    await waitFor(() =>
      expect(calls.some((c) => c.url.startsWith("/api/timers/t1/logs") && c.url.includes("limit=20"))).toBe(true),
    );
  });

  // UX-64: 단축키 도움말은 닫기 버튼이 있는 공용 FormDialog다
  it("'?'로 연 단축키 도움말을 닫기 버튼으로 닫을 수 있다", async () => {
    stubApi({ timers: [timer], goals: [], me: owner });
    render(<ProjectDetailPage />);
    // 소유자 확인(/api/auth/me)이 끝나야 단축키가 켜진다
    await screen.findByRole("heading", { name: "시간 조작" });

    fireEvent.keyDown(window, { key: "?" });
    const title = await screen.findByRole("heading", { name: "키보드 단축키" });
    const dialog = title.closest("dialog")!;
    expect(dialog).toHaveAttribute("open");
    expect(screen.getByText("단축키 도움말")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "닫기" }));
    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
  });

  describe("숫자 단축키", () => {
    beforeEach(() => {
      localStorage.setItem("defaultActorName", "기본냥");
    });
    afterEach(() => {
      localStorage.removeItem("defaultActorName");
    });

    // 화면에는 닫힌 다이얼로그(목표 폼, 삭제 확인, 도움말)가 늘 렌더돼 있어도 단축키가 동작해야 한다
    it("기본 닉네임이 있으면 '1'로 1시간을 바로 적용한다", async () => {
      const calls = stubApi({ timers: [timer], goals: [], me: owner });
      render(<ProjectDetailPage />);
      await screen.findByRole("heading", { name: "시간 조작" });

      fireEvent.keyDown(window, { key: "1", code: "Digit1" });
      await waitFor(() =>
        expect(calls.some((c) => c.url === "/api/timers/t1/modify" && c.method === "POST")).toBe(true),
      );
    });

    it("목표 폼이 열려 있으면 '1'이 뒤쪽 타이머를 바꾸지 않는다", async () => {
      const calls = stubApi({ timers: [timer], goals: [], me: owner });
      render(<ProjectDetailPage />);
      await screen.findByRole("heading", { name: "시간 조작" });

      fireEvent.click(screen.getByRole("button", { name: /새 목표/ }));
      await screen.findByRole("heading", { name: "새 목표 설정" });
      fireEvent.keyDown(window, { key: "1", code: "Digit1" });
      await new Promise((r) => setTimeout(r, 50));
      expect(calls.some((c) => c.url === "/api/timers/t1/modify")).toBe(false);
    });
  });

  it("타이머만 삭제하면 화면에 남아 '타이머 없음' 상태가 된다", async () => {
    const calls = stubApi({ timers: [timer], goals: [], me: owner });
    render(<ProjectDetailPage />);
    await screen.findByRole("heading", { name: "시간 조작" });

    fireEvent.click(screen.getByRole("button", { name: "더보기" }));
    fireEvent.click(screen.getByRole("button", { name: "타이머 삭제" }));
    const confirmTitle = await screen.findByRole("heading", { name: "타이머 삭제" });
    // 삭제 뒤 목록을 다시 부르면 타이머가 없다
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET" });
      if (url === "/api/projects/p1/timers") return jsonResponse([]);
      if (url === "/api/projects/p1/goals") return jsonResponse([]);
      return jsonResponse({ id: "t1" });
    }) as typeof fetch;
    fireEvent.click(within(confirmTitle.closest("dialog")!).getByRole("button", { name: "삭제" }));

    expect(await screen.findByText("아직 타이머가 없습니다.")).toBeInTheDocument();
    expect(calls.some((c) => c.url === "/api/timers/t1" && c.method === "DELETE")).toBe(true);
  });

  it("다른 곳에서 타이머가 삭제되면 폴링이 404를 받는 즉시 '타이머 없음' 상태로 바꾼다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      stubApi({ timers: [timer], goals: [], me: owner });
      render(<ProjectDetailPage />);
      await screen.findByRole("heading", { name: "시간 조작" });

      global.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/timers/t1") return new Response(null, { status: 404 });
        if (url === "/api/projects/p1/timers") return jsonResponse([]);
        if (url === "/api/projects/p1/goals") return jsonResponse([]);
        return jsonResponse({});
      }) as typeof fetch;
      // 만료 타이머는 15초 간격으로 폴링한다
      await vi.advanceTimersByTimeAsync(15_000);

      expect(await screen.findByText("아직 타이머가 없습니다.")).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "시간 조작" })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("더보기 메뉴는 Escape로 닫히고 포커스가 버튼으로 돌아간다", async () => {
    stubApi({ timers: [timer], goals: [], me: owner });
    render(<ProjectDetailPage />);
    const trigger = await screen.findByRole("button", { name: "더보기" });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "프로젝트 삭제" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "프로젝트 삭제" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
