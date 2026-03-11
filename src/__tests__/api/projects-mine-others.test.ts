import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDB, createGetRequest, parseJson } from "../helpers";

vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

import { getDB } from "@/lib/db";
import { GET as getMine } from "@/app/api/projects/mine/route";
import { GET as getOthers } from "@/app/api/projects/others/route";

describe("GET /api/projects/mine", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
  });

  it("인증 없이 → 401", async () => {
    const req = createGetRequest("/api/projects/mine");
    const res = await getMine(req as never);
    expect(res.status).toBe(401);
  });

  it("200 내 프로젝트만 반환", async () => {
    db._stmt.first.mockResolvedValue({ cnt: 1 });
    db._stmt.all.mockResolvedValue({
      results: [
        {
          id: "p1",
          name: "내 프로젝트",
          description: null,
          owner_nickname: "나",
          timer_count: 1,
          created_at: "2025-01-01T00:00:00Z",
        },
      ],
    });
    const req = createGetRequest("/api/projects/mine", { "x-user-id": "user-1" });
    const res = await getMine(req as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.projects).toHaveLength(1);
    expect(body.data.projects[0].name).toBe("내 프로젝트");
    expect(body.data.projects[0].ownerNickname).toBe("나");
    expect(body.data.projects[0].timerCount).toBe(1);
    expect(body.data.pagination.total).toBe(1);
  });

  it("프로젝트 없을 때 빈 배열", async () => {
    db._stmt.first.mockResolvedValue({ cnt: 0 });
    db._stmt.all.mockResolvedValue({ results: [] });
    const req = createGetRequest("/api/projects/mine", { "x-user-id": "user-1" });
    const res = await getMine(req as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.projects).toHaveLength(0);
  });
});

describe("GET /api/projects/others", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
  });

  it("인증 없이 → 401", async () => {
    const req = createGetRequest("/api/projects/others");
    const res = await getOthers(req as never);
    expect(res.status).toBe(401);
  });

  it("200 다른 사용자 프로젝트 반환", async () => {
    db._stmt.first.mockResolvedValue({ cnt: 1 });
    db._stmt.all.mockResolvedValue({
      results: [
        {
          id: "p2",
          name: "다른 사람 프로젝트",
          description: "다른 사람의 프로젝트입니다",
          owner_nickname: "다른유저",
          timer_count: 0,
          created_at: "2025-02-01T00:00:00Z",
        },
      ],
    });
    const req = createGetRequest("/api/projects/others", { "x-user-id": "user-1" });
    const res = await getOthers(req as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.projects).toHaveLength(1);
    expect(body.data.projects[0].name).toBe("다른 사람 프로젝트");
    expect(body.data.projects[0].ownerNickname).toBe("다른유저");
  });
});
