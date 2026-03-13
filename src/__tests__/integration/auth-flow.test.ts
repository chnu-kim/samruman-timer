import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDB, parseJson } from "../helpers";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

vi.mock("@/lib/chzzk", () => ({
  buildAuthorizationUrl: vi.fn().mockReturnValue("https://chzzk.naver.com/account-interlock?state=test"),
  exchangeCode: vi.fn(),
  getUserInfo: vi.fn(),
}));

import { getDB } from "@/lib/db";
import { exchangeCode, getUserInfo } from "@/lib/chzzk";
import { GET as login } from "@/app/api/auth/login/route";
import { GET as callback } from "@/app/api/auth/callback/route";
import { GET as me } from "@/app/api/auth/me/route";
import { POST as logout } from "@/app/api/auth/logout/route";

describe("인증 흐름 통합 테스트", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    vi.stubEnv("BASE_URL", "http://localhost:3000");
    vi.stubEnv("JWT_SECRET", "test-secret-key-at-least-32-chars-long!");
    vi.stubEnv("CHZZK_CLIENT_ID", "test-client-id");
    vi.stubEnv("CHZZK_CLIENT_SECRET", "test-client-secret");

    db = createMockDB();
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
  });

  it("1. login → 리다이렉트 URL + state 쿠키", async () => {
    const res = await login();
    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toContain("chzzk.naver.com");

    const setCookies = res.headers.getSetCookie();
    const stateCookie = setCookies.find((c) => c.startsWith("oauth_state="));
    expect(stateCookie).toBeDefined();
    expect(stateCookie).toContain("HttpOnly");
  });

  it("2. callback → 토큰 교환 → DB upsert → JWT 쿠키", async () => {
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
    db._stmt.first.mockResolvedValue(null); // 신규 사용자

    const url = new URL("http://localhost:3000/api/auth/callback?code=valid-code&state=state-1");
    const req = new NextRequest(url, {
      headers: { cookie: "oauth_state=state-1" },
    });
    const res = await callback(req as never);

    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toBe("http://localhost:3000/");
    const setCookies = res.headers.getSetCookie();
    const sessionCookie = setCookies.find((c) => c.startsWith("session="));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain("HttpOnly");
  });

  it("3. me → 사용자 정보 (미들웨어가 주입한 x-user-id 기반)", async () => {
    db._stmt.first.mockResolvedValue({
      id: "user-1",
      chzzk_user_id: "chzzk-user-1",
      nickname: "테스터",
      profile_image_url: null,
    });

    const req = new NextRequest(new URL("http://localhost:3000/api/auth/me"), {
      headers: { "x-user-id": "user-1" },
    });
    const res = await me(req as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.id).toBe("user-1");
    expect(body.data.nickname).toBe("테스터");
  });

  it("4. logout → 쿠키 삭제", async () => {
    const { signJwt } = await import("@/lib/auth");
    const token = await signJwt({
      userId: "user-1",
      chzzkUserId: "chzzk-user-1",
      nickname: "테스터",
    });

    const req = new NextRequest(new URL("http://localhost:3000/api/auth/logout"), {
      method: "POST",
      headers: { cookie: `session=${token}` },
    });
    const res = await logout(req as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toBeNull();
    const setCookie = res.headers.get("Set-Cookie");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("5. me (로그아웃 후) → 401", async () => {
    const req = new NextRequest(new URL("http://localhost:3000/api/auth/me"));
    const res = await me(req as never);
    expect(res.status).toBe(401);
  });
});
