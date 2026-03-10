import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDB, createPostRequest, createPostRequestRaw, parseJson } from "../helpers";

// getDB mock
vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

import { getDB } from "@/lib/db";
import { GET, POST } from "@/app/api/projects/route";

describe("GET /api/projects", () => {
  it("프로젝트 목록을 반환한다", async () => {
    const db = createMockDB();
    db._stmt.all.mockResolvedValue({
      results: [
        {
          id: "p1",
          name: "프로젝트1",
          description: null,
          owner_nickname: "유저1",
          timer_count: 2,
          created_at: "2025-01-01T00:00:00Z",
        },
      ],
    });
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);

    const res = await GET();
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].ownerNickname).toBe("유저1");
    expect(body.data[0].timerCount).toBe(2); // 0 또는 1만 실제 가능하지만 API는 그대로 반환
  });
});

describe("POST /api/projects", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
  });

  it("인증 없이 → 401", async () => {
    const req = createPostRequest("/api/projects", { name: "test" });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it("유효한 요청 → 201 생성", async () => {
    const req = createPostRequest("/api/projects", { name: "새 프로젝트" }, {
      "x-user-id": "user-1",
    });
    const res = await POST(req as never);
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.data.name).toBe("새 프로젝트");
    expect(body.data.ownerUserId).toBe("user-1");
    expect(body.data.id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("잘못된 JSON → 400", async () => {
    const req = createPostRequestRaw("/api/projects", "not-json{", {
      "x-user-id": "user-1",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("name이 숫자 → 400 타입 검증", async () => {
    const req = createPostRequest("/api/projects", { name: 123 }, {
      "x-user-id": "user-1",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("name 빈 문자열 → 400", async () => {
    const req = createPostRequest("/api/projects", { name: "" }, {
      "x-user-id": "user-1",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("name 101자 → 400", async () => {
    const req = createPostRequest("/api/projects", { name: "a".repeat(101) }, {
      "x-user-id": "user-1",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("description 501자 → 400", async () => {
    const req = createPostRequest("/api/projects", {
      name: "ok",
      description: "x".repeat(501),
    }, { "x-user-id": "user-1" });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("description이 배열 → 400 타입 검증", async () => {
    const req = createPostRequest("/api/projects", {
      name: "ok",
      description: ["not", "string"],
    }, { "x-user-id": "user-1" });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });
});
