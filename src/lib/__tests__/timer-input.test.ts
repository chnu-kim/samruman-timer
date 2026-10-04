import { normalizeTimeParts, resolveQuickActor, splitSeconds } from "../timer-input";

describe("normalizeTimeParts", () => {
  it("60 이상의 분·초를 윗자리로 올린다", () => {
    expect(normalizeTimeParts(0, 90, 0)).toEqual({ hours: 1, minutes: 30, seconds: 0 });
    expect(normalizeTimeParts(0, 0, 75)).toEqual({ hours: 0, minutes: 1, seconds: 15 });
    expect(normalizeTimeParts(2, 59, 75)).toEqual({ hours: 3, minutes: 0, seconds: 15 });
  });

  it("음수·NaN은 0으로, 소수는 초 단위로 내린다", () => {
    expect(normalizeTimeParts(-1, Number.NaN, 5)).toEqual({ hours: 0, minutes: 0, seconds: 5 });
    expect(normalizeTimeParts(1.5, 0, 0)).toEqual({ hours: 1, minutes: 30, seconds: 0 });
    expect(normalizeTimeParts(0, 0, 1.9)).toEqual({ hours: 0, minutes: 0, seconds: 1 });
  });
});

describe("splitSeconds", () => {
  it("총 초를 시·분·초로 나눈다", () => {
    expect(splitSeconds(3725)).toEqual({ hours: 1, minutes: 2, seconds: 5 });
    expect(splitSeconds(Number.POSITIVE_INFINITY)).toEqual({ hours: 0, minutes: 0, seconds: 0 });
  });
});

describe("resolveQuickActor", () => {
  it("입력한 이름이 기본 닉네임보다 우선하고, 비면 기본 닉네임을 쓴다", () => {
    expect(resolveQuickActor(" 벌칙룰렛 ", "삼루먼")).toBe("벌칙룰렛");
    expect(resolveQuickActor("   ", "삼루먼")).toBe("삼루먼");
    expect(resolveQuickActor("", "")).toBe("");
  });
});
