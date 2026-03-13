import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { middleware as proxy } from "@/middleware";

// signJwt를 사용해 유효한 JWT 생성
import { signJwt } from "@/lib/auth";

beforeEach(() => {
  vi.stubEnv("JWT_SECRET", "test-secret-key-at-least-32-chars-long!");
  vi.stubEnv("CHZZK_CLIENT_ID", "test-client-id");
  vi.stubEnv("CHZZK_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("BASE_URL", "http://localhost:3000");
});

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
    const body = await res.json();
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

  it("POST /api/auth/logout → 401", async () => {
    const req = makeRequest("POST", "/api/auth/logout");
    const res = await proxy(req);
    expect(res.status).toBe(401);
  });
});

describe("proxy: 보호 라우트 — 잘못된 토큰", () => {
  it("유효하지 않은 JWT → 401", async () => {
    const req = makeRequest("POST", "/api/projects", {
      cookie: "session=invalid.jwt.token",
    });
    const res = await proxy(req);
    expect(res.status).toBe(401);
    const body = await res.json();
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
