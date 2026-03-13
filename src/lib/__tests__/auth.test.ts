import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  signJwt,
  verifyJwt,
  getCurrentUser,
  createSessionCookie,
  deleteSessionCookie,
  hashToken,
  generateRefreshToken,
  createRefreshCookie,
  deleteRefreshCookie,
  rotateRefreshToken,
  revokeRefreshTokenFamily,
  createRefreshTokenInDB,
  ACCESS_TOKEN_MAX_AGE,
  REFRESH_TOKEN_MAX_AGE,
} from "@/lib/auth";
import { createMockDB } from "@/__tests__/helpers";

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

  it("signJwt 만료 시간이 15분(900초)이다", async () => {
    const token = await signJwt({
      userId: "user-1",
      chzzkUserId: "chzzk-1",
      nickname: "test",
    });
    const verified = await verifyJwt(token);
    expect(verified).not.toBeNull();
    // exp - iat should be approximately 900 seconds
    const diff = verified!.exp - verified!.iat;
    expect(diff).toBe(ACCESS_TOKEN_MAX_AGE);
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
  it("createSessionCookie: httpOnly, SameSite=Lax, Max-Age=900 포함", () => {
    const cookie = createSessionCookie("my-token");
    expect(cookie).toContain("session=my-token");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain(`Max-Age=${ACCESS_TOKEN_MAX_AGE}`);
  });

  it("deleteSessionCookie: Max-Age=0", () => {
    const cookie = deleteSessionCookie();
    expect(cookie).toContain("session=");
    expect(cookie).toContain("Max-Age=0");
  });
});

