// @vitest-environment jsdom
// 콘솔 폴링의 외부 변경 판정(updatedAt)과 타이머 상세 요청의 시간 제한
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import ProjectDetailPage from "@/app/projects/[id]/page";
import { resetMeCache } from "@/lib/session-me";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "p1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
  useAnnounce: () => () => {},
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
const T0 = "2026-10-05T00:00:00.000Z";
const T1 = "2026-10-05T00:00:10.000Z";
const T2 = "2026-10-05T00:00:20.000Z";

/** 서버 상태. 실행 중이면 잔여가 실제 시계에 맞춰 줄어든다(가짜 타이머의 Date를 따른다) */
const server = {
  status: "RUNNING" as "RUNNING" | "EXPIRED",
  base: 3600,
  at: 0,
  updatedAt: T0,
  /** "pending"이면 상세 요청이 응답 없이 멈춘다(중단 신호에만 끝난다) */
  detail: "ok" as "ok" | "pending",
  logs: "ok" as "ok" | "pending",
  graph: "ok" as "ok" | "pending",
  goals: "ok" as "ok" | "pending",
};
function remaining() {
  return server.status === "RUNNING" ? Math.max(0, server.base - Math.floor((Date.now() - server.at) / 1000)) : 0;
}
function detail() {
  return {
    id: "t1",
    projectId: "p1",
    projectName: "테스트 프로젝트",
    title: "서브어톤",
    description: null,
    remainingSeconds: remaining(),
    status: server.status,
    scheduledStartAt: null,
    createdBy: { id: "u1", nickname: "스트리머" },
    projectOwnerId: "u1",
    createdAt: T0,
    updatedAt: server.updatedAt,
  };
}

function stalled(init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  });
}

beforeEach(() => {
  Object.assign(server, { status: "RUNNING", base: 3600, at: Date.now(), updatedAt: T0, detail: "ok", logs: "ok", graph: "ok", goals: "ok" });
  localStorage.setItem("defaultActorName", "기본냥");
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.startsWith("/api/auth/me")) return jsonResponse(owner);
    if (url === "/api/projects/p1/timers") return jsonResponse([{ id: "t1" }]);
    if (url === "/api/projects/p1/goals") return server.goals === "pending" ? stalled(init) : jsonResponse([]);
    if (url.startsWith("/api/timers/t1/logs")) {
      return server.logs === "pending" ? stalled(init) : jsonResponse({ logs: [], pagination: { page: 1, limit: 5, total: 0, totalPages: 1 } });
    }
    if (url.startsWith("/api/timers/t1/graph")) return server.graph === "pending" ? stalled(init) : jsonResponse({ mode: "remaining", points: [] });
    if (url === "/api/timers/t1/modify" && method === "POST") {
      // 이 화면의 조작: 서버 상태를 바꾸고 바뀐 updatedAt을 함께 돌려준다
      server.base = remaining() + 3600;
      server.at = Date.now();
      server.updatedAt = T1;
      return jsonResponse({
        id: "t1",
        remainingSeconds: server.base,
        status: "RUNNING",
        updatedAt: T1,
        log: { id: "l2", actionType: "ADD", actorName: "기본냥", actorUserId: "u1", deltaSeconds: 3600, beforeSeconds: 0, afterSeconds: 0, createdAt: T1, revertedAt: null },
      });
    }
    if (url === "/api/timers/t1") return server.detail === "pending" ? stalled(init) : jsonResponse(detail());
    return jsonResponse(project);
  }) as typeof fetch;
});

