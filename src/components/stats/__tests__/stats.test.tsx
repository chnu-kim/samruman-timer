// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { summarizeHourly } from "../HourlyActivityChart";
import {
  summarizeDaily,
  fillDailyWindow,
  signedDurationTicks,
  formatSignedDurationTick,
} from "../DailyActivityChart";
import { StatsCardGrid, formatNetDuration } from "../StatsCardGrid";
import { DonorRankingTable } from "../DonorRankingTable";

// UX-60: 차트 aria-label이 고정 문구 대신 데이터 요약을 담는다
describe("summarizeHourly", () => {
  it("가장 많은 시간대와 총 횟수를 요약한다", () => {
    const label = summarizeHourly([
      { hour: 9, eventCount: 3, adds: 2, subtracts: 1, addedSeconds: 7200 },
      { hour: 21, eventCount: 7, adds: 5, subtracts: 2, addedSeconds: 18000 },
      { hour: 22, eventCount: 0, adds: 0, subtracts: 0, addedSeconds: 0 },
    ]);
    expect(label).toBe("시간대별 변경 횟수 그래프, 최다 21시 7회, 총 10회");
  });

  it("기록이 없으면 그렇게 알린다", () => {
    expect(summarizeHourly([{ hour: 0, eventCount: 0, adds: 0, subtracts: 0, addedSeconds: 0 }])).toBe(
      "시간대별 변경 횟수 그래프, 기록 없음",
    );
  });
});