describe("hashToken", () => {
  it("동일 입력 → 동일 해시", async () => {
    const hash1 = await hashToken("test-token-123");
    const hash2 = await hashToken("test-token-123");
    expect(hash1).toBe(hash2);
  });

  it("다른 입력 → 다른 해시", async () => {
    const hash1 = await hashToken("token-a");
    const hash2 = await hashToken("token-b");
    expect(hash1).not.toBe(hash2);
  });

  it("hex 문자열 반환", async () => {
    const hash = await hashToken("test");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("generateRefreshToken", () => {
  it("고유한 opaque 문자열 생성", () => {
    const t1 = generateRefreshToken();
    const t2 = generateRefreshToken();
    expect(t1).toBeTruthy();
    expect(t2).toBeTruthy();
    expect(t1).not.toBe(t2);
  });
});

describe("Refresh cookies", () => {
  it("createRefreshCookie: httpOnly, SameSite=Lax, Max-Age=30일", () => {
    const cookie = createRefreshCookie("refresh-token-123");
    expect(cookie).toContain("refresh=refresh-token-123");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain(`Max-Age=${REFRESH_TOKEN_MAX_AGE}`);
  });

  it("deleteRefreshCookie: Max-Age=0", () => {
    const cookie = deleteRefreshCookie();
    expect(cookie).toContain("refresh=");
    expect(cookie).toContain("Max-Age=0");
  });
});

describe("rotateRefreshToken", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", "test-secret-key-at-least-32-chars-long!");
    db = createMockDB();
  });

  it("ACTIVE 토큰 → 성공 (old USED, new ACTIVE 생성, user 반환)", async () => {
    const rawToken = "test-refresh-token";
    const tokenHash = await hashToken(rawToken);

    // first() 호출: refresh_tokens 조회 → user 조회
    let firstCallCount = 0;
    db._stmt.first.mockImplementation(async () => {
      firstCallCount++;
      if (firstCallCount === 1) {
        return {
          id: "rt-1",
          user_id: "user-1",
          token_hash: tokenHash,
          family_id: "family-1",
          status: "ACTIVE",
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          created_at: new Date().toISOString(),
          used_at: null,
        };
      }
      // user 조회
      return { id: "user-1", chzzk_user_id: "chzzk-1", nickname: "tester" };
    });

    db._stmt.run.mockResolvedValue({ meta: { changes: 1 } });

    const result = await rotateRefreshToken(db as unknown as D1Database, rawToken);
    expect(result).not.toBeNull();
    expect(result!.userId).toBe("user-1");
    expect(result!.chzzkUserId).toBe("chzzk-1");
    expect(result!.nickname).toBe("tester");
    expect(result!.newRawToken).toBeTruthy();
    expect(result!.familyId).toBe("family-1");
  });

  it("USED 토큰 → null + family 전체 REVOKED (reuse detection)", async () => {
    const rawToken = "used-token";
    const tokenHash = await hashToken(rawToken);

    db._stmt.first.mockResolvedValue({
      id: "rt-1",
      user_id: "user-1",
      token_hash: tokenHash,
      family_id: "family-1",
      status: "USED",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      created_at: new Date().toISOString(),
      used_at: new Date().toISOString(),
    });

    db._stmt.run.mockResolvedValue({ meta: { changes: 0 } });

    const result = await rotateRefreshToken(db as unknown as D1Database, rawToken);
    expect(result).toBeNull();
    // family 폐기 UPDATE 호출됨
    expect(db._stmt.run).toHaveBeenCalled();
  });

  it("REVOKED 토큰 → null", async () => {
    const rawToken = "revoked-token";
    const tokenHash = await hashToken(rawToken);

    db._stmt.first.mockResolvedValue({
      id: "rt-1",
      user_id: "user-1",
      token_hash: tokenHash,
      family_id: "family-1",
      status: "REVOKED",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      created_at: new Date().toISOString(),
      used_at: null,
    });

    const result = await rotateRefreshToken(db as unknown as D1Database, rawToken);
    expect(result).toBeNull();
  });

  it("만료된 토큰 → null", async () => {
    const rawToken = "expired-token";
    const tokenHash = await hashToken(rawToken);

    db._stmt.first.mockResolvedValue({
      id: "rt-1",
      user_id: "user-1",
      token_hash: tokenHash,
      family_id: "family-1",
      status: "ACTIVE",
      expires_at: new Date(Date.now() - 86400000).toISOString(), // 과거
      created_at: new Date().toISOString(),
      used_at: null,
    });

    const result = await rotateRefreshToken(db as unknown as D1Database, rawToken);
    expect(result).toBeNull();
  });

  it("존재하지 않는 토큰 → null", async () => {
    db._stmt.first.mockResolvedValue(null);

    const result = await rotateRefreshToken(db as unknown as D1Database, "nonexistent");
    expect(result).toBeNull();
  });

  it("동시 사용 (changes=0) + 최근 ACTIVE 토큰 있음 → grace (사용자 정보 반환, 새 토큰 없음)", async () => {
    const rawToken = "concurrent-token";
    const tokenHash = await hashToken(rawToken);

    let firstCallCount = 0;
    db._stmt.first.mockImplementation(async () => {
      firstCallCount++;
      if (firstCallCount === 1) {
        // refresh_tokens 조회
        return {
          id: "rt-1",
          user_id: "user-1",
          token_hash: tokenHash,
          family_id: "family-1",
          status: "ACTIVE",
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          created_at: new Date().toISOString(),
          used_at: null,
        };
      }
      if (firstCallCount === 2) {
        // grace: 최근 ACTIVE 토큰 조회
        return { id: "rt-2" };
      }
      // user 조회
      return { id: "user-1", chzzk_user_id: "chzzk-1", nickname: "tester" };
    });

    // UPDATE returns 0 changes (concurrent use)
    db._stmt.run.mockResolvedValue({ meta: { changes: 0 } });

    const result = await rotateRefreshToken(db as unknown as D1Database, rawToken);
    expect(result).not.toBeNull();
    expect(result!.userId).toBe("user-1");
    expect(result!.newRawToken).toBeNull();
    expect(result!.newTokenHash).toBeNull();
    // family 폐기 호출 안 됨 (UPDATE 1회만)
    expect(db._stmt.run).toHaveBeenCalledTimes(1);
  });

  it("동시 사용 (changes=0) + 최근 ACTIVE 토큰 없음 → null + family 폐기", async () => {
    const rawToken = "reused-token";
    const tokenHash = await hashToken(rawToken);

    let firstCallCount = 0;
    db._stmt.first.mockImplementation(async () => {
      firstCallCount++;
      if (firstCallCount === 1) {
        return {
          id: "rt-1",
          user_id: "user-1",
          token_hash: tokenHash,
          family_id: "family-1",
          status: "ACTIVE",
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          created_at: new Date().toISOString(),
          used_at: null,
        };
      }
      // grace: 최근 ACTIVE 토큰 없음
      return null;
    });

    db._stmt.run.mockResolvedValue({ meta: { changes: 0 } });

    const result = await rotateRefreshToken(db as unknown as D1Database, rawToken);
    expect(result).toBeNull();
    // UPDATE (0 changes) + family 폐기
    expect(db._stmt.run).toHaveBeenCalledTimes(2);
  });
});

describe("revokeRefreshTokenFamily", () => {
  it("family 내 모든 토큰 REVOKED", async () => {
    const db = createMockDB();
    db._stmt.run.mockResolvedValue({ meta: { changes: 3 } });

    await revokeRefreshTokenFamily(db as unknown as D1Database, "family-1");

    expect(db.prepare).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE refresh_tokens SET status = 'REVOKED'")
    );
    expect(db._stmt.bind).toHaveBeenCalledWith("family-1");
    expect(db._stmt.run).toHaveBeenCalled();
  });
});
