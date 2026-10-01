import { describe, it, expect } from "vitest";
import {
  formatDelta,
  detectTimerChange,
  isStaleResponse,
} from "@/lib/overlay-animation";

describe("formatDelta", () => {
  it("초 단위 (60초 미만)", () => {
    expect(formatDelta(0)).toBe("0초");
    expect(formatDelta(1)).toBe("1초");
    expect(formatDelta(30)).toBe("30초");
    expect(formatDelta(59)).toBe("59초");
  });

  it("분:초 형식 (1분 이상, 1시간 미만)", () => {
    expect(formatDelta(60)).toBe("1:00");
    expect(formatDelta(90)).toBe("1:30");
    expect(formatDelta(600)).toBe("10:00");
    expect(formatDelta(3599)).toBe("59:59");
  });

  it("시:분:초 형식 (1시간 이상)", () => {
    expect(formatDelta(3600)).toBe("1:00:00");
    expect(formatDelta(3661)).toBe("1:01:01");
    expect(formatDelta(7200)).toBe("2:00:00");
    expect(formatDelta(86400)).toBe("24:00:00");
  });

  it("분/초가 한 자리일 때 0으로 패딩", () => {
    expect(formatDelta(61)).toBe("1:01");
    expect(formatDelta(3601)).toBe("1:00:01");
    expect(formatDelta(3660)).toBe("1:01:00");
  });
});

