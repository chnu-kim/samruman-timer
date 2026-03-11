import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDB, createGetRequest, createPatchRequest, parseJson } from "../helpers";

vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

import { getDB } from "@/lib/db";
import { GET, PATCH } from "@/app/api/projects/[id]/route";

const PROJECT_ROW = {
  id: "proj-1",
  name: "테스트 프로젝트",
  description: "설명",
  status: "ACTIVE",
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
  owner_id: "user-1",
  owner_nickname: "유저1",
  owner_profile_image_url: null,
};

function makeParams(id = "proj-1") {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/projects/[id]", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
  });

  it("200 프로젝트 상세 반환", async () => {
    db._stmt.first.mockResolvedValue(PROJECT_ROW);
    const req = createGetRequest("/api/projects/proj-1");
    const res = await GET(req as never, makeParams() as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.id).toBe("proj-1");
    expect(body.data.name).toBe("테스트 프로젝트");
    expect(body.data.owner.nickname).toBe("유저1");
  });

  it("미존재 → 404", async () => {
    db._stmt.first.mockResolvedValue(null);
    const req = createGetRequest("/api/projects/nonexistent");
    const res = await GET(req as never, makeParams("nonexistent") as never);
    expect(res.status).toBe(404);
  });

  it("DELETED 상태 → 404", async () => {
    db._stmt.first.mockResolvedValue({ ...PROJECT_ROW, status: "DELETED" });
    const req = createGetRequest("/api/projects/proj-1");
    const res = await GET(req as never, makeParams() as never);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/projects/[id]", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
  });

  it("인증 없이 → 401", async () => {
    const req = createPatchRequest("/api/projects/proj-1", { name: "새이름" });
    const res = await PATCH(req as never, makeParams() as never);
    expect(res.status).toBe(401);
  });

  it("소유자 아님 → 403", async () => {
    db._stmt.first.mockResolvedValue({ id: "proj-1", owner_user_id: "other-user", status: "ACTIVE" });
    const req = createPatchRequest("/api/projects/proj-1", { name: "새이름" }, {
      "x-user-id": "user-1",
    });
    const res = await PATCH(req as never, makeParams() as never);
    expect(res.status).toBe(403);
  });

  it("미존재 프로젝트 → 404", async () => {
    db._stmt.first.mockResolvedValue(null);
    const req = createPatchRequest("/api/projects/proj-1", { name: "새이름" }, {
      "x-user-id": "user-1",
    });
    const res = await PATCH(req as never, makeParams() as never);
    expect(res.status).toBe(404);
  });

  it("name 빈 문자열 → 400", async () => {
    db._stmt.first.mockResolvedValue({ id: "proj-1", owner_user_id: "user-1", status: "ACTIVE" });
    const req = createPatchRequest("/api/projects/proj-1", { name: "" }, {
      "x-user-id": "user-1",
    });
    const res = await PATCH(req as never, makeParams() as never);
    expect(res.status).toBe(400);
  });

  it("변경할 필드 없음 → 400", async () => {
    db._stmt.first.mockResolvedValue({ id: "proj-1", owner_user_id: "user-1", status: "ACTIVE" });
    const req = createPatchRequest("/api/projects/proj-1", {}, {
      "x-user-id": "user-1",
    });
    const res = await PATCH(req as never, makeParams() as never);
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("200 수정 성공", async () => {
    // first() 첫 호출: 소유자 확인, 두 번째 호출: 업데이트 후 조회
    db._stmt.first
      .mockResolvedValueOnce({ id: "proj-1", owner_user_id: "user-1", status: "ACTIVE" })
      .mockResolvedValueOnce({
        id: "proj-1",
        name: "새이름",
        description: "설명",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-06-01T00:00:00Z",
        owner_id: "user-1",
        owner_nickname: "유저1",
        owner_profile_image_url: null,
      });
    const req = createPatchRequest("/api/projects/proj-1", { name: "새이름" }, {
      "x-user-id": "user-1",
    });
    const res = await PATCH(req as never, makeParams() as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.name).toBe("새이름");
    expect(body.data.owner.id).toBe("user-1");
  });
});
