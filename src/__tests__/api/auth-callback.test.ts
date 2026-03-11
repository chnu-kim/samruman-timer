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
