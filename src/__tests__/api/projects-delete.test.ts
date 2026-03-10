import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDB, createDeleteRequest, parseJson } from "../helpers";

vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

import { getDB } from "@/lib/db";
import { DELETE } from "@/app/api/projects/[id]/route";

const PROJECT_ROW = {
  id: "project-1",
  owner_user_id: "user-1",
  status: "ACTIVE",
};

function callDelete(userId?: string) {
  const headers: Record<string, string> = {};
  if (userId) {
    headers["x-user-id"] = userId;
    headers["x-user-nickname"] = "tester";
  }
  const req = createDeleteRequest("/api/projects/project-1", headers);
  const params = Promise.resolve({ id: "project-1" });
  return DELETE(req as never, { params } as never);
}

describe("DELETE /api/projects/[id]", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    db._stmt.first.mockResolvedValue(PROJECT_ROW);
    db._stmt.all.mockResolvedValue({ results: [] });
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
  });

  it("인증 없이 → 401", async () => {
    const res = await callDelete();
    expect(res.status).toBe(401);
  });

  it("프로젝트 없음 → 404", async () => {
    db._stmt.first.mockResolvedValue(null);
    const res = await callDelete("user-1");
    expect(res.status).toBe(404);
  });

  it("이미 DELETED 상태 → 404", async () => {
    db._stmt.first.mockResolvedValue({ ...PROJECT_ROW, status: "DELETED" });
    const res = await callDelete("user-1");
    expect(res.status).toBe(404);
  });

  it("소유자 아님 → 403", async () => {
    const res = await callDelete("other-user");
    expect(res.status).toBe(403);
  });

  it("삭제 성공 → 200 + db.batch 호출", async () => {
    const res = await callDelete("user-1");
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.data.id).toBe("project-1");
    expect(db.batch).toHaveBeenCalledTimes(1);
  });

  it("하위 타이머가 있을 때 타이머 DELETE 로그도 생성", async () => {
    db._stmt.all.mockResolvedValue({
      results: [
        { id: "timer-1", base_remaining_seconds: 3600, last_calculated_at: new Date().toISOString(), status: "RUNNING" },
        { id: "timer-2", base_remaining_seconds: 1800, last_calculated_at: new Date().toISOString(), status: "SCHEDULED" },
      ],
    });
    const res = await callDelete("user-1");
    expect(res.status).toBe(200);
    // batch: 1 project update + 1 timers update + 2 timer logs = 4 statements
    const batchArgs = db.batch.mock.calls[0][0];
    expect(batchArgs).toHaveLength(4);
  });
});
