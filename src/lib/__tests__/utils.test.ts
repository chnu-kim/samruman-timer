import { describe, it, expect } from "vitest";
import { formatAxisSeconds, formatHoursFromSeconds, formatTimestampShort, formatHourShort } from "@/lib/utils";

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

describe("formatHourShort", () => {
  it("ISO 문자열을 MM. DD. HH시 형식으로 변환한다", () => {
    const result = formatHourShort("2025-06-15T14:00:00Z");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

// UX-27: 정수 시간으로 반올림하면 '1h, 1h, 1h, 0h'처럼 눈금이 겹치고 5.5h가 '6h'로 나온다
describe("formatAxisSeconds", () => {
  it("최댓값이 2시간 이상이면 시간 단위로 소수 한 자리까지 쓴다", () => {
    const max = 16.5 * 3600;
    expect(formatAxisSeconds(5.5 * 3600, max)).toBe("5.5h");
    expect(formatAxisSeconds(16.5 * 3600, max)).toBe("16.5h");
    expect(formatAxisSeconds(2 * 3600, max)).toBe("2h");
    expect(formatAxisSeconds(0, max)).toBe("0h");
  });

  it("최댓값이 2시간 미만이면 분 단위를 써서 눈금 라벨이 겹치지 않는다", () => {
    const max = 4000;
    const labels = [0, 1000, 2000, 3000, 4000].map((v) => formatAxisSeconds(v, max));
    expect(labels).toEqual(["0m", "16.7m", "33.3m", "50m", "66.7m"]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("2시간 경계에서 단위를 바꾼다", () => {
    expect(formatAxisSeconds(3600, 7199)).toBe("60m");
    expect(formatAxisSeconds(3600, 7200)).toBe("1h");
  });
});
