// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { summarizeHourly } from "../HourlyActivityChart";
import { summarizeDaily } from "../DailyActivityChart";
import { StatsCardGrid } from "../StatsCardGrid";
import { DonorRankingTable } from "../DonorRankingTable";

// UX-60: 차트 aria-label이 고정 문구 대신 데이터 요약을 담는다
describe("summarizeHourly", () => {
  it("가장 많은 시간대와 총 횟수를 요약한다", () => {
    const label = summarizeHourly([
      { hour: 9, eventCount: 3, adds: 2, subtracts: 1, addedSeconds: 7200 },
      { hour: 21, eventCount: 7, adds: 5, subtracts: 2, addedSeconds: 18000 },
      { hour: 22, eventCount: 0, adds: 0, subtracts: 0, addedSeconds: 0 },
    ]);
    expect(label).toBe("시간대별 이벤트 횟수 그래프, 최다 21시 7회, 총 10회");
  });

  it("기록이 없으면 그렇게 알린다", () => {
    expect(summarizeHourly([{ hour: 0, eventCount: 0, adds: 0, subtracts: 0, addedSeconds: 0 }])).toBe(
      "시간대별 이벤트 횟수 그래프, 기록 없음",
    );
  });
});

describe("summarizeDaily", () => {
  it("기간과 추가·차감 합계, 추가가 가장 많은 날을 요약한다", () => {
    const label = summarizeDaily([
      { date: "2026-03-01", eventCount: 2, addedSeconds: 3600, subtractedSeconds: 0 },
      { date: "2026-03-02", eventCount: 4, addedSeconds: 18000, subtractedSeconds: 1800 },
    ]);
    expect(label).toBe("일별 활동 그래프(2일), 추가 합계 6시간, 차감 합계 30분, 추가 최다 3월 2일 5시간");
  });

  it("추가가 없으면 최다 날짜를 생략한다", () => {
    const label = summarizeDaily([
      { date: "2026-03-01", eventCount: 1, addedSeconds: 0, subtractedSeconds: 600 },
    ]);
    expect(label).toBe("일별 활동 그래프(1일), 추가 합계 0분, 차감 합계 10분");
  });
});

// UX-61: 시간 값을 초로 다시 쓴 보조문구는 없앤다
describe("StatsCardGrid", () => {
  it("후원·차감 시간 카드에 초 단위 보조문구를 붙이지 않는다", () => {
    render(
      <StatsCardGrid
        summary={{
          totalAddedSeconds: 300900,
          totalSubtractedSeconds: 9000,
          netAddedSeconds: 291900,
          totalEvents: 12,
          uniqueDonors: 4,
          peakHour: 21,
        }}
      />,
    );
    expect(screen.queryByText(/300,900초/)).not.toBeInTheDocument();
    expect(screen.queryByText(/9,000초/)).not.toBeInTheDocument();
    expect(screen.getByText("추가가 더 많음")).toBeInTheDocument();
  });
});

// UX-62: 열 이름을 카드의 '후원 시간'과 맞추고 넓은 화면에서 표 폭을 제한한다
describe("DonorRankingTable", () => {
  it("시간 열 이름이 '후원 시간'이고 표 폭이 제한된다", () => {
    render(<DonorRankingTable donors={[{ actorName: "치즈냥", totalSeconds: 3600, eventCount: 1 }]} />);
    const header = screen.getByRole("columnheader", { name: "후원 시간" });
    expect(header.closest("table")?.className).toContain("max-w-2xl");
  });
});
