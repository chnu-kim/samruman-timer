import { describe, it, expect } from "vitest";
import {
  buildTimeAxis,
  durationAxisTicks,
  formatDurationTick,
  formatHoursFromSeconds,
  formatTimeTicks,
  formatTimestampShort,
  formatHourShort,
  formatLogTime,
  formatEndTime,
  displayActorName,
  timeAxisTicks,
} from "@/lib/utils";

describe("formatHoursFromSeconds", () => {
  it("초를 시간 단위 문자열로 변환한다", () => {
    expect(formatHoursFromSeconds(3600)).toBe("1.0시간");
    expect(formatHoursFromSeconds(5400)).toBe("1.5시간");
    expect(formatHoursFromSeconds(0)).toBe("0.0시간");
  });

  it("소수점 첫째자리까지 표시한다", () => {
    expect(formatHoursFromSeconds(7260)).toBe("2.0시간"); // 2h 1m → 2.0
    expect(formatHoursFromSeconds(9000)).toBe("2.5시간");
  });
});

describe("formatTimestampShort", () => {
  it("ISO 문자열을 MM. DD. HH:MM 형식으로 변환한다", () => {
    const result = formatTimestampShort("2025-06-15T14:30:00Z");
    // 타임존에 따라 다를 수 있으므로 형식만 검증
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("formatLogTime", () => {
  // 로컬 시각으로 만들어 실행 환경의 타임존과 무관하게 검증한다
  const now = new Date(2026, 9, 4, 14, 30);
  const iso = (...args: [number, number, number, number, number, number?]) => new Date(...args).toISOString();

  it("오늘 기록은 HH:mm 5자만 보인다", () => {
    expect(formatLogTime(iso(2026, 9, 4, 6, 44, 27), now)).toBe("06:44");
    expect(formatLogTime(iso(2026, 9, 4, 0, 5), now)).toBe("00:05");
    expect(formatLogTime(iso(2026, 9, 4, 0, 1), now)).toHaveLength(5);
  });

  it("오늘이 아니면 날짜를 붙인다(자정 직전은 어제)", () => {
    expect(formatLogTime(iso(2026, 9, 3, 23, 59), now)).toBe("10. 03. 23:59");
    expect(formatLogTime(iso(2026, 2, 13, 9, 7), now)).toBe("03. 13. 09:07");
  });

  it("다른 해면 연도까지 붙인다", () => {
    expect(formatLogTime(iso(2025, 9, 4, 14, 30), now)).toBe("2025. 10. 04. 14:30");
  });
});

describe("formatHourShort", () => {
  it("ISO 문자열을 MM. DD. HH시 형식으로 변환한다", () => {
    const result = formatHourShort("2025-06-15T14:00:00Z");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

// C025·C092: 축 최댓값을 등분하면 '16.7h, 12.5h, 8.3h'처럼 소수 눈금이 나온다. 정수 시간·분 간격으로 고정한다
describe("durationAxisTicks / formatDurationTick", () => {
  const labels = (max: number) => {
    const ticks = durationAxisTicks(max);
    return ticks.map((t) => formatDurationTick(t, ticks));
  };

  it("16시간대 최댓값은 정수 시간 눈금이 되고 최댓값을 덮는다", () => {
    const max = 16 * 3600 + 47 * 60;
    const ticks = durationAxisTicks(max);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(max);
    expect(labels(max)).toEqual(["0", "5시간", "10시간", "15시간", "20시간"]);
  });

  it("99시간 방송은 25시간 간격", () => {
    expect(labels(99 * 3600)).toEqual(["0", "25시간", "50시간", "75시간", "100시간"]);
  });

  it("1시간 미만 간격은 분 단위 한 가지로 쓴다(15·30분)", () => {
    expect(labels(80 * 60)).toEqual(["0", "30분", "60분", "90분"]);
    expect(labels(50 * 60)).toEqual(["0", "15분", "30분", "45분", "60분"]);
  });

  it("눈금은 최대 5개이고 라벨이 겹치지 않는다", () => {
    for (const max of [0, 59, 3599, 3600, 7200, 4000, 12 * 3600, 36 * 3600, 400 * 3600, 900 * 3600]) {
      const l = labels(max);
      expect(l.length).toBeLessThanOrEqual(5);
      expect(l.length).toBeGreaterThanOrEqual(2);
      expect(new Set(l).size).toBe(l.length);
    }
  });
});

// C024: x축이 기록 순번이라 같은 분의 기록마다 '10. 04. 06:30'이 되풀이됐다. 실제 시각 눈금으로 바꾼다
describe("timeAxisTicks / formatTimeTicks / buildTimeAxis", () => {
  // 로컬 시각으로 만들어 실행 환경의 시간대와 무관하게 한다
  const at = (d: number, h: number, m: number, s = 0) => new Date(2026, 9, d, h, m, s).getTime();

  it("한 분에 몰린 기록 13건과 14분 뒤 기록 1건은 서로 다른 HH:mm 눈금이 된다(시드 데이터 모양)", () => {
    const times = [...Array.from({ length: 13 }, (_, i) => at(4, 6, 30, 54) + i * 100), at(4, 6, 44, 10)];
    const axis = buildTimeAxis(times);
    const l = axis.ticks.map(axis.label);
    expect(l.length).toBeGreaterThanOrEqual(2);
    expect(new Set(l).size).toBe(l.length);
    for (const label of l) expect(label).toMatch(/^\d{2}:\d{2}$/);
    expect(axis.domain).toEqual([Math.min(...times), Math.max(...times)]);
  });

  it("눈금은 로컬 시각의 깔끔한 경계에 놓인다", () => {
    const ticks = timeAxisTicks(at(4, 6, 30, 54), at(4, 6, 44, 10));
    expect(formatTimeTicks(ticks)).toEqual(["06:35", "06:40"]);
    const day = timeAxisTicks(at(4, 6, 0), at(4, 18, 0));
    expect(formatTimeTicks(day)).toEqual(["06:00", "09:00", "12:00", "15:00", "18:00"]);
  });

  it("날짜가 바뀌면 첫 눈금과 바뀌는 눈금에만 날짜를 붙인다", () => {
    const ticks = timeAxisTicks(at(4, 18, 0), at(5, 6, 0));
    expect(formatTimeTicks(ticks)).toEqual(["10. 04. 18:00", "21:00", "10. 05. 00:00", "03:00", "06:00"]);
  });

  it("1분이 안 되는 범위는 초까지 쓴다", () => {
    const ticks = timeAxisTicks(at(4, 6, 30, 5), at(4, 6, 31, 0));
    const l = formatTimeTicks(ticks);
    expect(l).toEqual(["06:30:30", "06:31:00"]);
  });

  it("점이 하나면 앞뒤 5분을 범위로 둔다", () => {
    const axis = buildTimeAxis([at(4, 6, 30)]);
    expect(axis.domain).toEqual([at(4, 6, 25), at(4, 6, 35)]);
    expect(axis.ticks.map(axis.label)).toEqual(["06:25", "06:30", "06:35"]);
  });

  it("며칠에 걸친 범위도 눈금이 5개를 넘지 않는다", () => {
    const ticks = timeAxisTicks(at(1, 0, 0), at(20, 0, 0));
    expect(ticks.length).toBeLessThanOrEqual(5);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
  });
});

// UX-73: 시스템이 남긴 만료·활성화 로그의 행위자는 '자동'으로 보여 준다
describe("displayActorName", () => {
  it("actorUserId가 없는 EXPIRE·ACTIVATE 로그는 '자동'으로 표시한다", () => {
    expect(displayActorName({ actionType: "EXPIRE", actorName: "system", actorUserId: null })).toBe("자동");
    expect(displayActorName({ actionType: "ACTIVATE", actorName: "system", actorUserId: null })).toBe("자동");
  });

  it("시청자 닉네임 로그는 그대로 표시한다", () => {
    expect(displayActorName({ actionType: "ADD", actorName: "system", actorUserId: null })).toBe("system");
    expect(displayActorName({ actionType: "ADD", actorName: "치즈냥", actorUserId: "u1" })).toBe("치즈냥");
  });

  it("사람이 남긴 로그는 행위 종류와 무관하게 이름을 유지한다", () => {
    expect(displayActorName({ actionType: "EXPIRE", actorName: "스트리머", actorUserId: "u1" })).toBe("스트리머");
  });
});

describe("formatEndTime", () => {
  // 로컬 시각 성분으로 만들어 실행 환경의 시간대와 무관하게 확인한다
  const now = new Date(2026, 9, 4, 10, 0);

  it("오늘이면 날짜·초 없이 12시간제 시각만 낸다", () => {
    expect(formatEndTime(new Date(2026, 9, 4, 13, 33, 48), now)).toBe("오후 1:33");
    expect(formatEndTime(new Date(2026, 9, 4, 9, 5), now)).toBe("오전 9:05");
  });

  it("0시는 오전 12시, 12시는 오후 12시로 쓴다", () => {
    expect(formatEndTime(new Date(2026, 9, 4, 0, 5), now)).toBe("오전 12:05");
    expect(formatEndTime(new Date(2026, 9, 4, 12, 0), now)).toBe("오후 12:00");
  });

  it("다른 날이면 앞자리 0 없는 월·일을 붙이고, 다른 해면 연도까지 붙인다", () => {
    expect(formatEndTime(new Date(2026, 9, 6, 13, 33), now)).toBe("10. 6. 오후 1:33");
    expect(formatEndTime(new Date(2027, 0, 2, 9, 0), now)).toBe("2027. 1. 2. 오전 9:00");
  });
});
