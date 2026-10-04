import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import { NextRequest } from "next/server";
import { parseJson } from "@/__tests__/helpers";

vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn().mockResolvedValue({}) };
});

vi.mock("@/lib/auth", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/auth")>();
  return { ...orig, rotateRefreshToken: vi.fn() };
});

import { middleware as proxy } from "@/middleware";
import { resetEnvValidation } from "@/lib/env";

// signJwt를 사용해 유효한 JWT 생성
import { signJwt, rotateRefreshToken } from "@/lib/auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let consoleLog: MockInstance<typeof console.log>;
let consoleWarn: MockInstance<typeof console.warn>;
let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.stubEnv("JWT_SECRET", "test-secret-key-at-least-32-chars-long!");
  vi.stubEnv("CHZZK_CLIENT_ID", "test-client-id");
  vi.stubEnv("CHZZK_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("BASE_URL", "http://localhost:3000");
  consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(rotateRefreshToken).mockReset();
});

afterEach(() => {
  consoleLog.mockRestore();
  consoleWarn.mockRestore();
  consoleError.mockRestore();
});

function entries(spy: MockInstance<(...args: never[]) => void>) {
  return spy.mock.calls.map((c) => JSON.parse(String((c as unknown[])[0])));
}

function makeRequest(
  method: string,
  pathname: string,
  options?: { headers?: Record<string, string>; cookie?: string }
): NextRequest {
  const url = new URL(pathname, "http://localhost:3000");
  const headers = new Headers(options?.headers);
  if (options?.cookie) {
    headers.set("cookie", options.cookie);
  }
  return new NextRequest(url, { method, headers });
}

describe("proxy: 내부 헤더 삭제", () => {
  it("비보호 라우트에서도 x-user-id 헤더가 삭제된다", async () => {
    const req = makeRequest("GET", "/api/projects", {
      headers: { "x-user-id": "forged-user", "x-user-nickname": "hacker" },
    });
    const res = await proxy(req);
    // NextResponse.next()는 헤더가 수정된 요청을 포함
    const passedHeaders = res.headers.get("x-middleware-request-x-user-id");
    expect(passedHeaders).toBeNull();
  });

  it("보호 라우트에서도 외부 x-user-id가 삭제되고 JWT 기반으로 재설정된다", async () => {
    const token = await signJwt({
      userId: "real-user",
      chzzkUserId: "chzzk-1",
      nickname: "tester",
    });
    const req = makeRequest("POST", "/api/projects", {
      headers: { "x-user-id": "forged-user" },
      cookie: `session=${token}`,
    });
    const res = await proxy(req);
    expect(res.status).not.toBe(401);
    // JWT에서 추출한 값이 설정되어야 함
    const userId = res.headers.get("x-middleware-request-x-user-id");
    expect(userId).toBe("real-user");
  });
});

describe("proxy: 비보호 라우트", () => {
  it("GET /api/projects → 인증 없이 통과", async () => {
    const req = makeRequest("GET", "/api/projects");
    const res = await proxy(req);
    expect(res.status).toBe(200); // NextResponse.next()
  });

  it("GET /api/timers/abc/logs → 인증 없이 통과", async () => {
    const req = makeRequest("GET", "/api/timers/abc/logs");
    const res = await proxy(req);
    expect(res.status).toBe(200);
  });
});

