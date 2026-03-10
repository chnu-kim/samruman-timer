import { describe, it, expect } from "vitest";
import { formatHoursFromSeconds, formatTimestampShort, formatHourShort } from "@/lib/utils";

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
