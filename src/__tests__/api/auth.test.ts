import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDB, createGetRequest, parseJson } from "../helpers";

vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

import { getDB } from "@/lib/db";
import { GET as meHandler } from "@/app/api/auth/me/route";
import { NextRequest } from "next/server";

beforeEach(() => {
  vi.stubEnv("JWT_SECRET", "test-secret-key-at-least-32-chars-long!");
});

function makeAuthRequest(url: string, userId?: string) {
  const headers = new Headers();
  if (userId) {
    headers.set("x-user-id", userId);
  }
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: "GET",
    headers,
  });
}

describe("GET /api/auth/me", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
  });

  it("인증 헤더 없이 → 401", async () => {
    const req = makeAuthRequest("/api/auth/me");
    const res = await meHandler(req as never);
    expect(res.status).toBe(401);
    const body = await parseJson(res);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("유효한 x-user-id + DB 사용자 존재 → 200 사용자 정보", async () => {
    db._stmt.first.mockResolvedValue({
      id: "user-1",
      chzzk_user_id: "chzzk-1",
      nickname: "테스트유저",
      profile_image_url: "https://img.example.com/profile.jpg",
    });

    const req = makeAuthRequest("/api/auth/me", "user-1");
    const res = await meHandler(req as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.id).toBe("user-1");
    expect(body.data.chzzkUserId).toBe("chzzk-1");
    expect(body.data.nickname).toBe("테스트유저");
    expect(body.data.profileImageUrl).toBe("https://img.example.com/profile.jpg");
  });

  it("유효한 x-user-id + DB 사용자 없음 → 404", async () => {
    db._stmt.first.mockResolvedValue(null);

    const req = makeAuthRequest("/api/auth/me", "deleted-user");
    const res = await meHandler(req as never);
    expect(res.status).toBe(404);
  });
});

describe("withErrorHandler", () => {
  it("핸들러에서 에러 발생 시 500 INTERNAL_ERROR 반환", async () => {
    // getDB가 에러를 던지도록 설정
    vi.mocked(getDB).mockRejectedValue(new Error("DB connection failed"));

    const req = makeAuthRequest("/api/auth/me", "user-1");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await meHandler(req as never);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("서버 오류가 발생했습니다");
    // 내부 에러 메시지가 노출되지 않음
    expect(JSON.stringify(body)).not.toContain("DB connection failed");

    consoleSpy.mockRestore();
  });
});
