// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import type { TimerStatus } from "@/types";
import TimerOverlayPage from "@/app/timers/[id]/overlay/page";

let search = "";
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "abc" }),
  useSearchParams: () => new URLSearchParams(search),
}));

function stubTimer(status: TimerStatus, remainingSeconds: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          id: "abc",
          projectId: "p1",
          title: "테스트 타이머",
          description: null,
          remainingSeconds,
          status,
          scheduledStartAt: null,
          createdBy: { id: "u1", nickname: "스트리머" },
          projectOwnerId: "u1",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    })),
  );
}

describe("오버레이 긴급·만료 펄스 (UX-24)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    search = "";
  });

  it("기본값에서는 만료된 숫자와 '만료됨'이 깜빡인다", async () => {
    stubTimer("EXPIRED", 0);
    render(<TimerOverlayPage />);

    const timer = await screen.findByRole("timer");
    expect(timer.style.animation).toContain("pulse-expired");
    expect(screen.getByText("만료됨").style.animation).toContain("pulse-expired");
  });

  it("animation=false면 만료 펄스를 끈다", async () => {
    search = "animation=false";
    stubTimer("EXPIRED", 0);
    render(<TimerOverlayPage />);

    const timer = await screen.findByRole("timer");
    expect(timer.style.animation).toBe("");
    expect(screen.getByText("만료됨").style.animation).toBe("");
  });

  it("animation=false면 1분 미만 긴급 펄스를 끈다", async () => {
    search = "animation=false";
    stubTimer("RUNNING", 30);
    render(<TimerOverlayPage />);

    const timer = await screen.findByRole("timer");
    expect(timer).toHaveAccessibleName(expect.stringContaining("1분 미만"));
    expect(timer.style.animation).toBe("");
  });

  it("기본값에서는 1분 미만 긴급 펄스가 켜진다", async () => {
    stubTimer("RUNNING", 30);
    render(<TimerOverlayPage />);

    const timer = await screen.findByRole("timer");
    expect(timer.style.animation).toContain("pulse-urgent-fast");
  });
});

describe("오버레이 URL 오류 (UX-56)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("타이머가 없으면 화면에 아무것도 그리지 않고 콘솔 경고를 한 번만 남긴다", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));
    render(<TimerOverlayPage />);

    await vi.advanceTimersByTimeAsync(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("찾을 수 없습니다");

    // 5초 폴링이 반복돼도 같은 경고를 쌓지 않는다
    await vi.advanceTimersByTimeAsync(15_000);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("찾을 수 없습니다");
  });
});

describe("오버레이 색상 쿼리 검증 (보안 감사 F03)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    search = "";
  });

  it("bg에 CSS를 끼워 넣으면 무시하고 transparent를 쓴다", async () => {
    search = `bg=${encodeURIComponent("transparent} body::after{background:url(https://x/)} x{")}`;
    stubTimer("RUNNING", 600);
    render(<TimerOverlayPage />);
    await screen.findByRole("timer");

    expect(document.body.style.getPropertyValue("background")).toBe("transparent");
    expect(document.getElementById("overlay-style")?.textContent).not.toContain("url(");
  });

  it("타이머를 그리는 데 성공하면 렌더 오류 reload 상한을 되돌린다", async () => {
    window.sessionStorage.setItem("overlay-reload-count", "2");
    stubTimer("RUNNING", 600);
    render(<TimerOverlayPage />);
    await screen.findByRole("timer");

    expect(window.sessionStorage.getItem("overlay-reload-count")).toBeNull();
  });

  it("유효한 #rrggbb bg는 적용한다", async () => {
    search = `bg=${encodeURIComponent("#112233")}`;
    stubTimer("RUNNING", 600);
    render(<TimerOverlayPage />);
    await screen.findByRole("timer");

    expect(document.body.style.getPropertyValue("background")).toMatch(/#112233|rgb\(17, 34, 51\)/);
  });

  it("color가 형식에 맞지 않으면 기본 흰색을 쓴다", async () => {
    search = "color=red";
    stubTimer("RUNNING", 600);
    render(<TimerOverlayPage />);

    const timer = await screen.findByRole("timer");
    expect(timer.style.color).toMatch(/#ffffff|rgb\(255, 255, 255\)/);
  });
});

