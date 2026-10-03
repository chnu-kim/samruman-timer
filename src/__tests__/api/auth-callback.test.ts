import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import { createMockDB } from "../helpers";

vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

vi.mock("@/lib/chzzk", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/chzzk")>();
  return { ...orig, exchangeCode: vi.fn(), getUserInfo: vi.fn() };
});

vi.mock("@/lib/auth", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/auth")>();
  return { ...orig, signJwt: vi.fn().mockResolvedValue("mock-jwt-token") };
});

import { getDB } from "@/lib/db";
import { exchangeCode, getUserInfo, ChzzkApiError } from "@/lib/chzzk";
import { GET } from "@/app/api/auth/callback/route";
import { NextRequest } from "next/server";

let consoleLog: MockInstance<typeof console.log>;
let consoleWarn: MockInstance<typeof console.warn>;
let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleLog.mockRestore();
  consoleWarn.mockRestore();
  consoleError.mockRestore();
});

function entries(spy: MockInstance<(...args: never[]) => void>) {
  return spy.mock.calls.map((c) => JSON.parse(String((c as unknown[])[0])));
}

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
      { "__Host-oauth_state": "state-different" }
    );
    const res = await GET(req as never);
    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toContain("/login?error=auth_failed");
  });

  it("code 없음 → 에러 리다이렉트", async () => {
    const req = createCallbackReq(
      { state: "state-1" },
      { "__Host-oauth_state": "state-1" }
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
      { "__Host-oauth_state": "state-1" }
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
    // 성공 로그에는 내부 userId와 소요 시간만 남고 닉네임·chzzk ID는 없다
    const logged = entries(consoleLog);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ level: "info", event: "auth.login.succeeded" });
    expect(logged[0].userId).toMatch(/^[0-9a-f]{32}$/);
    expect(typeof logged[0].durationMs).toBe("number");
    expect(JSON.stringify(logged[0])).not.toContain("테스터");
    expect(JSON.stringify(logged[0])).not.toContain("chzzk-user-1");
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
      { "__Host-oauth_state": "state-1" }
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
      { "__Host-oauth_state": "state-1" }
    );
    const res = await GET(req as never);

    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toContain("/login?error=auth_failed");
    const logged = entries(consoleError);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({
      event: "auth.login.failed",
      method: "GET",
      path: "/api/auth/callback",
      stage: "token",
      timedOut: false,
    });
    // 쿼리스트링의 code는 남기지 않는다
    expect(JSON.stringify(logged[0])).not.toContain("bad-code");
  });

  it("state 불일치는 값 없이 사유만 warn으로 남긴다", async () => {
    const req = createCallbackReq(
      { code: "auth-code", state: "state-1" },
      { "__Host-oauth_state": "state-different" }
    );
    await GET(req as never);
    const logged = entries(consoleWarn);
    expect(logged).toEqual([expect.objectContaining({ event: "auth.oauth_state_invalid", reason: "mismatch" })]);
    const raw = JSON.stringify(logged[0]);
    expect(raw).not.toContain("state-1");
    expect(raw).not.toContain("auth-code");
  });

  it.each([
    [{ code: "c" }, { "__Host-oauth_state": "s" }, "missing_state"],
    [{ code: "c", state: "s" }, {}, "missing_cookie"],
  ])("state 검증 실패 사유 %#", async (params, cookies, reason) => {
    await GET(createCallbackReq(params as Record<string, string>, cookies as Record<string, string>) as never);
    expect(entries(consoleWarn)[0]).toMatchObject({ event: "auth.oauth_state_invalid", reason });
  });

  it("code 없음(동의 취소 등)은 위조 신호가 아니라 info로 남긴다", async () => {
    await GET(createCallbackReq({ state: "s" }, { "__Host-oauth_state": "s" }) as never);
    expect(entries(consoleWarn)).toEqual([]);
    expect(entries(consoleLog)).toEqual([
      expect.objectContaining({ level: "info", event: "auth.oauth_state_invalid", reason: "missing_code" }),
    ]);
  });

  it("실제 CHZZK 호출이 시간 초과되면 kind=timeout으로 남는다", async () => {
    const actual = await vi.importActual<typeof import("@/lib/chzzk")>("@/lib/chzzk");
    vi.mocked(exchangeCode).mockImplementation(actual.exchangeCode);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"))
    );
    try {
      await GET(createCallbackReq({ code: "c", state: "s" }, { "__Host-oauth_state": "s" }) as never);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(entries(consoleError)[0]).toMatchObject({
      event: "auth.login.failed",
      stage: "token",
      timedOut: true,
      errorName: "ChzzkApiError",
      kind: "timeout",
    });
  });

  it("사용자 조회 시간 초과 → stage=user, timedOut, status 없이 기록", async () => {
    vi.mocked(exchangeCode).mockResolvedValue({ accessToken: "a", refreshToken: "r", expiresIn: 1 });
    vi.mocked(getUserInfo).mockRejectedValue(
      new ChzzkApiError("user", "CHZZK user info timed out", { timedOut: true })
    );
    const res = await GET(
      createCallbackReq({ code: "c", state: "s" }, { "__Host-oauth_state": "s" }) as never
    );
    expect(res.headers.get("Location")).toContain("/login?error=auth_failed");
    expect(entries(consoleError)[0]).toMatchObject({
      event: "auth.login.failed",
      stage: "user",
      timedOut: true,
      errorName: "ChzzkApiError",
    });
  });

  it("CHZZK 실패 응답 → status를 남긴다", async () => {
    vi.mocked(exchangeCode).mockRejectedValue(
      new ChzzkApiError("token", "CHZZK token exchange failed: 401", { status: 401 })
    );
    await GET(createCallbackReq({ code: "c", state: "s" }, { "__Host-oauth_state": "s" }) as never);
    expect(entries(consoleError)[0]).toMatchObject({ stage: "token", status: 401 });
  });

  it("DB 단계 실패 → stage=db, 오류 분류 포함", async () => {
    vi.mocked(exchangeCode).mockResolvedValue({ accessToken: "a", refreshToken: "r", expiresIn: 1 });
    vi.mocked(getUserInfo).mockResolvedValue({ id: "chzzk-1", nickname: "닉네임비밀", profileImageUrl: null });
    db._stmt.first.mockRejectedValue(new Error("D1_ERROR: no such table: users: SQLITE_ERROR"));
    await GET(createCallbackReq({ code: "c", state: "s" }, { "__Host-oauth_state": "s" }) as never);
    const logged = entries(consoleError)[0];
    expect(logged).toMatchObject({ event: "auth.login.failed", stage: "db", kind: "schema_drift" });
    expect(typeof logged.durationMs).toBe("number");
    expect(JSON.stringify(logged)).not.toContain("닉네임비밀");
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
      { "__Host-oauth_state": "state-1", oauth_next: encodeURIComponent(next) }
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
      { "__Host-oauth_state": "other", oauth_next: encodeURIComponent("/timers/abc") }
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
