import { describe, it, expect } from "vitest";
import { sanitizeNextPath, loginUrlWithNext, sessionExpiredLoginUrl } from "@/lib/safe-redirect";

// UX-74: 로그인 후 돌아갈 경로는 같은 출처의 상대 경로만 허용한다(오픈 리다이렉트 방지)
describe("sanitizeNextPath", () => {
  it.each([
    "/",
    "/projects",
    "/timers/abc123",
    "/timers/abc123/stats",
    "/projects?q=%EC%84%9C%EB%B8%8C&page=2",
    "/timers/abc123#logs",
  ])("같은 출처 상대 경로 %s는 그대로 통과시킨다", (path) => {
    expect(sanitizeNextPath(path)).toBe(path);
  });

  it.each([
    ["프로토콜 상대 URL", "//evil.com"],
    ["슬래시 3개", "///evil.com"],
    ["슬래시 뒤 역슬래시", "/\\evil.com"],
    ["역슬래시 시작", "\\\\evil.com"],
    ["경로 중간 역슬래시", "/foo\\..\\\\evil.com"],
    ["인코딩된 슬래시(디코딩 전 값)", "%2F%2Fevil.com"],
    ["절대 URL", "https://evil.com"],
    ["절대 URL(경로 포함)", "https://evil.com/timers/abc"],
    ["javascript 스킴", "javascript:alert(1)"],
    ["data 스킴", "data:text/html,<script>alert(1)</script>"],
    ["탭으로 슬래시 사이를 띄운 값", "/\t/evil.com"],
    ["개행으로 슬래시 사이를 띄운 값", "/\n/evil.com"],
    ["캐리지 리턴", "/\r/evil.com"],
    ["공백", "/ /evil.com"],
    ["NUL 문자", "/timers\u0000/x"],
    ["상대 경로(슬래시 없음)", "evil.com"],
    ["로그인 화면", "/login"],
    ["로그인 화면(쿼리)", "/login?next=/timers/x"],
    ["API 경로", "/api/auth/logout"],
    ["빈 문자열", ""],
  ])("%s(%s)는 거부한다", (_label, path) => {
    expect(sanitizeNextPath(path)).toBeNull();
  });

  it("null·undefined는 거부한다", () => {
    expect(sanitizeNextPath(null)).toBeNull();
    expect(sanitizeNextPath(undefined)).toBeNull();
  });

  it("지나치게 긴 값은 거부한다", () => {
    expect(sanitizeNextPath(`/${"a".repeat(600)}`)).toBeNull();
  });

  it("쿼리로 받은 %2F%2F는 디코딩되면 '//'가 되어 거부된다", () => {
    const decoded = new URLSearchParams("next=%2F%2Fevil.com").get("next");
    expect(decoded).toBe("//evil.com");
    expect(sanitizeNextPath(decoded)).toBeNull();
  });

  it("쿼리로 받은 /%5Cevil.com은 디코딩되면 '/\\'가 되어 거부된다", () => {
    const decoded = new URLSearchParams("next=%2F%5Cevil.com").get("next");
    expect(sanitizeNextPath(decoded)).toBeNull();
  });
});

describe("loginUrlWithNext", () => {
  it("현재 경로를 인코딩해 next로 싣는다", () => {
    expect(loginUrlWithNext("/timers/abc?tab=logs")).toBe("/login?next=%2Ftimers%2Fabc%3Ftab%3Dlogs");
  });

  it("로그인 화면이거나 허용하지 않는 경로면 next 없이 보낸다", () => {
    expect(loginUrlWithNext("/login")).toBe("/login");
    expect(loginUrlWithNext("//evil.com")).toBe("/login");
  });
});

describe("sessionExpiredLoginUrl", () => {
  it("next 뒤에 만료 표시를 덧붙인다(로그인 화면이 만료 안내를 보여 주게)", () => {
    expect(sessionExpiredLoginUrl("/timers/abc")).toBe("/login?next=%2Ftimers%2Fabc&expired=1");
  });

  it("next가 없어도 만료 표시는 싣는다", () => {
    expect(sessionExpiredLoginUrl("/login")).toBe("/login?expired=1");
  });
});
