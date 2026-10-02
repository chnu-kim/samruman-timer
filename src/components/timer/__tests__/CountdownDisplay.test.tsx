// @vitest-environment jsdom
import { render, screen, act } from "@testing-library/react";
import { CountdownDisplay, formatTime } from "../CountdownDisplay";

describe("formatTime", () => {
  it("formats zero seconds", () => {
    expect(formatTime(0)).toBe("00:00:00");
  });

  it("formats seconds only", () => {
    expect(formatTime(45)).toBe("00:00:45");
  });

  it("formats minutes and seconds", () => {
    expect(formatTime(125)).toBe("00:02:05");
  });

  it("formats hours, minutes, and seconds", () => {
    expect(formatTime(3661)).toBe("01:01:01");
  });

  it("treats negative values as zero", () => {
    expect(formatTime(-100)).toBe("00:00:00");
  });

  it("formats large values", () => {
    expect(formatTime(360000)).toBe("100:00:00");
  });
});

describe("CountdownDisplay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders remaining time with timer role", () => {
    render(
      <CountdownDisplay remainingSeconds={3600} status="RUNNING" />,
    );
    const timer = screen.getByRole("timer");
    expect(timer).toHaveTextContent("01:00:00");
  });

  it("shows expired style when status is EXPIRED", () => {
    render(
      <CountdownDisplay remainingSeconds={0} status="EXPIRED" />,
    );
    const timer = screen.getByRole("timer");
    expect(timer).toHaveTextContent("00:00:00");
    expect(timer.className).toContain("text-muted-foreground");
  });

  it("shows scheduled style when status is SCHEDULED", () => {
    render(
      <CountdownDisplay remainingSeconds={7200} status="SCHEDULED" />,
    );
    const timer = screen.getByRole("timer");
    expect(timer.className).toContain("text-purple-600");
    expect(timer).toHaveAttribute("aria-label", expect.stringContaining("예약 시간"));
  });

  it("counts down every second when RUNNING", () => {
    render(
      <CountdownDisplay remainingSeconds={5} status="RUNNING" />,
    );
    expect(screen.getByRole("timer")).toHaveTextContent("00:00:05");

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole("timer")).toHaveTextContent("00:00:03");

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole("timer")).toHaveTextContent("00:00:00");
  });

  it("does not count below zero", () => {
    render(
      <CountdownDisplay remainingSeconds={1} status="RUNNING" />,
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole("timer")).toHaveTextContent("00:00:00");
  });

  it("does not tick when status is not RUNNING", () => {
    render(
      <CountdownDisplay remainingSeconds={100} status="EXPIRED" />,
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole("timer")).toHaveTextContent("00:01:40");
  });

  it("5분 미만이면 진한 amber 글자와 느린 펄스 클래스를 쓴다", () => {
    render(
      <CountdownDisplay remainingSeconds={240} status="RUNNING" />,
    );
    const timer = screen.getByRole("timer");
    expect(timer.className).toContain("text-amber-700");
    expect(timer.className).toContain("dark:text-amber-400");
    expect(timer.className).toContain("animate-pulse-urgent-slow");
    expect(timer.className).not.toContain("animate-pulse-urgent-fast");
    // 동작 줄이기 규칙이 적용되도록 펄스를 인라인 style로 넣지 않는다
    expect(timer.style.animation).toBe("");
  });

  it("1분 미만이면 진한 red 글자와 빠른 펄스 클래스를 쓴다", () => {
    render(
      <CountdownDisplay remainingSeconds={45} status="RUNNING" />,
    );
    const timer = screen.getByRole("timer");
    expect(timer.className).toContain("text-red-600");
    expect(timer.className).toContain("dark:text-red-400");
    expect(timer.className).toContain("animate-pulse-urgent-fast");
    expect(timer.className).not.toContain("animate-pulse-urgent-slow");
    expect(timer.style.animation).toBe("");
  });

  it("5분 이상이면 긴급 색과 펄스가 없다", () => {
    render(
      <CountdownDisplay remainingSeconds={300} status="RUNNING" />,
    );
    const timer = screen.getByRole("timer");
    expect(timer.className).not.toMatch(/text-(amber|red)-/);
    expect(timer.className).not.toContain("animate-pulse-urgent");
  });

  it("renders compact size by default with subtext placeholder", () => {
    render(
      <CountdownDisplay remainingSeconds={60} status="RUNNING" />,
    );
    const timer = screen.getByRole("timer");
    expect(timer.className).toContain("text-lg");
  });

  it("renders large size when specified", () => {
    render(
      <CountdownDisplay remainingSeconds={60} status="RUNNING" size="large" />,
    );
    const timer = screen.getByRole("timer");
    expect(timer.className).toContain("text-5xl");
  });

  it("shows scheduled start time in compact mode", () => {
    const startAt = "2026-03-15T10:00:00Z";
    render(
      <CountdownDisplay
        remainingSeconds={7200}
        status="SCHEDULED"
        scheduledStartAt={startAt}
        size="compact"
      />,
    );
    expect(screen.getByText(/시작 대기 중/)).toBeInTheDocument();
  });
});

describe("CountdownDisplay 서브텍스트", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // UX-49: 경과 시간은 시각처럼 읽히지 않게 단위를 붙인다
  it("경과 시간을 '72시간 2분 경과'처럼 단위로 표시한다", () => {
    const createdAt = new Date(Date.now() - (72 * 3600 + 2 * 60 + 53) * 1000).toISOString();
    render(
      <CountdownDisplay remainingSeconds={3600} status="RUNNING" createdAt={createdAt} size="large" />,
    );
    expect(screen.getByText(/종료 예정/)).toHaveTextContent("(72시간 2분 경과)");
    expect(screen.getByText(/종료 예정/)).not.toHaveTextContent("72:02:53");
  });

  it("경과가 1분 미만이면 경과를 생략한다", () => {
    const createdAt = new Date(Date.now() - 30 * 1000).toISOString();
    render(
      <CountdownDisplay remainingSeconds={3600} status="RUNNING" createdAt={createdAt} size="large" />,
    );
    expect(screen.getByText(/종료 예정/)).not.toHaveTextContent("경과");
  });

  // UX-54: 만료 상태에도 상태를 알리는 서브텍스트를 둔다
  it("large 만료 상태에서 '만료됨'을 표시한다", () => {
    render(<CountdownDisplay remainingSeconds={0} status="EXPIRED" size="large" />);
    expect(screen.getByText("만료됨")).toBeInTheDocument();
  });

  it("compact 만료 상태에서는 '만료됨'을 넣지 않는다", () => {
    render(<CountdownDisplay remainingSeconds={0} status="EXPIRED" />);
    expect(screen.queryByText("만료됨")).not.toBeInTheDocument();
  });
});
