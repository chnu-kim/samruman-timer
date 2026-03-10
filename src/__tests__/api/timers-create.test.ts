import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDB, createPostRequest, parseJson } from "../helpers";

vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

import { getDB } from "@/lib/db";
import { POST } from "@/app/api/projects/[id]/timers/route";

const PROJECT_ROW = { owner_user_id: "user-1" };

function callPost(body: unknown, headers: Record<string, string> = {}) {
  const req = createPostRequest("/api/projects/proj-1/timers", body, {
    "x-user-id": "user-1",
    "x-user-nickname": encodeURIComponent("테스터"),
    ...headers,
  });
  const params = Promise.resolve({ id: "proj-1" });
  return POST(req as never, { params } as never);
}

describe("POST /api/projects/[id]/timers — 보안", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    db._stmt.first.mockResolvedValue(PROJECT_ROW);
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
  });

  it("잘못된 percent-encoding 닉네임 → 500이 아닌 정상 처리", async () => {
    // %E0%A4 는 불완전한 UTF-8 시퀀스로 decodeURIComponent가 URIError를 throw
    const res = await callPost(
      { title: "테스트", initialSeconds: 3600 },
      { "x-user-nickname": "%E0%A4" }
    );
    // 수정 전: withErrorHandler가 URIError를 잡아 500 반환
    // 수정 후: fallback 처리로 201 반환
    expect(res.status).toBe(201);
    const body = await parseJson(res);
    expect(body.data.id).toBeDefined();
  });
});
