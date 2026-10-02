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
