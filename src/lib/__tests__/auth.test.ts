import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { signJwt, verifyJwt, getCurrentUser, createSessionCookie, deleteSessionCookie } from "@/lib/auth";

describe("JWT auth", () => {
  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", "test-secret-key-at-least-32-chars-long!");
  });

  it("signJwt → verifyJwt 라운드트립 성공", async () => {
    const payload = {
      userId: "user-123",
      chzzkUserId: "chzzk-456",
      nickname: "테스트유저",
    };

    const token = await signJwt(payload);
    expect(token).toBeTruthy();

    const verified = await verifyJwt(token);
    expect(verified).not.toBeNull();
    expect(verified!.userId).toBe("user-123");
    expect(verified!.chzzkUserId).toBe("chzzk-456");
    expect(verified!.nickname).toBe("테스트유저");
  });

  it("잘못된 토큰은 null을 반환한다", async () => {
    const result = await verifyJwt("invalid.token.here");
    expect(result).toBeNull();
  });

  it("다른 시크릿으로 서명된 토큰은 검증 실패", async () => {
    const payload = {
      userId: "user-123",
      chzzkUserId: "chzzk-456",
      nickname: "테스트",
    };
    const token = await signJwt(payload);

    vi.stubEnv("JWT_SECRET", "different-secret-key-at-least-32-chars!");
    const result = await verifyJwt(token);
    expect(result).toBeNull();
  });

  it("JWT_SECRET 미설정 시 에러 발생", async () => {
    vi.stubEnv("JWT_SECRET", "");
    await expect(
      signJwt({ userId: "u", chzzkUserId: "c", nickname: "n" })
    ).rejects.toThrow("JWT_SECRET is not set");
  });
});

describe("getCurrentUser", () => {
  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", "test-secret-key-at-least-32-chars-long!");
  });

  it("쿠키에 유효한 JWT → user payload 반환", async () => {
    const payload = { userId: "user-1", chzzkUserId: "chzzk-1", nickname: "테스터" };
    const token = await signJwt(payload);
    const req = new NextRequest(new URL("http://localhost:3000/api/test"), {
      headers: { cookie: `session=${token}` },
    });
    const user = await getCurrentUser(req);
    expect(user).not.toBeNull();
    expect(user!.userId).toBe("user-1");
    expect(user!.chzzkUserId).toBe("chzzk-1");
    expect(user!.nickname).toBe("테스터");
  });

  it("쿠키 없음 → null 반환", async () => {
    const req = new NextRequest(new URL("http://localhost:3000/api/test"));
    const user = await getCurrentUser(req);
    expect(user).toBeNull();
  });

  it("잘못된 JWT → null 반환", async () => {
    const req = new NextRequest(new URL("http://localhost:3000/api/test"), {
      headers: { cookie: "session=invalid.token.here" },
    });
    const user = await getCurrentUser(req);
    expect(user).toBeNull();
  });

  it("다른 쿠키명 → null 반환", async () => {
    const payload = { userId: "user-1", chzzkUserId: "chzzk-1", nickname: "테스터" };
    const token = await signJwt(payload);
    const req = new NextRequest(new URL("http://localhost:3000/api/test"), {
      headers: { cookie: `other=${token}` },
    });
    const user = await getCurrentUser(req);
    expect(user).toBeNull();
  });
});

describe("Session cookies", () => {
  it("createSessionCookie: httpOnly, SameSite=Lax 포함", () => {
    const cookie = createSessionCookie("my-token");
    expect(cookie).toContain("session=my-token");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
  });

  it("deleteSessionCookie: Max-Age=0", () => {
    const cookie = deleteSessionCookie();
    expect(cookie).toContain("session=");
    expect(cookie).toContain("Max-Age=0");
  });
});
