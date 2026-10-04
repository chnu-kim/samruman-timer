// @vitest-environment jsdom
// 콘솔 폴링의 외부 변경 판정(updatedAt)과 타이머 상세 요청의 시간 제한
import { render, screen, waitFor, fireEvent, act, within } from "@testing-library/react";
import ProjectDetailPage from "@/app/projects/[id]/page";
import { resetMeCache } from "@/lib/session-me";

// 화면 전체를 jsdom에 그리는 무거운 파일이라 이 파일만 시간 제한을 늘린다(전역은 기본 5초). 전체 실행 하나면 가장 느린 테스트가
// 1초 안팎(동시 2개 2.5초)이지만, 실행이 겹치면(에이전트 동시 실행. 전체 실행 4개 동시에 13초까지) CPU 경합으로 5초를 넘는다
vi.setConfig({ testTimeout: 20_000 });

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
  /**
   * `?since=`보다 updatedAt이 새로울 때 내려 줄 deltaSinceSeconds. undefined면 필드를 넣지 않는다(되돌리기가 끼었을 때처럼),
   * null이면 그사이 추가·차감이 없었다(제목 수정 등)
   */
  deltaSince: undefined as number | null | undefined,
};
function remaining() {
  return server.status === "RUNNING" ? Math.max(0, server.base - Math.floor((Date.now() - server.at) / 1000)) : 0;
}
function detail(url = "") {
  const since = new URLSearchParams(url.split("?")[1] ?? "").get("since");
  const withDelta = since !== null && server.deltaSince !== undefined && Date.parse(since) < Date.parse(server.updatedAt);
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
    ...(withDelta && { deltaSinceSeconds: server.deltaSince }),
  };
}

function stalled(init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  });
}

beforeEach(() => {
  Object.assign(server, { status: "RUNNING", base: 3600, at: Date.now(), updatedAt: T0, detail: "ok", logs: "ok", graph: "ok", goals: "ok", deltaSince: undefined });
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
    if (url.split("?")[0] === "/api/timers/t1") return server.detail === "pending" ? stalled(init) : jsonResponse(detail(url));
    return jsonResponse(project);
  }) as typeof fetch;
});

afterEach(() => {
  localStorage.removeItem("defaultActorName");
  resetMeCache();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** 1시간 추가(ADD) 조작의 서버 응답 */
const modifyResponse = (remainingSeconds: number, updatedAt: string, logId: string) => jsonResponse({
  id: "t1",
  remainingSeconds,
  status: "RUNNING",
  updatedAt,
  log: { id: logId, actionType: "ADD", actorName: "기본냥", actorUserId: "u1", deltaSeconds: 3600, beforeSeconds: 0, afterSeconds: 0, createdAt: updatedAt, revertedAt: null },
});

/** 조작(modify)과, hold.detail이 참인 동안의 상세(폴링) 요청을 붙잡아 두었다 테스트가 원하는 순서로 돌려준다 */
function holdRequests() {
  const modify: Array<(r: Response) => void> = [];
  const detail: Array<(r: Response) => void> = [];
  const hold = { detail: false, modify, detailHeld: detail };
  const base = global.fetch;
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/timers/t1/modify") return new Promise<Response>((resolve) => modify.push(resolve));
    if (hold.detail && url.split("?")[0] === "/api/timers/t1") return new Promise<Response>((resolve) => detail.push(resolve));
    return base(input, init);
  }) as typeof fetch;
  return hold;
}

/** 붙잡힌 응답 하나가 화면 상태(ref)에 반영될 만큼 마이크로태스크를 흘린다. act 안에서 부르면 그사이 렌더는 일어나지 않는다 */
async function drainMicrotasks() {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}

const count = (prefix: string) => vi.mocked(global.fetch).mock.calls.filter(([u]) => String(u).startsWith(prefix)).length;

/**
 * 콘솔이 그려지고 마운트 effect까지 끝날 때를 기다린다. 부하로 첫 화면이 기록·그래프를 기다리는 한도(0.5초)를 넘기면
 * 콘솔이 마운트 effect에서 직접 다시 부르므로, 그 요청까지 센 뒤에 기준 횟수를 잡아야 한다
 */