describe("proxy: 보호 라우트 — 토큰 없음", () => {
  it("POST /api/projects → 401", async () => {
    const req = makeRequest("POST", "/api/projects");
    const res = await proxy(req);
    expect(res.status).toBe(401);
    const body = await parseJson(res);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("POST /api/projects/abc/timers → 401", async () => {
    const req = makeRequest("POST", "/api/projects/abc/timers");
    const res = await proxy(req);
    expect(res.status).toBe(401);
  });

  it("POST /api/timers/abc/modify → 401", async () => {
    const req = makeRequest("POST", "/api/timers/abc/modify");
    const res = await proxy(req);
    expect(res.status).toBe(401);
  });

  it("POST /api/timers/abc/activate → 401", async () => {
    const req = makeRequest("POST", "/api/timers/abc/activate");
    const res = await proxy(req);
    expect(res.status).toBe(401);
  });

  it("POST /api/timers/abc/logs/l1/revert → 401", async () => {
    const req = makeRequest("POST", "/api/timers/abc/logs/l1/revert");
    const res = await proxy(req);
    expect(res.status).toBe(401);
  });

  it("DELETE /api/projects/abc/goals/g1 → 401", async () => {
    const req = makeRequest("DELETE", "/api/projects/abc/goals/g1");
    const res = await proxy(req);
    expect(res.status).toBe(401);
  });
});

describe("proxy: 로그아웃은 middleware 인증을 거치지 않는다", () => {
  it("session 없이 refresh만 있어도 rotation 없이 라우트로 넘긴다", async () => {
    const req = makeRequest("POST", "/api/auth/logout", {
      cookie: "refresh=some-refresh-token",
    });
    const res = await proxy(req);
    expect(res.status).not.toBe(401);
    // 새 session 쿠키를 심으면 라우트의 삭제 쿠키를 덮어쓴다
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("proxy: 보호 라우트 — 잘못된 토큰", () => {
  it("유효하지 않은 JWT → 401", async () => {
    const req = makeRequest("POST", "/api/projects", {
      cookie: "session=invalid.jwt.token",
    });
    const res = await proxy(req);
    expect(res.status).toBe(401);
    const body = await parseJson(res);
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toContain("인증이 필요합니다");
  });
});

describe("proxy: 보호 라우트 — 유효한 토큰", () => {
  it("유효한 JWT → 통과 + 사용자 헤더 주입", async () => {
    const token = await signJwt({
      userId: "user-123",
      chzzkUserId: "chzzk-456",
      nickname: "tester",
    });
    const req = makeRequest("POST", "/api/projects", {
      cookie: `session=${token}`,
    });
    const res = await proxy(req);
    expect(res.status).toBe(200);

    // x-middleware-request- 접두사로 전달됨 (Next.js proxy 동작)
    expect(res.headers.get("x-middleware-request-x-user-id")).toBe("user-123");
    expect(res.headers.get("x-middleware-request-x-user-chzzk-id")).toBe("chzzk-456");
    expect(res.headers.get("x-middleware-request-x-user-nickname")).toBe("tester");
  });

  it("한글 닉네임은 URL 인코딩되어 헤더에 설정된다", async () => {
    const token = await signJwt({
      userId: "user-kr",
      chzzkUserId: "chzzk-kr",
      nickname: "테스트유저",
    });
    const req = makeRequest("POST", "/api/projects", {
      cookie: `session=${token}`,
    });
    const res = await proxy(req);
    expect(res.status).toBe(200);

    const encoded = res.headers.get("x-middleware-request-x-user-nickname");
    expect(encoded).toBe(encodeURIComponent("테스트유저"));
    expect(decodeURIComponent(encoded!)).toBe("테스트유저");
  });
});

describe("proxy: x-request-id 응답 헤더", () => {
  it("비보호 라우트 통과 응답에 UUID x-request-id가 붙고 요청 헤더와 같다", async () => {
    const res = await proxy(makeRequest("GET", "/api/timers/abc"));
    const id = res.headers.get("x-request-id");
    expect(id).toMatch(UUID_RE);
    expect(res.headers.get("x-middleware-request-x-request-id")).toBe(id);
  });

  it("GET /api/health는 쿠키 없이 통과하고 x-request-id가 라우트로 전달된다", async () => {
    const res = await proxy(makeRequest("GET", "/api/health"));
    expect(res.status).toBe(200);
    const id = res.headers.get("x-request-id");
    expect(id).toMatch(UUID_RE);
    expect(res.headers.get("x-middleware-request-x-request-id")).toBe(id);
  });

  it("클라이언트가 보낸 x-request-id는 새 값으로 덮어쓴다", async () => {
    const res = await proxy(
      makeRequest("GET", "/api/projects", { headers: { "x-request-id": "forged-id" } })
    );
    expect(res.headers.get("x-request-id")).toMatch(UUID_RE);
    expect(res.headers.get("x-middleware-request-x-request-id")).toMatch(UUID_RE);
  });

  it("유효한 JWT 통과 응답에도 붙는다", async () => {
    const token = await signJwt({ userId: "u", chzzkUserId: "c", nickname: "n" });
    const res = await proxy(makeRequest("POST", "/api/projects", { cookie: `session=${token}` }));
    expect(res.headers.get("x-request-id")).toMatch(UUID_RE);
  });

  it("토큰 없는 401에도 붙고 로그는 남기지 않는다", async () => {
    const res = await proxy(makeRequest("POST", "/api/projects"));
    expect(res.status).toBe(401);
    expect(res.headers.get("x-request-id")).toMatch(UUID_RE);
    expect(consoleLog).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("proxy: refresh 거부 사유 로깅", () => {
  it("reuse_detected → 401 + warn(userId·familyId), 토큰 원문은 남기지 않는다", async () => {
    vi.mocked(rotateRefreshToken).mockResolvedValue({
      ok: false,
      reason: "reuse_detected",
      userId: "user-1",
      familyId: "family-1",
    });
    const res = await proxy(
      makeRequest("POST", "/api/projects?x=1", { cookie: "refresh=raw-refresh-secret" })
    );

    expect(res.status).toBe(401);
    const requestId = res.headers.get("x-request-id");
    expect(requestId).toMatch(UUID_RE);
    const logged = entries(consoleWarn);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({
      level: "warn",
      event: "auth.refresh.reuse_detected",
      requestId,
      method: "POST",
      path: "/api/projects",
      userId: "user-1",
      familyId: "family-1",
    });
    expect(JSON.stringify(logged[0])).not.toContain("raw-refresh-secret");
  });

  // revoked: 이미 폐기된 family의 쿠키가 페이지마다 다시 오는 경우. 사건당 한 번만 warn이 나가도록 info로 남긴다
  it.each(["not_found", "expired", "family_expired", "revoked", "user_missing"] as const)(
    "%s → 401 + info auth.refresh.rejected",
    async (reason) => {
      vi.mocked(rotateRefreshToken).mockResolvedValue({ ok: false, reason });
      const res = await proxy(makeRequest("POST", "/api/projects", { cookie: "refresh=r" }));

      expect(res.status).toBe(401);
      const body = await parseJson(res);
      expect(body.error.code).toBe("UNAUTHORIZED");
      expect(entries(consoleLog)).toEqual([
        expect.objectContaining({ level: "info", event: "auth.refresh.rejected", reason }),
      ]);
      expect(consoleWarn).not.toHaveBeenCalled();
    }
  );

  it("갱신 성공 → 새 쿠키 + 사용자 헤더 주입 + x-request-id", async () => {
    vi.mocked(rotateRefreshToken).mockResolvedValue({
      ok: true,
      userId: "user-1",
      chzzkUserId: "chzzk-1",
      nickname: "tester",
      newRawToken: "new-raw",
      newTokenHash: "h",
      familyId: "family-1",
    });
    const res = await proxy(makeRequest("POST", "/api/projects", { cookie: "refresh=r" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-request-x-user-id")).toBe("user-1");
    expect(res.headers.get("x-request-id")).toMatch(UUID_RE);
    expect(res.cookies.get("refresh")?.value).toBe("new-raw");
    expect(res.cookies.get("session")?.value).toBeTruthy();
  });
});

describe("proxy: refresh 중 인프라 오류", () => {
  it("rotation이 throw하면 401이 아니라 500 INTERNAL_ERROR + auth.refresh.failed", async () => {
    vi.mocked(rotateRefreshToken).mockRejectedValue(
      new Error("D1_ERROR: no such column: family_expires_at: SQLITE_ERROR")
    );
    const res = await proxy(makeRequest("GET", "/api/auth/me", { cookie: "refresh=r" }));

    expect(res.status).toBe(500);
    const body = await parseJson(res);
    expect(body).toEqual({ error: { code: "INTERNAL_ERROR", message: "서버 오류가 발생했습니다" } });
    const requestId = res.headers.get("x-request-id");
    expect(requestId).toMatch(UUID_RE);

    const logged = entries(consoleError);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({
      level: "error",
      event: "auth.refresh.failed",
      requestId,
      method: "GET",
      path: "/api/auth/me",
      kind: "schema_drift",
    });
  });
});

describe("proxy: 환경변수 검증 실패", () => {
  afterEach(() => {
    resetEnvValidation();
  });

  it("필수 환경변수가 없으면 500 JSON + env.invalid(변수 이름만)", async () => {
    resetEnvValidation();
    vi.stubEnv("CHZZK_CLIENT_SECRET", "");

    const res = await proxy(makeRequest("GET", "/api/projects"));

    expect(res.status).toBe(500);
    const body = await parseJson(res);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(res.headers.get("x-request-id")).toMatch(UUID_RE);
    const logged = entries(consoleError);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({
      event: "env.invalid",
      method: "GET",
      path: "/api/projects",
      invalid: ["CHZZK_CLIENT_SECRET"],
    });
  });
});
