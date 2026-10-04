import { changeTimeField, EMPTY_TIME_FIELDS, normalizeTimeParts, parseTimeField, resolveQuickActor, splitSeconds, timeFieldsToSeconds } from "../timer-input";

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

describe("다이얼로그 시간 입력칸", () => {
  it("빈 칸·숫자가 아닌 값·음수는 0으로 읽고, 총 초는 정수로 내린다", () => {
    expect(parseTimeField("")).toBe(0);
    expect(parseTimeField("abc")).toBe(0);
    expect(parseTimeField("-3")).toBe(0);
    expect(timeFieldsToSeconds({ hours: "1", minutes: "", seconds: "5" })).toBe(3605);
    expect(timeFieldsToSeconds({ hours: "", minutes: "", seconds: "1.9" })).toBe(1);
  });

  // 보이는 값과 적용될 값이 어긋나지 않게 한다(1.5시간이 보이는데 1시간이 적용되면 안 된다)
  it("정수가 아닌 값·음수는 정규화해 다시 쓴다", () => {
    expect(changeTimeField(EMPTY_TIME_FIELDS, "hours", "1.5")).toEqual({ hours: "1", minutes: "30", seconds: "" });
    expect(changeTimeField({ hours: "2", minutes: "", seconds: "" }, "minutes", "-5")).toEqual({ hours: "2", minutes: "", seconds: "" });
    expect(changeTimeField(EMPTY_TIME_FIELDS, "minutes", "05")).toEqual({ hours: "", minutes: "05", seconds: "" });
  });

  // R13: 칸을 지우면 빈 칸으로 남아야 한다(이전에는 Number("")가 0이 되어 '0'이 다시 채워졌다)
  it("칸을 지우면 빈 문자열이 그대로 남는다", () => {
    expect(changeTimeField({ hours: "2", minutes: "", seconds: "" }, "hours", "")).toEqual(EMPTY_TIME_FIELDS);
  });

  it("분·초가 60 이상이면 윗자리로 올리고 0인 칸은 비운다", () => {
    expect(changeTimeField(EMPTY_TIME_FIELDS, "minutes", "90")).toEqual({ hours: "1", minutes: "30", seconds: "" });
    expect(changeTimeField({ hours: "", minutes: "59", seconds: "" }, "seconds", "60")).toEqual({ hours: "1", minutes: "", seconds: "" });
  });
});

describe("resolveQuickActor", () => {
  it("입력한 이름이 기본 닉네임보다 우선하고, 비면 기본 닉네임을 쓴다", () => {
    expect(resolveQuickActor(" 벌칙룰렛 ", "삼루먼")).toBe("벌칙룰렛");
    expect(resolveQuickActor("   ", "삼루먼")).toBe("삼루먼");
    expect(resolveQuickActor("", "")).toBe("");
  });
});
