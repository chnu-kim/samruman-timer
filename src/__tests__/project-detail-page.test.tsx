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

type FetchCall = { url: string; method: string; body?: string };

function stubApi({ timers, goals, me = null, detail = timerDetail }: { timers: unknown[]; goals: unknown[]; me?: unknown; detail?: unknown }) {
  const calls: FetchCall[] = [];
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });
    if (url.startsWith("/api/auth/me")) return me ? jsonResponse(me) : new Response(null, { status: 401 });
    if (url === "/api/projects/p1/timers") return jsonResponse(timers);
    if (url === "/api/projects/p1/goals") return jsonResponse(goals);
    if (url.startsWith("/api/timers/t1/logs")) {
      return jsonResponse({ logs, pagination: { page: 1, limit: 5, total: 1, totalPages: 1 } });
    }
    if (url.startsWith("/api/timers/t1/graph")) return jsonResponse({ mode: "remaining", points: [] });
    if (url === "/api/timers/t1" && method === "DELETE") return jsonResponse({ id: "t1" });
    if (url === "/api/timers/t1") return jsonResponse(detail);
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

  // 상위 화면이 렌더마다 새 콜백을 넘겨도 첫 조회를 되풀이하지 않는다
  it("타이머 상세는 처음에 한 번만 불러온다", async () => {
    const calls = stubApi({ timers: [timer], goals: [], me: owner });
    render(<ProjectDetailPage />);
    await screen.findByRole("heading", { name: "시간 조작" });
    // 상위 화면 상태를 바꿔 다시 렌더시킨다(목표 폼 열기)
    fireEvent.click(screen.getByRole("button", { name: /새 목표/ }));
    await screen.findByRole("heading", { name: "새 목표 설정" });
    await new Promise((r) => setTimeout(r, 300));
    expect(calls.filter((c) => c.url === "/api/timers/t1" && c.method === "GET")).toHaveLength(1);
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

  // 필터는 '추가·차감·기타' 세 칩. '기타'는 자동·관리 기록을 한 번에 거른다(삭제된 타이머의 기록은 볼 수 없어 DELETE 칩은 없다)
  it("펼친 기록의 필터는 세 칩이고 '기타'는 자동·관리 유형을 한 번에 요청한다", async () => {
    const calls = stubApi({ timers: [timer], goals: [] });
    render(<ProjectDetailPage />);
    fireEvent.click(await screen.findByRole("button", { name: "전체 기록" }));
    await screen.findByRole("heading", { name: "변경 기록" });
    const section = screen.getByRole("region", { name: "변경 기록" });
    const chips = within(section).getAllByRole("button", { pressed: false });
    expect(chips.map((b) => b.textContent)).toEqual(["추가", "차감", "기타"]);

    fireEvent.click(within(section).getByRole("button", { name: "기타" }));
    expect(within(section).getByRole("button", { name: "기타", pressed: true })).toBeInTheDocument();
    await waitFor(() =>
      expect(calls.some((c) => decodeURIComponent(c.url).includes("actionType=CREATE,EXPIRE,REOPEN,ACTIVATE"))).toBe(true),
    );
  });

  it("오늘이 아닌 기록은 날짜를 붙이고, 초까지의 전체 시각은 title로 둔다", async () => {
    stubApi({ timers: [timer], goals: [] });
    render(<ProjectDetailPage />);
    await waitFor(() => expect(document.querySelector("time")).not.toBeNull());
    const time = document.querySelector("time")!;
    expect(time).toHaveAttribute("dateTime", logs[0].createdAt);
    expect(time.textContent).toMatch(/^(\d{4}\. )?\d{2}\. \d{2}\. \d{2}:\d{2}$/);
    expect(time.getAttribute("title")).toMatch(/\d{2}:\d{2}:\d{2}/);
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

  // C122·C124: '?'를 몰라도 도움말에 닿도록 시간 조작 제목 줄에 진입점을 하나 둔다
  describe("단축키 진입점", () => {
    it("소유자 콘솔의 '단축키' 버튼은 포인터 기기에서만 보이고 도움말을 연다", async () => {
      stubApi({ timers: [timer], goals: [], me: owner });
      render(<ProjectDetailPage />);
      await screen.findByRole("heading", { name: "시간 조작" });

      const entry = screen.getByRole("button", { name: "단축키" });
      // 터치 기기(pointer: coarse)에서는 숨긴다. 숫자키·X를 누를 키보드가 없기 때문이다
      expect(entry).toHaveClass("hidden", "pointer-fine:inline-flex");
      expect(entry).toHaveAttribute("aria-haspopup", "dialog");

      fireEvent.click(entry);
      const title = await screen.findByRole("heading", { name: "키보드 단축키" });
      const dialog = title.closest("dialog")!;
      expect(dialog).toHaveAttribute("open");
      // 기본 닉네임 설정 버튼은 닉네임을 입력해야 나타나므로 도움말이 그 순서를 알려 준다
      expect(within(dialog).getByText(/닉네임 입력 후 ‘기본 닉네임으로 설정’을 누르면/)).toBeInTheDocument();
    });

    it("단축키가 꺼진 예약 타이머와 시청자 화면에는 진입점이 없다", async () => {
      stubApi({
        timers: [{ ...timer, status: "SCHEDULED" }],
        goals: [],
        me: owner,
        detail: { ...timerDetail, status: "SCHEDULED", remainingSeconds: 3600, scheduledStartAt: "2099-01-01T00:00:00.000Z" },
      });
      const { unmount } = render(<ProjectDetailPage />);
      await screen.findByRole("heading", { name: "시간 조작" });
      await screen.findByRole("button", { name: "지금 시작" });
      expect(screen.queryByRole("button", { name: "단축키" })).not.toBeInTheDocument();
      unmount();

      stubApi({ timers: [timer], goals: [] });
      render(<ProjectDetailPage />);
      await screen.findByRole("heading", { name: "잔여 시간 추이" });
      expect(screen.queryByRole("button", { name: "단축키" })).not.toBeInTheDocument();
    });
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
      // 기본 닉네임은 시간 조작 카드가 마운트 뒤 localStorage에서 읽어 입력란에 채운다
      await waitFor(() => expect(screen.getByLabelText("시청자 닉네임")).toHaveValue("기본냥"));

      fireEvent.keyDown(window, { key: "1", code: "Digit1" });
      await waitFor(() => {
        const modify = calls.find((c) => c.url === "/api/timers/t1/modify" && c.method === "POST");
        expect(JSON.parse(modify!.body!)).toMatchObject({ actorName: "기본냥" });
      });
    });

    // C014: 모바일 하단 바와 같은 규칙. 입력란에 적은 시청자 이름이 기본 닉네임보다 우선한다
    it("입력한 시청자 닉네임이 있으면 '1'은 그 이름으로 기록한다", async () => {
      const calls = stubApi({ timers: [timer], goals: [], me: owner });
      render(<ProjectDetailPage />);
      await screen.findByRole("heading", { name: "시간 조작" });

      fireEvent.change(screen.getByLabelText("시청자 닉네임"), { target: { value: "벌칙룰렛" } });
      fireEvent.keyDown(window, { key: "1", code: "Digit1" });
      await waitFor(() => {
        const modify = calls.find((c) => c.url === "/api/timers/t1/modify" && c.method === "POST");
        expect(JSON.parse(modify!.body!)).toMatchObject({ actorName: "벌칙룰렛", deltaSeconds: 3600 });
      });
    });

    it("기본 닉네임이 없어도 입력한 닉네임이 있으면 '1'로 바로 적용한다", async () => {
      localStorage.removeItem("defaultActorName");
      const calls = stubApi({ timers: [timer], goals: [], me: owner });
      render(<ProjectDetailPage />);
      await screen.findByRole("heading", { name: "시간 조작" });

      fireEvent.keyDown(window, { key: "1", code: "Digit1" });
      await new Promise((r) => setTimeout(r, 50));
      expect(calls.some((c) => c.url === "/api/timers/t1/modify")).toBe(false);

      fireEvent.change(screen.getByLabelText("시청자 닉네임"), { target: { value: "치즈냥" } });
      fireEvent.keyDown(window, { key: "1", code: "Digit1" });
      await waitFor(() => {
        const modify = calls.find((c) => c.url === "/api/timers/t1/modify" && c.method === "POST");
        expect(JSON.parse(modify!.body!)).toMatchObject({ actorName: "치즈냥" });
      });
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

  // C027: 폴링이 연속으로 실패하면 상태 배지 하나만 '연결 끊김'으로 바꾸고, 성공하면 되돌린다
  it("폴링이 1회 실패하면 그대로, 2회 연속 실패하면 상태 배지가 '연결 끊김'으로 바뀌고 성공하면 돌아온다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      stubApi({ timers: [timer], goals: [], me: owner });
      render(<ProjectDetailPage />);
      await screen.findByRole("heading", { name: "시간 조작" });
      // 카운트다운 옆 상태 배지(기록 행의 '만료' 배지와 구분)
      const statusBadge = () => screen.getByRole("timer").parentElement!.parentElement!.lastElementChild!;
      expect(statusBadge()).toHaveTextContent(/^만료$/);

      const stubbed = global.fetch;
      let detailDown = true;
      global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/timers/t1" && detailDown) return new Response(null, { status: 500 });
        return stubbed(input, init);
      }) as typeof fetch;

      // 만료 타이머는 15초 간격으로 폴링한다
      await vi.advanceTimersByTimeAsync(15_000);
      expect(statusBadge()).toHaveTextContent(/^만료$/);

      await vi.advanceTimersByTimeAsync(15_000);
      await waitFor(() => expect(statusBadge()).toHaveTextContent(/^연결 끊김 · \d+초 전 기준$/));
      // 오류 화면으로 바꾸지 않고 콘솔은 그대로 둔다
      expect(screen.getByRole("heading", { name: "시간 조작" })).toBeInTheDocument();

      detailDown = false;
      await vi.advanceTimersByTimeAsync(15_000);
      await waitFor(() => expect(statusBadge()).toHaveTextContent(/^만료$/));
    } finally {
      vi.useRealTimers();
    }
  });

  it("응답 없이 멈춘 폴링도 시간 제한으로 실패로 세어 2회째에 '연결 끊김'으로 바뀐다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      stubApi({ timers: [timer], goals: [], me: owner });
      render(<ProjectDetailPage />);
      await screen.findByRole("heading", { name: "시간 조작" });
      const statusBadge = () => screen.getByRole("timer").parentElement!.parentElement!.lastElementChild!;

      const stubbed = global.fetch;
      global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) !== "/api/timers/t1") return stubbed(input, init);
        // 응답이 오지 않다가 abort되면 그때 실패한다
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      }) as typeof fetch;

      // 만료 타이머는 15초 간격. 15초에 보낸 요청이 25초에 끊겨 실패 1회
      await vi.advanceTimersByTimeAsync(25_000);
      expect(statusBadge()).toHaveTextContent(/^만료$/);
      // 30초에 보낸 요청이 40초에 끊겨 실패 2회
      await vi.advanceTimersByTimeAsync(15_000);
      await waitFor(() => expect(statusBadge()).toHaveTextContent(/^연결 끊김 · \d+초 전 기준$/));
    } finally {
      vi.useRealTimers();
    }
  });

  it("목록을 받은 뒤 첫 조회 전에 타이머가 삭제됐으면 오류 대신 '타이머 없음' 상태가 된다", async () => {
    let timersCalls = 0;
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/auth/me")) return jsonResponse(owner);
      // 첫 목록 조회에는 타이머가 있고, 삭제를 알아챈 뒤 다시 부르면 없다
      if (url === "/api/projects/p1/timers") return jsonResponse(timersCalls++ === 0 ? [timer] : []);
      if (url === "/api/projects/p1/goals") return jsonResponse([]);
      if (url === "/api/timers/t1") return new Response(null, { status: 404 });
      if (url.startsWith("/api/timers/t1/")) return new Response(null, { status: 404 });
      return jsonResponse(project);
    }) as typeof fetch;
    render(<ProjectDetailPage />);

    expect(await screen.findByText("아직 타이머가 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText("타이머 정보를 불러오지 못했습니다.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /OBS 오버레이/ })).not.toBeInTheDocument();
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