describe("오버레이 폴링 백오프", () => {
  const okResponse = (remainingSeconds = 600) => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: {
        id: "abc",
        projectId: "p1",
        title: "테스트 타이머",
        description: null,
        remainingSeconds,
        status: "RUNNING",
        scheduledStartAt: null,
        createdBy: { id: "u1", nickname: "스트리머" },
        projectOwnerId: "u1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }),
  });
  const notFound = () => ({ ok: false, status: 404, json: async () => ({}) });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("404가 반복되면 간격이 두 배씩 늘고, 성공하면 5초로 돌아온다", async () => {
    let respond: () => unknown = notFound;
    const fetchMock = vi.fn(async () => respond());
    vi.stubGlobal("fetch", fetchMock);
    render(<TimerOverlayPage />);

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 실패 1회 → 10초 뒤, 2회 → 20초 뒤, 3회 → 40초 뒤
    await vi.advanceTimersByTimeAsync(9_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(19_999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    respond = okResponse;
    await vi.advanceTimersByTimeAsync(40_000);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    // 성공 뒤에는 다시 5초 간격
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("404는 최대 5분 간격까지만 늘어난다", async () => {
    const fetchMock = vi.fn(async () => notFound());
    vi.stubGlobal("fetch", fetchMock);
    render(<TimerOverlayPage />);

    // 10+20+40+80+160초 뒤 여섯 번째 요청, 그다음부터는 5분 간격
    await vi.advanceTimersByTimeAsync(310_000);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    await vi.advanceTimersByTimeAsync(299_999);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it("네트워크 오류는 최대 60초 간격이고 경고는 한 번만 남긴다", async () => {
    const warn = vi.mocked(console.warn);
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<TimerOverlayPage />);

    // 10+20+40초 뒤 네 번째, 그다음부터는 60초 간격
    await vi.advanceTimersByTimeAsync(70_000);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(5);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("연결하지 못했습니다");
  });

  it("200인데 JSON이 아닌 응답(한도 초과 안내 페이지)은 긴 백오프 대상이다", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<TimerOverlayPage />);

    // 60초 상한이었다면 310초 동안 9번 요청한다. 5분 상한이면 6번
    await vi.advanceTimersByTimeAsync(310_000);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("원인이 바뀔 때마다 경고를 한 번씩 남기고, 성공하면 다음 실패를 다시 경고한다", async () => {
    const warn = vi.mocked(console.warn);
    const responses: Array<() => unknown> = [
      notFound,
      notFound,
      () => ({ ok: false, status: 503, json: async () => ({}) }),
      okResponse,
      notFound,
    ];
    const fetchMock = vi.fn(async () => (responses.shift() ?? okResponse)());
    vi.stubGlobal("fetch", fetchMock);
    render(<TimerOverlayPage />);

    await vi.advanceTimersByTimeAsync(0); // 404 → 경고
    await vi.advanceTimersByTimeAsync(10_000); // 404 → 중복 억제
    await vi.advanceTimersByTimeAsync(20_000); // 503 → 경고
    await vi.advanceTimersByTimeAsync(40_000); // 성공
    await vi.advanceTimersByTimeAsync(5_000); // 404 → 다시 경고
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls[1][0]).toContain("HTTP 503");
  });

  it("언마운트하면 예약된 폴링이 남지 않고, 응답 대기 중 언마운트돼도 다음 요청을 예약하지 않는다", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    const fetchMock = vi.fn(() => new Promise((resolve) => (resolveFetch = resolve)));
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = render(<TimerOverlayPage />);

    await vi.advanceTimersByTimeAsync(0);
    unmount();
    resolveFetch(notFound());
    await vi.advanceTimersByTimeAsync(600_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
