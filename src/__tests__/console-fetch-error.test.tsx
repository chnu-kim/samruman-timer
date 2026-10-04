// @vitest-environment jsdom
// W31(R01): 콘솔의 목표·기록·그래프 조회가 실패하면 빈 상태('없습니다', '(0)')로 가리지 않고
// 섹션마다 '불러오지 못했습니다 · 다시 시도' 한 줄을 보이며, 복구되면 저절로 실제 데이터로 바뀐다
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import ProjectDetailPage from "@/app/projects/[id]/page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "p1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

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
const timerDetail = { ...timer, projectName: "테스트 프로젝트", createdBy: { id: "u1", nickname: "스트리머" }, projectOwnerId: "u1" };
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
const activeGoal = {
  id: "g1",
  projectId: "p1",
  type: "DURATION",
  title: "12시간 달성",
  targetSeconds: 43200,
  targetDatetime: null,
  status: "ACTIVE",
  progress: { percentage: 10, currentSeconds: 4320, remainingToTarget: 38880 },
  createdAt: "2026-01-01T00:00:00.000Z",
  completedAt: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

/** 각 엔드포인트의 현재 상태. 테스트 도중 바꾸면 다음 요청부터 반영된다 */
type Mode = "ok" | 500 | "throw" | "pending";
const api = {
  me: owner as unknown,
  goals: "ok" as Mode,
  logs: "ok" as Mode,
  graph: "ok" as Mode,
  detail: "ok" as Mode,
};

function respond(mode: Mode, data: () => unknown): Promise<Response> {
  if (mode === 500) return Promise.resolve(new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "서버 오류" } }), { status: 500 }));
  if (mode === "throw") return Promise.reject(new TypeError("Failed to fetch"));
  if (mode === "pending") return new Promise(() => {});
  return Promise.resolve(jsonResponse(data()));
}

beforeEach(() => {
  Object.assign(api, { me: owner, goals: "ok", logs: "ok", graph: "ok", detail: "ok" });
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/auth/me")) return Promise.resolve(api.me ? jsonResponse(api.me) : new Response(null, { status: 401 }));
    if (url === "/api/projects/p1/timers") return Promise.resolve(jsonResponse([timer]));
    if (url === "/api/projects/p1/goals") return respond(api.goals, () => [activeGoal]);
    if (url.startsWith("/api/timers/t1/logs")) return respond(api.logs, () => ({ logs, pagination: { page: 1, limit: 5, total: 1, totalPages: 1 } }));
    if (url.startsWith("/api/timers/t1/graph")) return respond(api.graph, () => ({ mode: "remaining", points: [] }));
    if (url === "/api/timers/t1") return respond(api.detail, () => timerDetail);
    return Promise.resolve(jsonResponse(project));
  }) as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const goalSection = () => screen.getByRole("region", { name: "목표" });
const logSection = () => screen.getByRole("heading", { name: "최근 기록" }).closest("section")!;
const graphSection = () => screen.getByRole("heading", { name: "잔여 시간 추이" }).closest("section")!;
const EMPTY_TEXT = /기록이 없습니다|아직 목표가 없습니다|진행 중인 목표가 없습니다|종료된 목표가 없습니다/;