describe("summarizeDaily", () => {
  it("기간과 추가·차감 합계, 추가가 가장 많은 날을 요약한다", () => {
    const label = summarizeDaily([
      { date: "2026-03-01", eventCount: 2, addedSeconds: 3600, subtractedSeconds: 0 },
      { date: "2026-03-02", eventCount: 4, addedSeconds: 18000, subtractedSeconds: 1800 },
    ]);
    expect(label).toBe("일별 활동 그래프(기록 있는 날 2일), 추가 합계 6시간, 차감 합계 30분, 추가 최다 3월 2일 5시간");
  });

  it("추가가 없으면 최다 날짜를 생략한다", () => {
    const label = summarizeDaily([
      { date: "2026-03-01", eventCount: 1, addedSeconds: 0, subtractedSeconds: 600 },
    ]);
    expect(label).toBe("일별 활동 그래프(기록 있는 날 1일), 추가 합계 0분, 차감 합계 10분");
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
  });

  // W22(C130·C091): 순 추가에 부호를 넣고 숫자를 되풀이하는 보조문구는 지운다. 용어는 콘솔(추가·시청자·변경)과 맞춘다
  it("순 추가에 부호를 붙이고 되풀이 보조문구를 두지 않는다", () => {
    render(
      <StatsCardGrid
        summary={{
          totalAddedSeconds: 48000,
          totalSubtractedSeconds: 1800,
          netAddedSeconds: 46200,
          totalEvents: 15,
          uniqueDonors: 10,
          peakHour: 6,
        }}
      />,
    );
    expect(screen.getByText("+12시간 50분")).toBeInTheDocument();
    for (const caption of ["추가가 더 많음", "추가 + 차감", "가장 활발한 시간"]) {
      expect(screen.queryByText(caption)).not.toBeInTheDocument();
    }
    for (const label of ["총 추가 시간", "변경 횟수", "시청자 수"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(document.body.textContent).not.toMatch(/후원|이벤트/);
  });
});

describe("formatNetDuration", () => {
  it("방향을 부호로 보이고 0에는 부호를 붙이지 않는다", () => {
    expect(formatNetDuration(46200)).toBe("+12시간 50분");
    expect(formatNetDuration(-1800)).toBe("-30분");
    expect(formatNetDuration(0)).toBe("0분");
  });
});

// W22(C081): 기록이 하루뿐이어도 30일 축을 채워 막대가 화면을 채우지 않게 한다
describe("fillDailyWindow", () => {
  it("마지막 기록일까지 30일을 0으로 채운다(월 경계 포함)", () => {
    const days = fillDailyWindow([
      { date: "2026-03-02", eventCount: 3, addedSeconds: 3600, subtractedSeconds: 600 },
    ]);
    expect(days).toHaveLength(30);
    expect(days[0].date).toBe("2026-02-01");
    expect(days[27].date).toBe("2026-02-28");
    expect(days[28].date).toBe("2026-03-01");
    expect(days[29]).toEqual({ date: "2026-03-02", eventCount: 3, addedSeconds: 3600, subtractedSeconds: 600 });
    expect(days[28]).toEqual({ date: "2026-03-01", eventCount: 0, addedSeconds: 0, subtractedSeconds: 0 });
  });

  it("30일보다 오래된 기록은 창 밖으로 빠진다", () => {
    const days = fillDailyWindow([
      { date: "2026-01-01", eventCount: 1, addedSeconds: 60, subtractedSeconds: 0 },
      { date: "2026-03-02", eventCount: 1, addedSeconds: 60, subtractedSeconds: 0 },
    ]);
    expect(days.map((d) => d.date)).not.toContain("2026-01-01");
    expect(days.filter((d) => d.eventCount > 0)).toHaveLength(1);
  });
});

// W22(C082): 차감은 0선 아래 음수 눈금으로, 콘솔 그래프와 같은 단위('4시간'·'30분')를 쓴다
describe("signedDurationTicks", () => {
  it("0을 사이에 두고 같은 간격으로 위아래 눈금을 만든다", () => {
    const ticks = signedDurationTicks(13 * 3600 + 20 * 60, 1800);
    expect(ticks).toEqual([-4, 0, 4, 8, 12, 16].map((h) => h * 3600));
    expect(ticks.map((t) => formatSignedDurationTick(t, ticks))).toEqual([
      "-4시간", "0", "4시간", "8시간", "12시간", "16시간",
    ]);
  });

  it("차감이 없으면 음수 눈금을 만들지 않는다", () => {
    expect(signedDurationTicks(3600, 0)[0]).toBe(0);
  });

  it("1시간 미만이면 분 단위로 쓴다", () => {
    const ticks = signedDurationTicks(1800, 600);
    expect(ticks.map((t) => formatSignedDurationTick(t, ticks))).toEqual(["-10분", "0", "10분", "20분", "30분"]);
  });
});

// UX-62·W22(C091): 열 이름을 카드의 '총 추가 시간'과 맞추고 넓은 화면에서 표 폭을 제한한다
// W22(C043): 순위는 모두 숫자(이모지 메달 없음), 1~3위만 굵게
describe("DonorRankingTable", () => {
  const donors = ["치즈냥", "바다곰", "벌칙룰렛", "별빛소녀"].map((actorName, i) => ({
    actorName,
    totalSeconds: 3600 * (4 - i),
    eventCount: 1,
  }));

  it("시간 열 이름이 '추가 시간'이고 표 폭이 제한된다", () => {
    render(<DonorRankingTable donors={donors} />);
    const header = screen.getByRole("columnheader", { name: "추가 시간" });
    expect(header.closest("table")?.className).toContain("max-w-2xl");
    expect(screen.getByRole("columnheader", { name: "횟수" })).toBeInTheDocument();
  });

  it("순위를 숫자로 쓰고 1~3위만 굵게 한다", () => {
    const { container } = render(<DonorRankingTable donors={donors} />);
    expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(container.textContent).not.toMatch(/\d위/);
    const ranks = [...container.querySelectorAll("tbody td:first-child span")];
    expect(ranks.map((r) => r.textContent)).toEqual(["1", "2", "3", "4"]);
    expect(ranks.map((r) => r.className.includes("font-semibold"))).toEqual([true, true, true, false]);
  });
});
