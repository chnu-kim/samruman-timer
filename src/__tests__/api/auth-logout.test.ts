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
import { getDB } from "@/lib/db";
import { createMockDB } from "../helpers";
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

  it("access 만료 + refresh만 있음 → 200 + family 폐기 + 두 쿠키 모두 삭제", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const db = createMockDB();
    db._stmt.first.mockResolvedValue({ family_id: "family-1" });
    vi.mocked(getDB).mockResolvedValue(db);

    const res = await POST(createPostReq("refresh=raw-refresh") as never);
    expect(res.status).toBe(200);

    const sqls = db.prepare.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((q) => q.includes("UPDATE refresh_tokens"))).toBe(true);

    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("session=;") && c.includes("Max-Age=0"))).toBe(true);
    expect(cookies.some((c) => c.startsWith("refresh=;") && c.includes("Max-Age=0"))).toBe(true);
  });

  it("family 폐기가 실패해도 로그아웃은 200으로 끝나고 revoke_failed를 남긴다", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const db = createMockDB();
    db._stmt.first.mockRejectedValue(new Error("D1_ERROR: network connection lost"));
    vi.mocked(getDB).mockResolvedValue(db);

    const res = await POST(createPostReq("refresh=raw-refresh") as never);

    expect(res.status).toBe(200);
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("refresh=;") && c.includes("Max-Age=0"))).toBe(true);
    expect(error).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(String(error.mock.calls[0][0]));
    expect(entry).toMatchObject({
      level: "error",
      event: "auth.logout.revoke_failed",
      method: "POST",
      path: "/api/auth/logout",
      error: "D1_ERROR: network connection lost",
    });
    expect(JSON.stringify(entry)).not.toContain("raw-refresh");
    error.mockRestore();
  });
});