describe("콘솔 조회 실패 표시 (W31)", () => {
  it("목표·기록이 500이면 빈 상태 대신 섹션마다 오류 한 줄을 보이고 탭 개수를 숨긴다", async () => {
    api.goals = 500;
    api.logs = 500;
    render(<ProjectDetailPage />);

    expect(await within(await screen.findByRole("region", { name: "목표" })).findByText("목표를 불러오지 못했습니다.")).toBeInTheDocument();
    expect(await within(logSection()).findByText("기록을 불러오지 못했습니다.")).toBeInTheDocument();

    expect(screen.queryByText(EMPTY_TEXT)).not.toBeInTheDocument();
    expect(screen.getAllByText(/불러오지 못했습니다/)).toHaveLength(2);
    for (const tab of within(goalSection()).getAllByRole("tab")) {
      expect(tab.textContent).not.toMatch(/\(\d+\)/);
    }
    // 섹션마다 다시 시도 하나
    expect(within(goalSection()).getAllByRole("button", { name: "다시 시도" })).toHaveLength(1);
    expect(within(logSection()).getAllByRole("button", { name: "다시 시도" })).toHaveLength(1);
  });

  it("네트워크 예외도 비-ok 응답과 같은 오류 줄로 보인다", async () => {
    api.goals = "throw";
    api.logs = "throw";
    api.graph = "throw";
    render(<ProjectDetailPage />);

    expect(await screen.findByText("목표를 불러오지 못했습니다.")).toBeInTheDocument();
    expect(await screen.findByText("기록을 불러오지 못했습니다.")).toBeInTheDocument();
    // 그래프도 같은 한 줄 양식이다
    expect(await within(graphSection()).findByText("그래프를 불러오지 못했습니다.")).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_TEXT)).not.toBeInTheDocument();
  });

  it("응답을 받기 전에는 빈 상태 문구도 '(0)'도 보이지 않는다", async () => {
    api.goals = "pending";
    api.logs = "pending";
    render(<ProjectDetailPage />);
    await screen.findByRole("heading", { name: "최근 기록" });

    expect(screen.queryByText(EMPTY_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByText(/불러오지 못했습니다/)).not.toBeInTheDocument();
    expect(within(goalSection()).getByRole("tab", { name: "진행 중" })).toBeInTheDocument();
  });

  it("2xx로 0건을 받았을 때만 빈 상태 문구를 보인다", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/auth/me")) return jsonResponse(owner);
      if (url === "/api/projects/p1/timers") return jsonResponse([timer]);
      if (url === "/api/projects/p1/goals") return jsonResponse([]);
      if (url.startsWith("/api/timers/t1/logs")) return jsonResponse({ logs: [], pagination: { page: 1, limit: 5, total: 0, totalPages: 1 } });
      if (url.startsWith("/api/timers/t1/graph")) return jsonResponse({ mode: "remaining", points: [] });
      if (url === "/api/timers/t1") return jsonResponse(timerDetail);
      return jsonResponse(project);
    }) as typeof fetch;
    render(<ProjectDetailPage />);

    expect(await screen.findByText("기록이 없습니다.")).toBeInTheDocument();
    // W25: 목표가 하나도 없으면 탭·안내문 없이 '새 목표' 버튼과 한 줄만 남는다
    expect(await within(goalSection()).findByText("아직 목표가 없습니다.")).toBeInTheDocument();
    expect(within(goalSection()).queryAllByRole("tab")).toHaveLength(0);
    expect(within(goalSection()).queryByText(/버튼을 눌러 목표를 추가/)).not.toBeInTheDocument();
    expect(within(goalSection()).getByRole("button", { name: "새 목표" })).toBeInTheDocument();
    // 기록이 하나도 없고 필터도 꺼져 있으면 '전체 기록'과 필터 칩을 두지 않는다
    expect(within(logSection()).queryByRole("button", { name: "전체 기록" })).not.toBeInTheDocument();
    expect(within(logSection()).queryAllByRole("button", { pressed: false })).toHaveLength(0);
  });

  it("생성(CREATE) 기록뿐이어도 시간을 바꾼 적이 없으면 '전체 기록'과 필터를 숨긴다", async () => {
    const create = { id: "l0", actionType: "CREATE", actorName: "tester", actorUserId: "u1", deltaSeconds: 0, beforeSeconds: 0, afterSeconds: 3600, createdAt: "2026-01-01T00:00:00.000Z" };
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/auth/me")) return jsonResponse(owner);
      if (url === "/api/projects/p1/timers") return jsonResponse([timer]);
      if (url === "/api/projects/p1/goals") return jsonResponse([]);
      if (url.startsWith("/api/timers/t1/logs")) return jsonResponse({ logs: [create], pagination: { page: 1, limit: 5, total: 1, totalPages: 1 } });
      if (url.startsWith("/api/timers/t1/graph")) return jsonResponse({ mode: "remaining", points: [] });
      if (url === "/api/timers/t1") return jsonResponse(timerDetail);
      return jsonResponse(project);
    }) as typeof fetch;
    render(<ProjectDetailPage />);
    await screen.findByRole("heading", { name: "최근 기록" });
    await waitFor(() => expect(screen.getAllByText(/tester/).length).toBeGreaterThan(0));
    expect(within(logSection()).queryByRole("button", { name: "전체 기록" })).not.toBeInTheDocument();
  });

  it("생성 기록뿐인 상태에서 시간 변경에 성공하면 이어지는 기록 갱신이 실패해도 '전체 기록'을 보인다", async () => {
    const create = { id: "l0", actionType: "CREATE", actorName: "tester", actorUserId: "u1", deltaSeconds: 0, beforeSeconds: 0, afterSeconds: 3600, createdAt: "2026-01-01T00:00:00.000Z" };
    const added = { id: "l9", actionType: "ADD", actorName: "시청자", actorUserId: null, deltaSeconds: 3600, beforeSeconds: 0, afterSeconds: 3600, createdAt: "2026-01-02T00:00:00.000Z" };
    let logsCalls = 0;
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/auth/me")) return jsonResponse(owner);
      if (url === "/api/projects/p1/timers") return jsonResponse([timer]);
      if (url === "/api/projects/p1/goals") return jsonResponse([]);
      if (url === "/api/timers/t1/modify") return jsonResponse({ id: "t1", remainingSeconds: 3600, status: "RUNNING", log: added });
      if (url.startsWith("/api/timers/t1/logs")) {
        // 첫 조회만 CREATE뿐으로 성공하고, modify 뒤의 silent 갱신부터는 실패한다
        if (++logsCalls > 1) return new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "서버 오류" } }), { status: 500 });
        return jsonResponse({ logs: [create], pagination: { page: 1, limit: 5, total: 1, totalPages: 1 } });
      }
      if (url.startsWith("/api/timers/t1/graph")) return jsonResponse({ mode: "remaining", points: [] });
      if (url === "/api/timers/t1") return jsonResponse(timerDetail);
      return jsonResponse(project);
    }) as typeof fetch;
    render(<ProjectDetailPage />);
    await screen.findByRole("heading", { name: "최근 기록" });
    await waitFor(() => expect(screen.getAllByText(/tester/).length).toBeGreaterThan(0));
    expect(within(logSection()).queryByRole("button", { name: "전체 기록" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("시청자 닉네임"), { target: { value: "시청자" } });
    fireEvent.keyDown(window, { key: "1", code: "Digit1" });

    await waitFor(() => expect(logsCalls).toBeGreaterThan(1));
    expect(await within(logSection()).findByRole("button", { name: "전체 기록" })).toBeInTheDocument();
  });

  it("펼친 기록의 마지막 페이지가 CREATE 한 건뿐이어도 '접기'와 필터 칩을 그대로 둔다", async () => {
    const create = { id: "l0", actionType: "CREATE", actorName: "tester", actorUserId: "u1", deltaSeconds: 0, beforeSeconds: 0, afterSeconds: 3600, createdAt: "2026-01-01T00:00:00.000Z" };
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/auth/me")) return jsonResponse(owner);
      if (url === "/api/projects/p1/timers") return jsonResponse([timer]);
      if (url === "/api/projects/p1/goals") return jsonResponse([]);
      if (url.startsWith("/api/timers/t1/logs")) {
        const page2 = new URL(url, "http://x").searchParams.get("page") === "2";
        return jsonResponse({ logs: page2 ? [create] : logs, pagination: { page: page2 ? 2 : 1, limit: 20, total: 21, totalPages: 2 } });
      }
      if (url.startsWith("/api/timers/t1/graph")) return jsonResponse({ mode: "remaining", points: [] });
      if (url === "/api/timers/t1") return jsonResponse(timerDetail);
      return jsonResponse(project);
    }) as typeof fetch;
    render(<ProjectDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: "전체 기록" }));
    const expandedLogs = () => screen.getByRole("region", { name: "기록" });
    await within(expandedLogs()).findByRole("button", { name: "추가" });
    fireEvent.click(within(expandedLogs()).getByRole("button", { name: /다음/ }));
    await waitFor(() => expect(within(expandedLogs()).getAllByText(/tester/).length).toBeGreaterThan(0));
    expect(within(expandedLogs()).getByRole("button", { name: "접기" })).toBeInTheDocument();
    expect(within(expandedLogs()).getByRole("button", { name: "추가" })).toBeInTheDocument();
  });

  it("목표·기록을 받기 전과 실패했을 때는 탭과 '전체 기록'을 숨기지 않는다", async () => {
    api.goals = "pending";
    api.logs = "pending";
    const { unmount } = render(<ProjectDetailPage />);
    await screen.findByRole("heading", { name: "최근 기록" });
    expect(within(goalSection()).getAllByRole("tab")).toHaveLength(2);
    expect(within(logSection()).getByRole("button", { name: "전체 기록" })).toBeInTheDocument();
    unmount();

    api.goals = 500;
    api.logs = 500;
    render(<ProjectDetailPage />);
    await within(await screen.findByRole("region", { name: "목표" })).findByText("목표를 불러오지 못했습니다.");
    await within(logSection()).findByText("기록을 불러오지 못했습니다.");
    expect(within(goalSection()).getAllByRole("tab")).toHaveLength(2);
    expect(within(logSection()).getByRole("button", { name: "전체 기록" })).toBeInTheDocument();
  });

  it("필터를 켠 결과가 0건이면 칩과 토글을 그대로 두어 필터를 풀 수 있다", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/auth/me")) return jsonResponse(owner);
      if (url === "/api/projects/p1/timers") return jsonResponse([timer]);
      if (url === "/api/projects/p1/goals") return jsonResponse([activeGoal]);
      if (url.startsWith("/api/timers/t1/logs")) {
        const filtered = url.includes("actionType=");
        return jsonResponse({ logs: filtered ? [] : logs, pagination: { page: 1, limit: 20, total: filtered ? 0 : 1, totalPages: 1 } });
      }
      if (url.startsWith("/api/timers/t1/graph")) return jsonResponse({ mode: "remaining", points: [] });
      if (url === "/api/timers/t1") return jsonResponse(timerDetail);
      return jsonResponse(project);
    }) as typeof fetch;
    render(<ProjectDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: "전체 기록" }));
    const expandedLogs = () => screen.getByRole("region", { name: "기록" });
    await screen.findByRole("heading", { name: "기록" });
    fireEvent.click(await within(expandedLogs()).findByRole("button", { name: "추가" }));
    expect(await within(expandedLogs()).findByText("기록이 없습니다.")).toBeInTheDocument();
    expect(within(expandedLogs()).getByRole("button", { name: "추가" })).toHaveAttribute("aria-pressed", "true");
    expect(within(expandedLogs()).getByRole("button", { name: "접기" })).toBeInTheDocument();
  });

  it("'다시 시도'를 누르면 그 섹션만 다시 불러와 실제 데이터로 바뀐다", async () => {
    api.goals = 500;
    api.logs = 500;
    render(<ProjectDetailPage />);
    await screen.findByText("기록을 불러오지 못했습니다.");

    api.logs = "ok";
    fireEvent.click(within(logSection()).getByRole("button", { name: "다시 시도" }));
    expect(await within(logSection()).findByText("자동")).toBeInTheDocument();
    expect(screen.queryByText("기록을 불러오지 못했습니다.")).not.toBeInTheDocument();
    // 목표는 아직 실패 상태
    expect(screen.getByText("목표를 불러오지 못했습니다.")).toBeInTheDocument();

    api.goals = "ok";
    fireEvent.click(within(goalSection()).getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("12시간 달성")).toBeInTheDocument();
    expect(within(goalSection()).getByRole("tab", { name: "진행 중 (1)" })).toBeInTheDocument();
  });

  it("시청자도 목표 조회가 실패하면 목표 영역을 숨기지 않고 오류 줄을 보인다", async () => {
    api.me = null;
    api.goals = 500;
    render(<ProjectDetailPage />);
    expect(await screen.findByText("목표를 불러오지 못했습니다.")).toBeInTheDocument();
  });

  it("목표가 오류 상태면 30초 재요청이 계속 돌아 복구되면 실제 개수가 보인다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api.goals = 500;
      render(<ProjectDetailPage />);
      await screen.findByText("목표를 불러오지 못했습니다.");

      api.goals = "ok";
      await vi.advanceTimersByTimeAsync(30_000);
      expect(await screen.findByText("12시간 달성")).toBeInTheDocument();
      expect(screen.queryByText("목표를 불러오지 못했습니다.")).not.toBeInTheDocument();
      expect(within(goalSection()).getByRole("tab", { name: "진행 중 (1)" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("연결 끊김에서 복구되면 목표·기록·그래프를 함께 다시 불러와 오류 줄이 사라진다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api.goals = 500;
      api.logs = 500;
      api.graph = 500;
      render(<ProjectDetailPage />);
      await screen.findByText("기록을 불러오지 못했습니다.");
      await screen.findByText("그래프를 불러오지 못했습니다.");
      await screen.findByText("목표를 불러오지 못했습니다.");

      // 서버 전체가 내려가 폴링이 2회 연속 실패 → 연결 끊김(만료 타이머는 15초 간격)
      api.detail = 500;
      await vi.advanceTimersByTimeAsync(30_000);
      await waitFor(() => expect(screen.getByText(/^연결 끊김/)).toBeInTheDocument());

      // 서버가 돌아오면 다음 폴링 한 번 안에 세 섹션이 모두 실제 데이터로 바뀐다
      Object.assign(api, { goals: "ok", logs: "ok", graph: "ok", detail: "ok" });
      await vi.advanceTimersByTimeAsync(15_000);
      await waitFor(() => expect(screen.queryByText(/불러오지 못했습니다/)).not.toBeInTheDocument());
      expect(within(logSection()).getByText("자동")).toBeInTheDocument();
      expect(screen.getByText("12시간 달성")).toBeInTheDocument();
      expect(within(goalSection()).getByRole("tab", { name: "진행 중 (1)" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("기록·그래프만 실패했으면 다음 폴링 성공 때 조용히 다시 불러온다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api.logs = 500;
      api.graph = 500;
      render(<ProjectDetailPage />);
      await screen.findByText("기록을 불러오지 못했습니다.");

      Object.assign(api, { logs: "ok", graph: "ok" });
      await vi.advanceTimersByTimeAsync(15_000);
      await waitFor(() => expect(screen.queryByText(/불러오지 못했습니다/)).not.toBeInTheDocument());
      expect(within(logSection()).getByText("자동")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("이미 보이던 기록은 백그라운드 갱신이 실패해도 오류로 바꾸지 않는다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<ProjectDetailPage />);
      expect(await within(await screen.findByRole("heading", { name: "최근 기록" }).then((h) => h.closest("section")!)).findByText("자동")).toBeInTheDocument();
      await screen.findByText("12시간 달성");

      Object.assign(api, { goals: 500, logs: 500, graph: 500, detail: 500 });
      await vi.advanceTimersByTimeAsync(30_000);
      await waitFor(() => expect(screen.getByText(/^연결 끊김/)).toBeInTheDocument());
      api.detail = "ok";
      await vi.advanceTimersByTimeAsync(15_000);
      await waitFor(() => expect(screen.queryByText(/^연결 끊김/)).not.toBeInTheDocument());

      expect(screen.queryByText(/불러오지 못했습니다/)).not.toBeInTheDocument();
      expect(within(logSection()).getByText("자동")).toBeInTheDocument();
      expect(screen.getByText("12시간 달성")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