async function consoleReady() {
  await screen.findByRole("heading", { name: "최근 기록" });
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
}

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
    await consoleReady();
    const before = count("/api/timers/t1/graph");
    // 글자 순서로는 "…00.500Z" < "…00Z"('.' < 'Z')지만 시각은 0.5초 뒤다
    server.updatedAt = "2026-10-05T00:00:00.500Z";
    await vi.advanceTimersByTimeAsync(5_000);
    await waitFor(() => expect(count("/api/timers/t1/graph")).toBe(before + 1));
  });

  it("다른 기기의 1초 변경도 updatedAt이 바뀌었으면 한 번만 다시 부른다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ProjectDetailPage />);
    await consoleReady();
    const before = count("/api/timers/t1/graph");
    const logsBefore = count("/api/timers/t1/logs");

    // 3초 임계보다 작은 변경
    server.base = remaining() + 1;
    server.at = Date.now();
    server.updatedAt = T2;
    server.deltaSince = 1;
    await vi.advanceTimersByTimeAsync(5_000);
    await waitFor(() => expect(count("/api/timers/t1/graph")).toBe(before + 1));
    expect(count("/api/timers/t1/logs")).toBe(logsBefore + 1);

    // 같은 변경을 다음 폴링이 또 외부 변경으로 보지 않는다
    await vi.advanceTimersByTimeAsync(10_000);
    expect(count("/api/timers/t1/graph")).toBe(before + 1);
  });

  it("폴링은 화면의 updatedAt을 since로 실어 보낸다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ProjectDetailPage />);
    await screen.findByRole("heading", { name: "최근 기록" });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(vi.mocked(global.fetch).mock.calls.map(([u]) => String(u))).toContain(`/api/timers/t1?since=${encodeURIComponent(T0)}`);
  });

  it("그사이 추가·차감이 없었다고 하면(제목 수정 등, deltaSinceSeconds null) 기록·그래프·목표를 다시 부르지 않는다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ProjectDetailPage />);
    await consoleReady();
    const before = { logs: count("/api/timers/t1/logs"), graph: count("/api/timers/t1/graph"), goals: count("/api/projects/p1/goals") };

    server.updatedAt = T2;
    server.deltaSince = null;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(count("/api/timers/t1/logs")).toBe(before.logs);
    expect(count("/api/timers/t1/graph")).toBe(before.graph);
    expect(count("/api/projects/p1/goals")).toBe(before.goals);
    // 새 updatedAt은 저장해, 다음 폴링이 같은 since로 다시 묻지 않는다
    expect(vi.mocked(global.fetch).mock.calls.map(([u]) => String(u))).toContain(`/api/timers/t1?since=${encodeURIComponent(T2)}`);
  });

  it("만료 상태에서 updatedAt이 바뀌었는데 합계를 낼 수 없으면(필드 없음) 한 번만 다시 부르고 반복하지 않는다", async () => {
    server.status = "EXPIRED";
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ProjectDetailPage />);
    await consoleReady();
    const before = count("/api/timers/t1/graph");

    server.updatedAt = T2;
    await vi.advanceTimersByTimeAsync(15_000);
    await waitFor(() => expect(count("/api/timers/t1/graph")).toBe(before + 1));
    // 만료 타이머 폴링(15초) 두 번 더
    await vi.advanceTimersByTimeAsync(30_000);
    expect(count("/api/timers/t1/graph")).toBe(before + 1);
  });

  it("연속 조작의 응답이 역순으로 와도 앞 조작의 옛 응답으로 잔여·updatedAt을 되돌리지 않는다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // 두 조작 응답을 붙잡아 두었다 뒤 조작의 응답(더 새 updatedAt)부터 돌려준다
    const held: Array<(r: Response) => void> = [];
    const base = global.fetch;
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/timers/t1/modify") return new Promise<Response>((resolve) => held.push(resolve));
      return base(input, init);
    }) as typeof fetch;
    render(<ProjectDetailPage />);
    await waitFor(() => expect(screen.getByLabelText("시청자 닉네임")).toHaveValue("기본냥"));

    fireEvent.keyDown(window, { key: "1", code: "Digit1" });
    fireEvent.keyDown(window, { key: "1", code: "Digit1" });
    await waitFor(() => expect(held).toHaveLength(2));
    // 서버에는 두 조작이 모두 반영됐다(3시간, updatedAt T2)
    server.base = remaining() + 7200;
    server.at = Date.now();
    server.updatedAt = T2;
    await act(async () => { held[1](modifyResponse(server.base, T2, "l3")); });
    await waitFor(() => expect(screen.getByRole("timer")).toHaveTextContent(/^0(3:00:00|2:5\d)/));
    await act(async () => { held[0](modifyResponse(server.base - 3600, T1, "l2")); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.getByRole("timer")).toHaveTextContent(/^0(3:00:00|2:5\d)/);

    // 저장한 updatedAt도 T2라 같은 상태의 폴링을 다른 기기의 변경으로 보지 않는다
    const graphs = count("/api/timers/t1/graph");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(count("/api/timers/t1/graph")).toBe(graphs);
    expect(screen.getByRole("timer")).toHaveTextContent(/^02:5\d/);
  });

  it("역순 응답이 렌더 전에 연달아 도착해도(같은 틱) 앞 조작의 옛 응답을 버린다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const hold = holdRequests();
    render(<ProjectDetailPage />);
    await waitFor(() => expect(screen.getByLabelText("시청자 닉네임")).toHaveValue("기본냥"));

    fireEvent.keyDown(window, { key: "1", code: "Digit1" });
    fireEvent.keyDown(window, { key: "1", code: "Digit1" });
    await waitFor(() => expect(hold.modify).toHaveLength(2));
    server.base = remaining() + 7200;
    server.at = Date.now();
    server.updatedAt = T2;
    // 뒤 조작의 응답과 앞 조작의 옛 응답을 렌더 없이 잇달아 반영한다. 렌더 뒤에 바뀌는 기준(syncedRef)으로는 거를 수 없다
    await act(async () => {
      hold.modify[1](modifyResponse(server.base, T2, "l3"));
      await drainMicrotasks();
      hold.modify[0](modifyResponse(server.base - 3600, T1, "l2"));
      await drainMicrotasks();
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.getByRole("timer")).toHaveTextContent(/^0(3:00:00|2:5\d)/);

    const graphs = count("/api/timers/t1/graph");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(count("/api/timers/t1/graph")).toBe(graphs);
    expect(screen.getByRole("timer")).toHaveTextContent(/^02:5\d/);
  });

  it("앞 조작이 늦게 실패해도 그사이 확정된 뒤 조작의 값을 롤백으로 덮지 않는다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const hold = holdRequests();
    render(<ProjectDetailPage />);
    await waitFor(() => expect(screen.getByLabelText("시청자 닉네임")).toHaveValue("기본냥"));

    // 하단 바 프리셋(낙관적 반영 경로)으로 조작 A·B(각 1시간). 서버에는 B만 반영됐다(2시간, updatedAt T1)
    const bar = document.querySelector<HTMLElement>("[data-quick-bar]")!;
    fireEvent.click(within(bar).getByRole("button", { name: "+1시간" }));
    await waitFor(() => expect(hold.modify).toHaveLength(1));
    await waitFor(() => expect(within(bar).getByRole("button", { name: "+1시간" })).toBeEnabled());
    fireEvent.click(within(bar).getByRole("button", { name: "+1시간" }));
    await waitFor(() => expect(hold.modify).toHaveLength(2));
    // 두 조작이 낙관적으로 반영돼 있다(3시간)
    expect(screen.getByRole("timer")).toHaveTextContent(/^0(3:00:00|2:5\d)/);
    server.base = remaining() + 3600;
    server.at = Date.now();
    server.updatedAt = T1;
    await act(async () => { hold.modify[1](modifyResponse(server.base, T1, "l3")); });
    await waitFor(() => expect(screen.getByRole("timer")).toHaveTextContent(/^0(2:00:00|1:5\d)/));

    // A가 늦게 실패한다. 롤백은 A 직전 값(1시간)이지만 그 뒤 B가 확정됐으므로 반영하지 않는다
    await act(async () => {
      hold.modify[0](new Response(JSON.stringify({ error: { code: "INTERNAL", message: "x" } }), { status: 500, headers: { "Content-Type": "application/json" } }));
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.getByRole("timer")).toHaveTextContent(/^0(2:00:00|1:5\d)/);
  });

  it("조작 응답과 그보다 옛 폴링 응답이 렌더 전에 연달아 도착해도 폴링 값으로 되돌리지 않는다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const hold = holdRequests();
    render(<ProjectDetailPage />);
    await consoleReady();

    // 조작 전에 떠난 폴링(옛 상태 T0)을 붙잡아 둔다
    hold.detail = true;
    await vi.advanceTimersByTimeAsync(5_000);
    await waitFor(() => expect(hold.detailHeld).toHaveLength(1));
    const stale = jsonResponse(detail());

    fireEvent.keyDown(window, { key: "1", code: "Digit1" });
    await waitFor(() => expect(hold.modify).toHaveLength(1));
    server.base = remaining() + 3600;
    server.at = Date.now();
    server.updatedAt = T1;
    await act(async () => {
      hold.modify[0](modifyResponse(server.base, T1, "l2"));
      await drainMicrotasks();
      hold.detailHeld[0](stale);
      await drainMicrotasks();
    });
    hold.detail = false;
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.getByRole("timer")).toHaveTextContent(/^0(2:00:00|1:5\d)/);
    // 저장한 updatedAt도 T1로 남아 다음 폴링이 이 조작을 다른 기기의 변경으로 보지 않는다
    const graphs = count("/api/timers/t1/graph");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(count("/api/timers/t1/graph")).toBe(graphs);
    expect(screen.getByRole("timer")).toHaveTextContent(/^01:5\d/);
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
