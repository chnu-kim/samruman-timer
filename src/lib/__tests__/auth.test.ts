import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
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
  deleteExpiredRefreshTokens,
  newFamilyExpiresAt,
  SESSION_ABSOLUTE_MAX_AGE,
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

  it("HS256이 아닌 알고리즘으로 서명된 토큰은 거부한다", async () => {
    const key = new TextEncoder().encode("test-secret-key-at-least-32-chars-long!");
    const token = await new SignJWT({ userId: "u", chzzkUserId: "c", nickname: "n" })
      .setProtectedHeader({ alg: "HS512" })
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(key);
    expect(await verifyJwt(token)).toBeNull();
  });

  it("exp가 없는 토큰은 거부한다", async () => {
    const key = new TextEncoder().encode("test-secret-key-at-least-32-chars-long!");
    const token = await new SignJWT({ userId: "u", chzzkUserId: "c", nickname: "n" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .sign(key);
    expect(await verifyJwt(token)).toBeNull();
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
    if (!result.ok) throw new Error(`rotation 실패: ${result.reason}`);
    expect(result.userId).toBe("user-1");
    expect(result.chzzkUserId).toBe("chzzk-1");
    expect(result.nickname).toBe("tester");
    expect(result.newRawToken).toBeTruthy();
    expect(result.familyId).toBe("family-1");

    // USED 전환과 새 토큰 INSERT는 batch 한 번으로 실행된다
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(db.batch.mock.calls[0][0]).toHaveLength(2);
    expect(db._stmt.run).not.toHaveBeenCalled();
    const sqls = db.prepare.mock.calls.map((c) => String(c[0]));
    const updateIdx = sqls.findIndex((q) => q.includes("SET status = 'USED'"));
    const insertIdx = sqls.findIndex((q) => q.startsWith("INSERT INTO refresh_tokens"));
    expect(sqls[updateIdx]).toContain("WHERE id = ? AND status = 'ACTIVE'");
    // INSERT는 UPDATE가 실제로 행을 바꿨을 때만 들어간다
    expect(sqls[insertIdx]).toMatch(/SELECT \?, \?, \?, \?, 'ACTIVE', \?, \?, \? WHERE changes\(\) = 1$/);
    expect(updateIdx).toBeLessThan(insertIdx);
    // 사용자 조회는 상태 변경 문장보다 먼저 준비된다
    const userIdx = sqls.findIndex((q) => q.includes("FROM users"));
    expect(userIdx).toBeGreaterThan(-1);
    expect(userIdx).toBeLessThan(updateIdx);
    // 새 토큰 INSERT의 바인딩: user_id, token_hash, family_id
    const insertBinds = db._stmt.bind.mock.calls[insertIdx];
    expect(insertBinds[1]).toBe("user-1");
    expect(insertBinds[2]).toBe(result.newTokenHash);
    expect(insertBinds[3]).toBe("family-1");
  });

  it("batch(USED 전환 + 새 토큰 INSERT)가 실패하면 throw하고 그 밖의 쓰기는 하지 않는다", async () => {
    // D1 batch는 트랜잭션이라 실패하면 UPDATE도 롤백되어 옛 토큰이 ACTIVE로 남는다.
    // 그래서 브라우저가 옛 쿠키로 다시 오면 USED 재사용(reuse_detected)이 아니라 정상 rotation이 된다
    const activeRow = {
      id: "rt-1",
      user_id: "user-1",
      token_hash: "h",
      family_id: "family-1",
      status: "ACTIVE",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      created_at: new Date(Date.now() - 120_000).toISOString(),
      used_at: null,
    };
    const user = { id: "user-1", chzzk_user_id: "chzzk-1", nickname: "tester" };
    db._stmt.first.mockResolvedValueOnce(activeRow).mockResolvedValueOnce(user);
    db.batch.mockRejectedValueOnce(new Error("D1_ERROR: network"));

    await expect(rotateRefreshToken(db as unknown as D1Database, "retry-token")).rejects.toThrow("D1_ERROR");
    // batch 밖에서 따로 실행된 쓰기(USED 전환·폐기)가 없다
    expect(db._stmt.run).not.toHaveBeenCalled();

    // 옛 토큰은 여전히 ACTIVE이므로 재시도는 폐기 없이 정상 rotation된다
    db._stmt.first.mockResolvedValueOnce(activeRow).mockResolvedValueOnce(user);
    const retry = await rotateRefreshToken(db as unknown as D1Database, "retry-token");
    if (!retry.ok) throw new Error(`재시도 실패: ${retry.reason}`);
    expect(retry.newRawToken).toBeTruthy();
    const sqls = db.prepare.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((q) => q.includes("SET status = 'REVOKED'"))).toBe(false);
  });

  it("USED 토큰이 방금(30초 이내) rotation됨 → grace (사용자 정보 반환)", async () => {
    const rawToken = "used-token";
    const tokenHash = await hashToken(rawToken);

    db._stmt.first
      .mockResolvedValueOnce({
          id: "rt-1",
          user_id: "user-1",
          token_hash: tokenHash,
          family_id: "family-1",
          status: "USED",
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          created_at: new Date(Date.now() - 120_000).toISOString(),
          used_at: new Date(Date.now() - 5_000).toISOString(),
        })
      .mockResolvedValueOnce({ id: "user-1", chzzk_user_id: "chzzk-1", nickname: "tester" });

    const result = await rotateRefreshToken(db as unknown as D1Database, rawToken);
    if (!result.ok) throw new Error(`rotation 실패: ${result.reason}`);
    expect(result.userId).toBe("user-1");
    expect(result.newRawToken).toBeNull();
    // family 폐기 호출 안 됨
    expect(db._stmt.run).not.toHaveBeenCalled();
  });

  it("USED 토큰이 rotation된 지 30초 넘음 → reuse_detected + family 폐기", async () => {
    const rawToken = "used-token-old";
    const tokenHash = await hashToken(rawToken);

    db._stmt.first.mockResolvedValueOnce({
          id: "rt-1",
          user_id: "user-1",
          token_hash: tokenHash,
          family_id: "family-1",
          status: "USED",
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          created_at: new Date(Date.now() - 120_000).toISOString(),
          used_at: new Date(Date.now() - 60_000).toISOString(),
        });
    db._stmt.run.mockResolvedValue({ meta: { changes: 2 } });

    const result = await rotateRefreshToken(db as unknown as D1Database, rawToken);
    expect(result).toEqual({ ok: false, reason: "reuse_detected", userId: "user-1", familyId: "family-1" });
    // family 폐기 호출됨
    expect(db._stmt.run).toHaveBeenCalledTimes(1);
    const sqls = db.prepare.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((q) => q.includes("SET status = 'REVOKED'"))).toBe(true);
  });

  it("탈취자가 family를 계속 rotation해도 오래된 USED 토큰 재사용은 grace가 아니다", async () => {
    const rawToken = "victim-old-token";
    const tokenHash = await hashToken(rawToken);

    // family에 방금 발급된 ACTIVE 토큰이 있어도 판정은 이 토큰의 used_at만 본다
    db._stmt.first.mockResolvedValueOnce({
          id: "rt-1",
          user_id: "user-1",
          token_hash: tokenHash,
          family_id: "family-1",
          status: "USED",
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          created_at: new Date(Date.now() - 120_000).toISOString(),
          used_at: new Date(Date.now() - 10 * 60_000).toISOString(),
        });
    db._stmt.run.mockResolvedValue({ meta: { changes: 3 } });

    const result = await rotateRefreshToken(db as unknown as D1Database, rawToken);
    expect(result).toMatchObject({ ok: false, reason: "reuse_detected" });
    const sqls = db.prepare.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((q) => q.includes("status = 'ACTIVE' AND created_at >"))).toBe(false);
    expect(sqls.some((q) => q.includes("SET status = 'REVOKED'"))).toBe(true);
  });

  it("REVOKED 토큰 + 폐기로 바뀐 행 없음 → revoked (경보를 반복하지 않는다)", async () => {
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
    expect(result).toEqual({ ok: false, reason: "revoked", userId: "user-1", familyId: "family-1" });
    // 폐기 UPDATE는 다시 돌린다(원자화 이전에 늦게 생긴 ACTIVE 토큰 차단)
    expect(db._stmt.run).toHaveBeenCalledTimes(1);
  });

  it("REVOKED 토큰인데 폐기된 family에 늦게 생긴 ACTIVE 토큰이 있으면 폐기하고 reuse_detected", async () => {
    // rotation 원자화 이전 코드에서 USED 전환과 새 토큰 INSERT 사이에 family 폐기가 끼어 ACTIVE 토큰이 남은 경우.
    // 지금은 생기지 않지만 기존 데이터에 대한 방어선으로 재폐기를 유지한다
    db._stmt.first.mockResolvedValue({
      id: "rt-1",
      user_id: "user-1",
      token_hash: "h",
      family_id: "family-1",
      status: "REVOKED",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      created_at: new Date().toISOString(),
      used_at: null,
    });
    db._stmt.run.mockResolvedValue({ meta: { changes: 1 } });

    const result = await rotateRefreshToken(db as unknown as D1Database, "revoked-token");
    expect(result).toEqual({ ok: false, reason: "reuse_detected", userId: "user-1", familyId: "family-1" });
    const sqls = db.prepare.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((q) => q.includes("SET status = 'REVOKED'"))).toBe(true);
  });

  it("USED 토큰 재사용이지만 동시 요청이 먼저 family를 폐기했으면(changes=0) revoked", async () => {
    db._stmt.first.mockResolvedValueOnce({
      id: "rt-1",
      user_id: "user-1",
      token_hash: "h",
      family_id: "family-1",
      status: "USED",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      created_at: new Date(Date.now() - 120_000).toISOString(),
      used_at: new Date(Date.now() - 60_000).toISOString(),
    });
    db._stmt.run.mockResolvedValue({ meta: { changes: 0 } });

    const result = await rotateRefreshToken(db as unknown as D1Database, "used-token-old");
    expect(result).toMatchObject({ ok: false, reason: "revoked", familyId: "family-1" });
  });

  it("만료된 토큰 → expired", async () => {
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
    expect(result).toMatchObject({ ok: false, reason: "expired" });
  });

  it("존재하지 않는 토큰 → not_found", async () => {
    db._stmt.first.mockResolvedValue(null);

    const result = await rotateRefreshToken(db as unknown as D1Database, "nonexistent");
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("동시 사용 (changes=0) + 방금 USED가 됨 → grace (사용자 정보 반환, 새 토큰 없음)", async () => {
    const rawToken = "concurrent-token";
    const tokenHash = await hashToken(rawToken);

    db._stmt.first
      .mockResolvedValueOnce({
          id: "rt-1",
          user_id: "user-1",
          token_hash: tokenHash,
          family_id: "family-1",
          status: "ACTIVE",
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          created_at: new Date(Date.now() - 120_000).toISOString(),
          used_at: null,
        })
      .mockResolvedValueOnce({ id: "user-1", chzzk_user_id: "chzzk-1", nickname: "tester" })
      // 다른 요청이 방금 사용함
      .mockResolvedValueOnce({ status: "USED", used_at: new Date().toISOString() });

    // batch의 UPDATE가 0행(동시 사용). INSERT는 changes() = 1 조건으로 실행되지 않는다
    db.batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 0 } }]);

    const result = await rotateRefreshToken(db as unknown as D1Database, rawToken);
    if (!result.ok) throw new Error(`rotation 실패: ${result.reason}`);
    expect(result.userId).toBe("user-1");
    expect(result.newRawToken).toBeNull();
    expect(result.newTokenHash).toBeNull();
    // family 폐기 호출 안 됨, 사용자도 다시 조회하지 않는다(token, user, 상태 재조회 3회)
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(db._stmt.run).not.toHaveBeenCalled();
    expect(db._stmt.first).toHaveBeenCalledTimes(3);
  });

  it("동시 사용 (changes=0) + 그 사이 다른 요청이 family를 폐기함 → revoked (중복 경보 없음)", async () => {
    const rawToken = "reused-token";
    const tokenHash = await hashToken(rawToken);

    db._stmt.first
      .mockResolvedValueOnce({
          id: "rt-1",
          user_id: "user-1",
          token_hash: tokenHash,
          family_id: "family-1",
          status: "ACTIVE",
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          created_at: new Date(Date.now() - 120_000).toISOString(),
          used_at: null,
        })
      .mockResolvedValueOnce({ id: "user-1", chzzk_user_id: "chzzk-1", nickname: "tester" })
      .mockResolvedValueOnce({ status: "REVOKED", used_at: null });

    db.batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 0 } }]);
    db._stmt.run.mockResolvedValue({ meta: { changes: 0 } });

    const result = await rotateRefreshToken(db as unknown as D1Database, rawToken);
    expect(result).toMatchObject({ ok: false, reason: "revoked", userId: "user-1", familyId: "family-1" });
    // batch(UPDATE 0 changes) + family 폐기 시도(0 changes)
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(db._stmt.run).toHaveBeenCalledTimes(1);
  });

  it("동시 사용 (changes=0) + 다른 요청이 grace 밖에서 USED로 만듦 → 이번 요청이 폐기하면 reuse_detected", async () => {
    db._stmt.first
      .mockResolvedValueOnce({
        id: "rt-1",
        user_id: "user-1",
        token_hash: "h",
        family_id: "family-1",
        status: "ACTIVE",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        created_at: new Date(Date.now() - 120_000).toISOString(),
        used_at: null,
      })
      .mockResolvedValueOnce({ id: "user-1", chzzk_user_id: "chzzk-1", nickname: "tester" })
      .mockResolvedValueOnce({ status: "USED", used_at: new Date(Date.now() - 60_000).toISOString() });
    db.batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 0 } }]); // USED 전환 CAS 실패
    db._stmt.run.mockResolvedValueOnce({ meta: { changes: 2 } }); // family 폐기

    const result = await rotateRefreshToken(db as unknown as D1Database, "reused-token");
    expect(result).toEqual({ ok: false, reason: "reuse_detected", userId: "user-1", familyId: "family-1" });
  });

  it("사용자 행이 없으면 상태를 바꾸지 않고 user_missing", async () => {
    const rawToken = "orphan-token";
    const tokenHash = await hashToken(rawToken);
    db._stmt.first
      .mockResolvedValueOnce({
        id: "rt-1",
        user_id: "user-gone",
        token_hash: tokenHash,
        family_id: "family-1",
        status: "ACTIVE",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        created_at: new Date().toISOString(),
        used_at: null,
      })
      .mockResolvedValueOnce(null);

    const result = await rotateRefreshToken(db as unknown as D1Database, rawToken);
    expect(result).toEqual({ ok: false, reason: "user_missing", userId: "user-gone", familyId: "family-1" });
    // USED 전환도 새 토큰 발급도 하지 않는다(옛 토큰이 ACTIVE로 남는다)
    expect(db.batch).not.toHaveBeenCalled();
    expect(db._stmt.run).not.toHaveBeenCalled();
    const sqls = db.prepare.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((q) => q.includes("SET status = 'USED'") || q.startsWith("INSERT"))).toBe(false);
  });

  it("grace 경로에서 사용자 행이 없어도 user_missing", async () => {
    const rawToken = "orphan-grace";
    const tokenHash = await hashToken(rawToken);
    db._stmt.first
      .mockResolvedValueOnce({
        id: "rt-1",
        user_id: "user-gone",
        token_hash: tokenHash,
        family_id: "family-1",
        status: "USED",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        created_at: new Date(Date.now() - 120_000).toISOString(),
        used_at: new Date(Date.now() - 5_000).toISOString(),
      })
      .mockResolvedValueOnce(null);

    const result = await rotateRefreshToken(db as unknown as D1Database, rawToken);
    expect(result).toMatchObject({ ok: false, reason: "user_missing" });
    expect(db._stmt.run).not.toHaveBeenCalled();
  });
});

