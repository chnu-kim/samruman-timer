import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/chzzk", () => ({
  buildAuthorizationUrl: vi.fn((state: string) => `https://chzzk.naver.com/account-interlock?state=${state}`),
}));

import { GET } from "@/app/api/auth/login/route";

function loginReq(query = ""): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000/api/auth/login${query}`), { method: "GET" });
}

function findCookie(res: Response, name: string) {
  return res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
}

function isDeletion(cookie: string | undefined) {
  return !!cookie && (/Max-Age=0/i.test(cookie) || /Expires=Thu, 01 Jan 1970/i.test(cookie));
}

describe("GET /api/auth/login", () => {
  beforeEach(() => {
    vi.stubEnv("BASE_URL", "http://localhost:3000");
  });

  it("CHZZK 인증 페이지로 보내고 state 쿠키를 심는다", async () => {
    const res = await GET(loginReq());
    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toContain("chzzk.naver.com");
    expect(findCookie(res, "oauth_state")).toContain("HttpOnly");
  });

  // UX-74: 로그인 후 돌아갈 경로를 OAuth 왕복 동안 쿠키로 들고 간다
  it("유효한 next는 httpOnly oauth_next 쿠키로 저장한다", async () => {
    const res = await GET(loginReq(`?next=${encodeURIComponent("/timers/abc?tab=logs")}`));
    const cookie = findCookie(res, "oauth_next");
    expect(cookie).toBeDefined();
    expect(cookie).toContain(`oauth_next=${encodeURIComponent("/timers/abc?tab=logs")}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toContain("Max-Age=600");
  });

  it.each([
    ["%2F%2Fevil.com"],
    ["%2F%5Cevil.com"],
    ["https%3A%2F%2Fevil.com"],
    ["javascript%3Aalert(1)"],
    ["%2F%09%2Fevil.com"],
  ])("허용하지 않는 next(%s)는 저장하지 않고 기존 값을 지운다", async (encoded) => {
    const res = await GET(loginReq(`?next=${encoded}`));
    const cookie = findCookie(res, "oauth_next");
    expect(isDeletion(cookie)).toBe(true);
    expect(cookie).not.toContain("evil");
  });

  it("next가 없으면 이전 시도의 oauth_next를 지운다", async () => {
    const res = await GET(loginReq());
    expect(isDeletion(findCookie(res, "oauth_next"))).toBe(true);
  });
});
