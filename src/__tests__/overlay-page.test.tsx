// @vitest-environment jsdom
import { render, screen, cleanup, act } from "@testing-library/react";
import type { TimerStatus } from "@/types";
import TimerOverlayPage from "@/app/timers/[id]/overlay/page";
import OverlayError from "@/app/timers/[id]/overlay/error";
import { isStaleResponse } from "@/lib/overlay-animation";
import {
  MAX_RELOADS,
  RECOVERY_STABLE_MS,
  __resetOverlayRecoveryForTest,
  reloadPage,
} from "@/lib/overlay-recovery";

vi.mock("@/lib/overlay-animation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/overlay-animation")>();
  return { ...actual, isStaleResponse: vi.fn(actual.isStaleResponse) };
});

vi.mock("@/lib/overlay-recovery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/overlay-recovery")>();
  return { ...actual, reloadPage: vi.fn() };
});

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

  it("200인데 JSON이 아닌 응답은 긴 백오프 대상이다", async () => {
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

  it("타이머를 그린 뒤 404가 오면(삭제) 다음 폴링에 화면을 비운다 (C028)", async () => {
    const responses: Array<() => unknown> = [okResponse, notFound];
    vi.stubGlobal("fetch", vi.fn(async () => (responses.shift() ?? notFound)()));
    render(<TimerOverlayPage />);

    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByRole("timer")).toHaveTextContent("00:10:00");

    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    // 오류 문구도 그리지 않는다
    expect(document.body.textContent).toBe("");
  });

  it.each([
    ["5xx", () => ({ ok: false, status: 503, json: async () => ({}) })],
    [
      "네트워크 오류",
      () => {
        throw new TypeError("Failed to fetch");
      },
    ],
  ])("%s에는 마지막 값을 유지하고 로컬 카운트를 이어 간다", async (_, failure) => {
    const responses: Array<() => unknown> = [okResponse];
    vi.stubGlobal("fetch", vi.fn(async () => (responses.shift() ?? failure)()));
    render(<TimerOverlayPage />);

    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByRole("timer")).toHaveTextContent("00:10:00");

    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(screen.getByRole("timer")).toHaveTextContent("00:09:30");
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

describe("오버레이 폴링 예외 내성", () => {
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

  it("200인데 data가 없는 응답({})이 와도 다음 폴링을 예약한다", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    render(<TimerOverlayPage />);

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // 해석 실패와 같이 다뤄 10초 뒤 다시 요청한다
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("응답 처리 중 예상하지 못한 예외가 나도 폴링 체인이 끊기지 않는다", async () => {
    const broken = {
      status: 200,
      get ok(): boolean {
        throw new Error("unexpected");
      },
    };
    const fetchMock = vi.fn(async () => broken);
    vi.stubGlobal("fetch", fetchMock);
    render(<TimerOverlayPage />);

    // 일시적 실패(60초 상한)로 보고 10초, 20초 뒤 다시 요청한다
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.warn).mock.calls[0][0]).toContain("처리하지 못했습니다");
  });

  it("데이터를 받은 뒤 처리 중 예외가 반복돼도 경고는 한 번만 남긴다", async () => {
    const original = vi.mocked(isStaleResponse).getMockImplementation()!;
    vi.mocked(isStaleResponse).mockImplementation(() => {
      throw new Error("unexpected");
    });
    try {
      stubTimer("RUNNING", 600);
      render(<TimerOverlayPage />);

      await vi.advanceTimersByTimeAsync(30_000);
      expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(console.warn).toHaveBeenCalledTimes(1);
    } finally {
      vi.mocked(isStaleResponse).mockImplementation(original);
    }
  });
});

describe("오버레이 렌더 오류 복구 상태 초기화", () => {
  const RELOAD_KEY = "overlay-reload-count";
  const renderError = Object.assign(new Error("render failed"), { digest: undefined });

  beforeEach(() => {
    vi.useFakeTimers();
    __resetOverlayRecoveryForTest();
    window.sessionStorage.clear();
    vi.mocked(reloadPage).mockClear();
    stubTimer("RUNNING", 600);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it("데이터를 그린 직후가 아니라 RECOVERY_STABLE_MS 동안 버틴 뒤에 reload 상한을 되돌린다", async () => {
    window.sessionStorage.setItem(RELOAD_KEY, "2");
    render(<TimerOverlayPage />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByRole("timer")).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(RECOVERY_STABLE_MS - 1);
    expect(window.sessionStorage.getItem(RELOAD_KEY)).toBe("2");
    await vi.advanceTimersByTimeAsync(1);
    expect(window.sessionStorage.getItem(RELOAD_KEY)).toBeNull();
  });

  it("데이터를 그린 뒤 곧 렌더 오류가 나면 reset 간격이 계속 늘고 reload는 상한까지만 한다", async () => {
    const reset = vi.fn();
    /** 페이지가 데이터를 그린 뒤 10초 만에 렌더 오류로 언마운트되고, 오류 경계가 마운트되는 한 주기 */
    async function crashAfterRender() {
      cleanup();
      render(<TimerOverlayPage />);
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(screen.getByRole("timer")).toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(10_000);
      cleanup();
      render(<OverlayError error={renderError} reset={reset} />);
    }

    await crashAfterRender();
    for (const delay of [5_000, 10_000, 20_000, 40_000, 60_000]) {
      reset.mockClear();
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(reset).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(reset).toHaveBeenCalledTimes(1);
      await crashAfterRender();
    }
    expect(reloadPage).toHaveBeenCalledTimes(1);

    // reload하면 모듈 상태는 새로 시작하지만 sessionStorage 카운터는 남는다. 같은 주기를 여러 번 반복해도 상한을 넘지 않는다
    for (let round = 0; round < 4; round++) {
      __resetOverlayRecoveryForTest();
      await crashAfterRender();
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(60_000);
        await crashAfterRender();
      }
    }
    expect(reloadPage).toHaveBeenCalledTimes(MAX_RELOADS);
  });
});

describe("오버레이 변경량('+N') 연출 (C061·C062)", () => {
  const response = (remainingSeconds: number, updatedAt: string, deltaSinceSeconds: number | null) => () => ({
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
        updatedAt,
        deltaSinceSeconds,
      },
    }),
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    search = "";
  });

  async function renderWithChange() {
    // 5초 뒤 폴링에서 추정값은 61초지만 서버의 실제 변경량은 60초다
    const responses = [
      response(3600, "2026-01-01T00:00:00.000Z", null),
      response(3656, "2026-01-01T00:00:05.000Z", 60),
    ];
    const fallback = response(3651, "2026-01-01T00:00:05.000Z", null);
    const fetchMock = vi.fn(async (_url: string) => (responses.shift() ?? fallback)());
    vi.stubGlobal("fetch", fetchMock);
    render(<TimerOverlayPage />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    return { floating: screen.getByText("+1:00"), fetchMock };
  }

  it("직전 updatedAt을 since로 보내고, 추정 대신 서버의 실제 변경량으로 '+1:00'을 그린다", async () => {
    const { fetchMock } = await renderWithChange();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/timers/abc");
    expect(fetchMock.mock.calls[1][0]).toBe(
      `/api/timers/abc?since=${encodeURIComponent("2026-01-01T00:00:00.000Z")}`,
    );
  });

  it("숫자 줄 옆에 붙이고 위로 빼지 않아 제목과 겹치거나 화면 위로 잘리지 않는다", async () => {
    search = "showTitle=true";
    const { floating } = await renderWithChange();

    // 숫자와 같은 줄(래퍼) 안에서 가운데에 걸리고, 음수 top으로 제목 쪽에 나가지 않는다
    expect(floating.parentElement).toBe(screen.getByRole("timer").parentElement);
    expect(floating.style.top).toBe("50%");
    expect(floating.style.left).toBe("100%");
    expect(floating.style.animation).toContain("overlay-float-up");
    expect(floating).toHaveAttribute("aria-hidden", "true");
  });

  it("오른쪽 배치에서는 숫자 왼쪽에 붙여 화면 오른쪽 밖으로 넘치지 않는다", async () => {
    search = "position=bottom-right";
    const { floating } = await renderWithChange();
    expect(floating.style.right).toBe("100%");
    expect(floating.style.left).toBe("");
  });
});
