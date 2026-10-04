// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { RemainingChart, summarizeRemaining } from "../RemainingChart";
import { CumulativeChart, summarizeCumulative } from "../CumulativeChart";

// C075: 그래프 이름이 축 눈금을 이어 붙인 문자열이었다. 데이터 요약을 이름으로 준다
describe("summarizeRemaining", () => {
  it("기록 수·마지막 기록·최고값을 요약한다", () => {
    const label = summarizeRemaining([
      { timestamp: "2026-10-04T06:30:00Z", remainingSeconds: 3600 },
      { timestamp: "2026-10-04T06:31:00Z", remainingSeconds: 17 * 3600 + 36 * 60 },
      { timestamp: "2026-10-04T06:44:00Z", remainingSeconds: 16 * 3600 + 47 * 60 },
    ]);
    expect(label).toBe("잔여 시간 추이 그래프, 기록 3건, 마지막 기록 16시간 47분, 최고 17시간 36분");
  });

  it("마지막 기록이 최고값이면 최고를 생략한다", () => {
    const label = summarizeRemaining([
      { timestamp: "2026-10-04T06:30:00Z", remainingSeconds: 600 },
      { timestamp: "2026-10-04T06:31:00Z", remainingSeconds: 1200 },
    ]);
    expect(label).toBe("잔여 시간 추이 그래프, 기록 2건, 마지막 기록 20분");
  });
});

describe("summarizeCumulative", () => {
  it("마지막 시점의 누적 추가·차감을 요약한다", () => {
    const label = summarizeCumulative([
      { timestamp: "2026-10-04T06:30:00Z", totalAdded: 3600, totalSubtracted: 0 },
      { timestamp: "2026-10-04T06:44:00Z", totalAdded: 13 * 3600 + 20 * 60, totalSubtracted: 1800 },
    ]);
    expect(label).toBe("누적 변경량 그래프, 누적 추가 13시간 20분, 누적 차감 30분");
  });
});

describe("그래프 래퍼", () => {
  it("요약을 role=img 이름으로 노출한다", () => {
    // jsdom에는 레이아웃이 없어 ResponsiveContainer가 크기 경고를 낸다
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <>
        <RemainingChart points={[{ timestamp: "2026-10-04T06:30:00Z", remainingSeconds: 600 }]} />
        <CumulativeChart points={[{ timestamp: "2026-10-04T06:30:00Z", totalAdded: 600, totalSubtracted: 0 }]} />
      </>,
    );
    expect(screen.getByRole("img", { name: "잔여 시간 추이 그래프, 기록 1건, 마지막 기록 10분" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "누적 변경량 그래프, 누적 추가 10분, 누적 차감 0분" })).toBeInTheDocument();
    warn.mockRestore();
  });
});

// W29: 콘솔 그래프는 크기를 재기 전 첫 렌더에도 'width(-1) and height(-1)' 경고를 남기지 않는다
describe("잔여 시간 추이 첫 렌더", () => {
  it("크기를 재기 전에도 Recharts 크기 경고가 없다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<RemainingChart points={[{ timestamp: "2026-10-04T06:30:00Z", remainingSeconds: 600 }]} />);
    expect(warn.mock.calls.filter(([m]) => String(m).includes("should be greater than 0"))).toHaveLength(0);
    warn.mockRestore();
  });
});