describe("detectTimerChange", () => {
  const BASE_TIME = 1700000000000; // 고정 기준 시간

  it("updatedAt이 동일하면 null 반환 (자연 감소)", () => {
    const result = detectTimerChange(
      { remainingSeconds: 1000, updatedAt: "2024-01-01T00:00:00Z", fetchedAt: BASE_TIME, status: "RUNNING" },
      { remainingSeconds: 995, updatedAt: "2024-01-01T00:00:00Z" },
      BASE_TIME + 5000,
    );
    expect(result).toBeNull();
  });

  it("시간 추가 감지 → overlay-anim-add + 초록 텍스트", () => {
    const result = detectTimerChange(
      { remainingSeconds: 1000, updatedAt: "2024-01-01T00:00:00Z", fetchedAt: BASE_TIME, status: "RUNNING" },
      { remainingSeconds: 1600, updatedAt: "2024-01-01T00:00:05Z" },
      BASE_TIME + 5000, // 5초 경과
    );
    // 기대값: delta = 1600 - (1000 - 5) = 605
    expect(result).not.toBeNull();
    expect(result!.animClass).toBe("overlay-anim-add");
    expect(result!.floatingText).toBe("+10:05");
  });

  it("시간 차감 감지 → overlay-anim-subtract + 빨간 텍스트", () => {
    const result = detectTimerChange(
      { remainingSeconds: 1000, updatedAt: "2024-01-01T00:00:00Z", fetchedAt: BASE_TIME, status: "RUNNING" },
      { remainingSeconds: 695, updatedAt: "2024-01-01T00:00:05Z" },
      BASE_TIME + 5000,
    );
    // 기대값: delta = 695 - (1000 - 5) = -300
    expect(result).not.toBeNull();
    expect(result!.animClass).toBe("overlay-anim-subtract");
    expect(result!.floatingText).toBe("-5:00");
  });

  it("delta 절대값 2초 이내면 null 반환 (오차 무시)", () => {
    const result = detectTimerChange(
      { remainingSeconds: 1000, updatedAt: "2024-01-01T00:00:00Z", fetchedAt: BASE_TIME, status: "RUNNING" },
      { remainingSeconds: 997, updatedAt: "2024-01-01T00:00:05Z" },
      BASE_TIME + 5000,
    );
    // delta = 997 - (1000 - 5) = 2 → |2| <= 2이므로 null
    expect(result).toBeNull();
  });

  it("delta 절대값 3초 이상이면 감지", () => {
    const result = detectTimerChange(
      { remainingSeconds: 1000, updatedAt: "2024-01-01T00:00:00Z", fetchedAt: BASE_TIME, status: "RUNNING" },
      { remainingSeconds: 998, updatedAt: "2024-01-01T00:00:05Z" },
      BASE_TIME + 5000,
    );
    // delta = 998 - (1000 - 5) = 3 → |3| > 2이므로 감지
    expect(result).not.toBeNull();
    expect(result!.animClass).toBe("overlay-anim-add");
    expect(result!.floatingText).toBe("+3초");
  });

  it("큰 시간 추가 시 시:분:초 형식", () => {
    const result = detectTimerChange(
      { remainingSeconds: 100, updatedAt: "2024-01-01T00:00:00Z", fetchedAt: BASE_TIME, status: "RUNNING" },
      { remainingSeconds: 3800, updatedAt: "2024-01-01T00:00:05Z" },
      BASE_TIME + 5000,
    );
    // delta = 3800 - (100 - 5) = 3705 → 1시간 1분 45초
    expect(result).not.toBeNull();
    expect(result!.floatingText).toBe("+1:01:45");
  });

  it("폴링 간격 0초 (즉시 재폴링)", () => {
    const result = detectTimerChange(
      { remainingSeconds: 500, updatedAt: "2024-01-01T00:00:00Z", fetchedAt: BASE_TIME, status: "RUNNING" },
      { remainingSeconds: 800, updatedAt: "2024-01-01T00:00:01Z" },
      BASE_TIME, // 0초 경과
    );
    // delta = 800 - (500 - 0) = 300
    expect(result).not.toBeNull();
    expect(result!.animClass).toBe("overlay-anim-add");
    expect(result!.floatingText).toBe("+5:00");
  });

  it("정확히 1분 차감", () => {
    const result = detectTimerChange(
      { remainingSeconds: 3600, updatedAt: "2024-01-01T00:00:00Z", fetchedAt: BASE_TIME, status: "RUNNING" },
      { remainingSeconds: 3535, updatedAt: "2024-01-01T00:00:05Z" },
      BASE_TIME + 5000,
    );
    // delta = 3535 - (3600 - 5) = -60
    expect(result).not.toBeNull();
    expect(result!.animClass).toBe("overlay-anim-subtract");
    expect(result!.floatingText).toBe("-1:00");
  });

  it("만료 상태에서 시간 추가 → 만료 중 경과 시간은 변경량에 포함하지 않음", () => {
    const result = detectTimerChange(
      { remainingSeconds: 0, updatedAt: "2024-01-01T00:00:00Z", fetchedAt: BASE_TIME, status: "EXPIRED" },
      { remainingSeconds: 60, updatedAt: "2024-01-01T00:01:00Z" },
      BASE_TIME + 60000, // 만료 상태로 60초 경과 후 +60초
    );
    expect(result).not.toBeNull();
    expect(result!.floatingText).toBe("+1:00");
  });

  it("RUNNING이었지만 폴링 사이에 0초에 도달한 뒤 추가 → 0 아래로 내려가지 않음", () => {
    const result = detectTimerChange(
      { remainingSeconds: 3, updatedAt: "2024-01-01T00:00:00Z", fetchedAt: BASE_TIME, status: "RUNNING" },
      { remainingSeconds: 60, updatedAt: "2024-01-01T00:00:10Z" },
      BASE_TIME + 10000, // 3초 남은 상태에서 10초 경과 → 기대 잔여 0
    );
    expect(result!.floatingText).toBe("+1:00");
  });

  it("예약(SCHEDULED)에서 활성화되어 카운트다운이 시작된 것은 시간 변경이 아님", () => {
    const result = detectTimerChange(
      { remainingSeconds: 600, updatedAt: "2024-01-01T00:00:00Z", fetchedAt: BASE_TIME, status: "SCHEDULED" },
      { remainingSeconds: 595, updatedAt: "2024-01-01T00:00:30Z" },
      BASE_TIME + 30000, // 폴링 사이에 활성화되어 5초 진행
    );
    expect(result).toBeNull();
  });
});

describe("isStaleResponse", () => {
  const snap = { remainingSeconds: 600, updatedAt: "2024-01-01T00:00:10.000Z", fetchedAt: 0, status: "RUNNING" as const };

  it("직전 스냅샷이 없으면 stale 아님", () => {
    expect(isStaleResponse(null, { updatedAt: "2024-01-01T00:00:00.000Z" })).toBe(false);
  });

  it("더 오래된 updatedAt 응답은 stale (늦게 도착한 이전 폴링)", () => {
    expect(isStaleResponse(snap, { updatedAt: "2024-01-01T00:00:05.000Z" })).toBe(true);
  });

  it("같거나 새로운 updatedAt은 stale 아님", () => {
    expect(isStaleResponse(snap, { updatedAt: "2024-01-01T00:00:10.000Z" })).toBe(false);
    expect(isStaleResponse(snap, { updatedAt: "2024-01-01T00:00:15.000Z" })).toBe(false);
  });
});