afterEach(() => {
  localStorage.removeItem("defaultActorName");
  resetMeCache();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const count = (prefix: string) => vi.mocked(global.fetch).mock.calls.filter(([u]) => String(u).startsWith(prefix)).length;

/** 숫자키 '1'로 1시간을 더하고, 응답 반영과 이어지는 기록·그래프·목표 갱신이 끝날 때까지 기다린다 */
async function applyOneHour() {
  const modifies = () => vi.mocked(global.fetch).mock.calls.filter(([u]) => String(u) === "/api/timers/t1/modify").length;
  fireEvent.keyDown(window, { key: "1", code: "Digit1" });
  await waitFor(() => expect(modifies()).toBe(1));
  await waitFor(() => expect(screen.getByRole("timer")).toHaveTextContent(/^0(2:00:00|1:5\d)/));
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
}

describe("폴링의 외부 변경 판정 (updatedAt)", () => {
  it("이 화면에서 바꾼 뒤 같은 updatedAt을 받은 폴링은 기록·그래프·목표를 다시 부르지 않는다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ProjectDetailPage />);
    await waitFor(() => expect(screen.getByLabelText("시청자 닉네임")).toHaveValue("기본냥"));

    await applyOneHour();
    const before = { logs: count("/api/timers/t1/logs"), graph: count("/api/timers/t1/graph"), goals: count("/api/projects/p1/goals") };

    // 실행 중 폴링(5초) 두 번
    await vi.advanceTimersByTimeAsync(10_000);
    expect(count("/api/timers/t1")).toBeGreaterThanOrEqual(3);
    expect(count("/api/timers/t1/logs")).toBe(before.logs);
    expect(count("/api/timers/t1/graph")).toBe(before.graph);
    expect(count("/api/projects/p1/goals")).toBe(before.goals);
  });

  it("조작 응답보다 옛 updatedAt의 폴링 응답(조작 직전에 떠난 요청)은 버려 화면을 되돌리지 않는다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ProjectDetailPage />);
    await waitFor(() => expect(screen.getByLabelText("시청자 닉네임")).toHaveValue("기본냥"));
    await applyOneHour();
    const graphs = count("/api/timers/t1/graph");

    // 서버가 조작 전 상태를 돌려준 것처럼 흉내 낸다
    server.base = 3600;
    server.updatedAt = T0;
    await vi.advanceTimersByTimeAsync(5_000);
    // 옛 값(00:59:xx)으로 돌아가지 않고 조작 뒤 값에서 계속 흐른다(부하로 실제 시간이 더 흘러도 1:5x분대)
    expect(screen.getByRole("timer")).toHaveTextContent(/^01:5\d:/);
    expect(count("/api/timers/t1/graph")).toBe(graphs);
  });

  it("표기가 다른(밀리초 없는) 더 새 updatedAt도 옛 응답으로 버리지 않는다", async () => {
    server.updatedAt = "2026-10-05T00:00:00Z";
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ProjectDetailPage />);
    await screen.findByRole("heading", { name: "최근 기록" });
    const before = count("/api/timers/t1/graph");
    // 글자 순서로는 "…00.500Z" < "…00Z"('.' < 'Z')지만 시각은 0.5초 뒤다
    server.updatedAt = "2026-10-05T00:00:00.500Z";
    await vi.advanceTimersByTimeAsync(5_000);
    await waitFor(() => expect(count("/api/timers/t1/graph")).toBe(before + 1));
  });

  it("다른 기기의 1초 변경도 updatedAt이 바뀌었으면 한 번만 다시 부른다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ProjectDetailPage />);
    await screen.findByRole("heading", { name: "최근 기록" });
    const before = count("/api/timers/t1/graph");
    const logsBefore = count("/api/timers/t1/logs");

    // 3초 임계보다 작은 변경
    server.base = remaining() + 1;
    server.at = Date.now();
    server.updatedAt = T2;
    await vi.advanceTimersByTimeAsync(5_000);
    await waitFor(() => expect(count("/api/timers/t1/graph")).toBe(before + 1));
    expect(count("/api/timers/t1/logs")).toBe(logsBefore + 1);

    // 같은 변경을 다음 폴링이 또 외부 변경으로 보지 않는다
    await vi.advanceTimersByTimeAsync(10_000);
    expect(count("/api/timers/t1/graph")).toBe(before + 1);
  });

  it("만료 상태에서 updatedAt만 바뀌어도(제목 수정 등) 한 번만 다시 부르고 반복하지 않는다", async () => {
    server.status = "EXPIRED";
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ProjectDetailPage />);
    await screen.findByRole("heading", { name: "최근 기록" });
    const before = count("/api/timers/t1/graph");

    server.updatedAt = T2;
    await vi.advanceTimersByTimeAsync(15_000);
    await waitFor(() => expect(count("/api/timers/t1/graph")).toBe(before + 1));
    // 만료 타이머 폴링(15초) 두 번 더
    await vi.advanceTimersByTimeAsync(30_000);
    expect(count("/api/timers/t1/graph")).toBe(before + 1);
  });
});

describe("타이머 상세 요청 시간 제한", () => {
  it("상세가 응답 없이 멈추면 10초 뒤 콘솔 자리에 오류와 '다시 시도'를 바로 보인다(콘솔이 10초를 더 기다리지 않는다)", async () => {
    server.detail = "pending";
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ProjectDetailPage />);

    // 상위의 첫 조회가 10초 뒤 끝나면 콘솔이 같은 요청을 또 걸지 않고 바로 오류와 '다시 시도'를 보인다(대기는 10초 한 번)
    await vi.advanceTimersByTimeAsync(10_500);
    await screen.findByRole("heading", { name: "테스트 프로젝트" });
    expect(await screen.findByText("타이머 정보를 불러오지 못했습니다.")).toBeInTheDocument();
    expect(document.querySelector("[aria-busy=true]")).not.toBeInTheDocument();
    expect(vi.mocked(global.fetch).mock.calls.filter(([u]) => String(u) === "/api/timers/t1")).toHaveLength(1);

    server.detail = "ok";
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("region", { name: "시간" })).toBeInTheDocument();
  });
});

describe("첫 타이머 값 보정", () => {
  it("상세를 받은 뒤 기록·그래프·목표를 기다린 시간만큼 카운트다운에서 뺀다", async () => {
    server.logs = "pending";
    server.graph = "pending";
    server.goals = "pending";
    render(<ProjectDetailPage />);
    // 기록·그래프 0.5초 + 목표 0.5초를 기다린 뒤 그린다
    const timer = await screen.findByRole("timer", {}, { timeout: 2000 });
    // 보정하지 않으면 01:00:00이다. 부하로 더 늦거나 한 번 틱해도 59:58까지는 같은 보정이다
    expect(timer).toHaveTextContent(/^00:59:5[89]$/);
  });
});
