import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

vi.mock("@/lib/auth", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/auth")>();
  return { ...orig, getCurrentUser: vi.fn() };
});

import { getCurrentUser } from "@/lib/auth";
import { POST } from "@/app/api/auth/logout/route";
import { NextRequest } from "next/server";

function createPostReq(cookie?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie) headers["cookie"] = cookie;
  return new NextRequest(new URL("http://localhost:3000/api/auth/logout"), {
    method: "POST",
    headers,
  });
}

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", "test-secret-key-at-least-32-chars-long!");
  });

  it("인증된 사용자 → 200 + 세션 쿠키 삭제", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      userId: "user-1",
      chzzkUserId: "chzzk-1",
      nickname: "테스터",
      iat: 0,
      exp: 0,
    });

    const res = await POST(createPostReq("session=valid-token") as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toBeNull();

    const setCookie = res.headers.get("Set-Cookie");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("인증 없이 → 401", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await POST(createPostReq() as never);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });
});