describe("revokeRefreshTokenFamily", () => {
  it("family 내 모든 토큰 REVOKED", async () => {
    const db = createMockDB();
    db._stmt.run.mockResolvedValue({ meta: { changes: 3 } });

    expect(await revokeRefreshTokenFamily(db as unknown as D1Database, "family-1")).toBe(3);

    expect(db.prepare).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE refresh_tokens SET status = 'REVOKED'")
    );
    expect(db._stmt.bind).toHaveBeenCalledWith("family-1");
    expect(db._stmt.run).toHaveBeenCalled();
  });
});

describe("refresh family 절대 수명 (보안 감사 F18)", () => {
  function insertBinds(db: ReturnType<typeof createMockDB>) {
    const i = db.prepare.mock.calls.findIndex((c) => String(c[0]).startsWith("INSERT INTO refresh_tokens"));
    return db._stmt.bind.mock.calls[i] as unknown[];
  }

  it("새 로그인의 family는 90일 뒤 절대 만료된다", () => {
    const expected = Date.now() + SESSION_ABSOLUTE_MAX_AGE * 1000;
    expect(Math.abs(new Date(newFamilyExpiresAt()).getTime() - expected)).toBeLessThan(1000);
  });

  it("토큰 만료는 30일과 family 절대 만료 중 이른 쪽이다", async () => {
    const db = createMockDB();
    const familyExpiresAt = new Date(Date.now() + 2 * 86400_000).toISOString();

    await createRefreshTokenInDB(db as unknown as D1Database, "user-1", "hash", "family-1", familyExpiresAt);

    const binds = insertBinds(db);
    expect(binds[4]).toBe(familyExpiresAt); // expires_at
    expect(binds[6]).toBe(familyExpiresAt); // family_expires_at
  });

  it("rotation한 새 토큰은 family 절대 만료를 그대로 이어받는다", async () => {
    const db = createMockDB();
    const rawToken = "rotating";
    const tokenHash = await hashToken(rawToken);
    const familyExpiresAt = new Date(Date.now() + 3 * 86400_000).toISOString();
    db._stmt.first
      .mockResolvedValueOnce({
        id: "rt-1",
        user_id: "user-1",
        token_hash: tokenHash,
        family_id: "family-1",
        status: "ACTIVE",
        expires_at: familyExpiresAt,
        created_at: new Date(Date.now() - 87 * 86400_000).toISOString(),
        used_at: null,
        family_expires_at: familyExpiresAt,
      })
      .mockResolvedValueOnce({ id: "user-1", chzzk_user_id: "chzzk-1", nickname: "tester" });
    db._stmt.run.mockResolvedValue({ meta: { changes: 1 } });

    const result = await rotateRefreshToken(db as unknown as D1Database, rawToken);

    if (!result.ok) throw new Error(`rotation 실패: ${result.reason}`);
    expect(result.newRawToken).toBeTruthy();
    const binds = insertBinds(db);
    expect(binds[4]).toBe(familyExpiresAt); // 30일로 연장되지 않는다
    expect(binds[6]).toBe(familyExpiresAt);
  });

  it("토큰 만료가 남아 있어도 family 절대 만료가 지났으면 rotation하지 않는다", async () => {
    const db = createMockDB();
    const rawToken = "family-expired";
    const tokenHash = await hashToken(rawToken);
    db._stmt.first.mockResolvedValueOnce({
      id: "rt-1",
      user_id: "user-1",
      token_hash: tokenHash,
      family_id: "family-1",
      status: "ACTIVE",
      expires_at: new Date(Date.now() + 10 * 86400_000).toISOString(),
      created_at: new Date(Date.now() - 95 * 86400_000).toISOString(),
      used_at: null,
      family_expires_at: new Date(Date.now() - 86400_000).toISOString(),
    });

    const result = await rotateRefreshToken(db as unknown as D1Database, rawToken);

    expect(result).toMatchObject({ ok: false, reason: "family_expired" });
    // USED 처리도, 새 토큰 발급도 하지 않는다
    expect(db._stmt.run).not.toHaveBeenCalled();
  });

  it("만료된 행 정리는 해당 사용자의 만료 행만 지운다", async () => {
    const db = createMockDB();
    await deleteExpiredRefreshTokens(db as unknown as D1Database, "user-1");

    expect(db.prepare).toHaveBeenCalledWith("DELETE FROM refresh_tokens WHERE user_id = ? AND expires_at <= ?");
    expect(db._stmt.bind.mock.calls[0][0]).toBe("user-1");
  });
});
