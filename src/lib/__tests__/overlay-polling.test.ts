import { classifyFailedResponse, nextPollDelay } from "@/lib/overlay-polling";

const res = (status: number, contentType?: string) => ({
  status,
  headers: new Headers(contentType ? { "content-type": contentType } : {}),
});

describe("classifyFailedResponse", () => {
  it("404는 not_found, 429는 rate_limited", () => {
    expect(classifyFailedResponse(res(404, "application/json"))).toBe("not_found");
    expect(classifyFailedResponse(res(429, "application/json"))).toBe("rate_limited");
  });

  it("HTML 5xx(프록시·CDN 일시 장애)는 긴 백오프가 아니라 server", () => {
    expect(classifyFailedResponse(res(503, "text/html; charset=UTF-8"))).toBe("server");
    expect(classifyFailedResponse(res(502, "text/html"))).toBe("server");
  });

  it("JSON 5xx와 content-type이 없는 응답은 server", () => {
    expect(classifyFailedResponse(res(500, "application/json"))).toBe("server");
    expect(classifyFailedResponse(res(502))).toBe("server");
    expect(classifyFailedResponse({ status: 500 })).toBe("server");
  });
});

describe("nextPollDelay", () => {
  it("성공이면 5초", () => {
    expect(nextPollDelay("ok", 0)).toBe(5_000);
  });

  it("실패마다 두 배로 늘고 원인별 상한에서 멈춘다", () => {
    expect([1, 2, 3, 4, 5, 6, 30].map((n) => nextPollDelay("not_found", n))).toEqual([
      10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000,
    ]);
    expect([1, 2, 3, 4, 30].map((n) => nextPollDelay("rate_limited", n))).toEqual([
      10_000, 20_000, 40_000, 80_000, 300_000,
    ]);
    expect([1, 2, 3, 4, 30].map((n) => nextPollDelay("server", n))).toEqual([10_000, 20_000, 40_000, 60_000, 60_000]);
    expect([1, 3, 4].map((n) => nextPollDelay("network", n))).toEqual([10_000, 40_000, 60_000]);
  });
});
