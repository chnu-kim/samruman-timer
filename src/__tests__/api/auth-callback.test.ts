import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDB } from "../helpers";

vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

vi.mock("@/lib/chzzk", () => ({
  exchangeCode: vi.fn(),
  getUserInfo: vi.fn(),
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/auth")>();
  return { ...orig, signJwt: vi.fn().mockResolvedValue("mock-jwt-token") };
});

import { getDB } from "@/lib/db";
import { exchangeCode, getUserInfo } from "@/lib/chzzk";
import { GET } from "@/app/api/auth/callback/route";
import { NextRequest } from "next/server";

function createCallbackReq(
  params: Record<string, string> = {},
  cookies: Record<string, string> = {}
): NextRequest {
  const url = new URL("http://localhost:3000/api/auth/callback");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const cookieStr = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  const headers: Record<string, string> = {};
  if (cookieStr) headers["cookie"] = cookieStr;
  return new NextRequest(url, { method: "GET", headers });
}

describe("GET /api/auth/callback", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    vi.stubEnv("BASE_URL", "http://localhost:3000");
    vi.stubEnv("JWT_SECRET", "test-secret-key-at-least-32-chars-long!");
    vi.stubEnv("CHZZK_CLIENT_ID", "test-client-id");
    vi.stubEnv("CHZZK_CLIENT_SECRET", "test-client-secret");

    db = createMockDB();
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
  });

  it("state 불일치 → 에러 리다이렉트", async () => {
    const req = createCallbackReq(
      { code: "auth-code", state: "state-1" },
      { oauth_state: "state-different" }
    );
    const res = await GET(req as never);
    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toContain("/login?error=auth_failed");
  });

  it("code 없음 → 에러 리다이렉트", async () => {
    const req = createCallbackReq(
      { state: "state-1" },
      { oauth_state: "state-1" }
    );
    const res = await GET(req as never);
    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toContain("/login?error=auth_failed");
  });

  it("정상 콜백 (신규 사용자) → DB insert + JWT 쿠키 + 리다이렉트", async () => {
    vi.mocked(exchangeCode).mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 3600,
    });
    vi.mocked(getUserInfo).mockResolvedValue({
      id: "chzzk-user-1",
      nickname: "테스터",
      profileImageUrl: null,
    });
    // 신규 사용자 → first() returns null
    db._stmt.first.mockResolvedValue(null);

    const req = createCallbackReq(
      { code: "valid-code", state: "state-1" },
      { oauth_state: "state-1" }
    );
    const res = await GET(req as never);

    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toBe("http://localhost:3000/");
    // session 쿠키 설정 확인
    const setCookies = res.headers.getSetCookie();
    const sessionCookie = setCookies.find((c) => c.startsWith("session="));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain("HttpOnly");
    // DB insert 호출 확인
    expect(db._stmt.run).toHaveBeenCalled();
  });

  it("정상 콜백 (기존 사용자) → DB update + JWT 쿠키", async () => {
    vi.mocked(exchangeCode).mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 3600,
    });
    vi.mocked(getUserInfo).mockResolvedValue({
      id: "chzzk-user-1",
      nickname: "업데이트된닉네임",
      profileImageUrl: "https://img.example.com/new.png",
    });
    // 기존 사용자
    db._stmt.first.mockResolvedValue({
      id: "user-1",
      nickname: "이전닉네임",
      profile_image_url: null,
    });

    const req = createCallbackReq(
      { code: "valid-code", state: "state-1" },
      { oauth_state: "state-1" }
    );
    const res = await GET(req as never);

    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toBe("http://localhost:3000/");
    // DB update 호출 확인
    expect(db._stmt.run).toHaveBeenCalled();
  });

  it("exchangeCode 실패 → 에러 리다이렉트", async () => {
    vi.mocked(exchangeCode).mockRejectedValue(new Error("Token exchange failed"));

    const req = createCallbackReq(
      { code: "bad-code", state: "state-1" },
      { oauth_state: "state-1" }
    );
    const res = await GET(req as never);

    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toContain("/login?error=auth_failed");
  });
});

// UX-74: 세션 만료 후 다시 로그인하면 보던 화면(next)으로 돌아간다
describe("GET /api/auth/callback — next 리다이렉트", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    vi.stubEnv("BASE_URL", "http://localhost:3000");
    vi.stubEnv("JWT_SECRET", "test-secret-key-at-least-32-chars-long!");
    vi.stubEnv("CHZZK_CLIENT_ID", "test-client-id");
    vi.stubEnv("CHZZK_CLIENT_SECRET", "test-client-secret");

    db = createMockDB();
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
    vi.mocked(exchangeCode).mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 3600,
    });
    vi.mocked(getUserInfo).mockResolvedValue({
      id: "chzzk-user-1",
      nickname: "테스터",
      profileImageUrl: null,
    });
    db._stmt.first.mockResolvedValue({ id: "user-1", nickname: "테스터", profile_image_url: null });
  });

  function successReq(next: string) {
    return createCallbackReq(
      { code: "valid-code", state: "state-1" },
      { oauth_state: "state-1", oauth_next: encodeURIComponent(next) }
    );
  }

  function nextCookie(res: Response) {
    return res.headers.getSetCookie().find((c) => c.startsWith("oauth_next="));
  }

  it("저장된 next가 같은 출처 경로면 그곳으로 보내고 oauth_next를 지운다", async () => {
    const res = await GET(successReq("/timers/abc?tab=logs&page=2") as never);
    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toBe("http://localhost:3000/timers/abc?tab=logs&page=2");
    expect(nextCookie(res)).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    // 세션 쿠키는 그대로 설정된다
    expect(res.headers.getSetCookie().some((c) => c.startsWith("session="))).toBe(true);
  });

  it.each([
    "//evil.com",
    "/\\evil.com",
    "%2F%2Fevil.com",
    "https://evil.com",
    "javascript:alert(1)",
    "/\t/evil.com",
    "/login",
  ])("쿠키의 next(%s)가 허용되지 않으면 / 로 보낸다", async (next) => {
    const res = await GET(successReq(next) as never);
    expect(res.headers.get("Location")).toBe("http://localhost:3000/");
  });

  it("state가 맞지 않으면 next를 쓰지 않고 oauth_next를 지운다", async () => {
    const req = createCallbackReq(
      { code: "valid-code", state: "state-1" },
      { oauth_state: "other", oauth_next: encodeURIComponent("/timers/abc") }
    );
    const res = await GET(req as never);
    expect(res.headers.get("Location")).toBe("http://localhost:3000/login?error=auth_failed");
    expect(nextCookie(res)).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });

  it("토큰 교환이 실패해도 oauth_next를 지운다", async () => {
    vi.mocked(exchangeCode).mockRejectedValue(new Error("fail"));
    const res = await GET(successReq("/timers/abc") as never);
    expect(res.headers.get("Location")).toContain("/login?error=auth_failed");
    expect(nextCookie(res)).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });
});
