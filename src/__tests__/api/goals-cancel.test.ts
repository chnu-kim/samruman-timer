import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockDB,
  createDeleteRequest,
  createPatchRequest,
  parseJson,
} from "../helpers";

vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

vi.mock("@/lib/goal", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/goal")>();
  return { ...orig, computeProgress: vi.fn() };
});

import { getDB } from "@/lib/db";
import { computeProgress } from "@/lib/goal";
import { DELETE, PATCH } from "@/app/api/projects/[id]/goals/[goalId]/route";

const PROJECT_ROW = { id: "proj-1", owner_user_id: "user-1" };
const ACTIVE_GOAL = {
  id: "goal-1",
  project_id: "proj-1",
  type: "DURATION",
  title: "10시간 달성",
  target_seconds: 36000,
  target_datetime: null,
  status: "ACTIVE",
  created_at: "2026-01-01T00:00:00.000Z",
  completed_at: null,
  updated_at: "2026-01-01T00:00:00.000Z",
};

function makeParams(id = "proj-1", goalId = "goal-1") {
  return { params: Promise.resolve({ id, goalId }) };
}

describe("PATCH /api/projects/[id]/goals/[goalId]", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
    vi.mocked(computeProgress).mockResolvedValue({
      progress: { percentage: 50, currentSeconds: 18000, remainingToTarget: 18000 },
      newStatus: null,
    });
  });

  it("401 인증 없으면 에러", async () => {
    const req = createPatchRequest("/api/projects/proj-1/goals/goal-1", {});
    const res = await PATCH(req as never, makeParams() as never);

    expect(res.status).toBe(401);
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("200 목표 취소 성공", async () => {
    db._stmt.first
      .mockResolvedValueOnce(PROJECT_ROW)  // project check
      .mockResolvedValueOnce({ ...ACTIVE_GOAL }); // goal check

    const req = createPatchRequest(
      "/api/projects/proj-1/goals/goal-1",
      {},
      { "x-user-id": "user-1" },
    );
    const res = await PATCH(req as never, makeParams() as never);
    const json = await parseJson(res);

    expect(res.status).toBe(200);
    expect(json.data.status).toBe("CANCELLED");
    expect(db._stmt.run).toHaveBeenCalled();
  });

  it("404 프로젝트 없으면 에러", async () => {
    db._stmt.first.mockResolvedValueOnce(null);

    const req = createPatchRequest(
      "/api/projects/proj-1/goals/goal-1",
      {},
      { "x-user-id": "user-1" },
    );
    const res = await PATCH(req as never, makeParams() as never);

    expect(res.status).toBe(404);
  });

  it("403 소유자가 아니면 에러", async () => {
    db._stmt.first.mockResolvedValueOnce(PROJECT_ROW);

    const req = createPatchRequest(
      "/api/projects/proj-1/goals/goal-1",
      {},
      { "x-user-id": "other-user" },
    );
    const res = await PATCH(req as never, makeParams() as never);

    expect(res.status).toBe(403);
  });

  it("404 목표가 없으면 에러", async () => {
    db._stmt.first
      .mockResolvedValueOnce(PROJECT_ROW)
      .mockResolvedValueOnce(null); // goal not found

    const req = createPatchRequest(
      "/api/projects/proj-1/goals/goal-1",
      {},
      { "x-user-id": "user-1" },
    );
    const res = await PATCH(req as never, makeParams() as never);

    expect(res.status).toBe(404);
  });

  it("400 ACTIVE가 아닌 목표 취소 시도", async () => {
    db._stmt.first
      .mockResolvedValueOnce(PROJECT_ROW)
      .mockResolvedValueOnce({ ...ACTIVE_GOAL, status: "COMPLETED" });

    const req = createPatchRequest(
      "/api/projects/proj-1/goals/goal-1",
      {},
      { "x-user-id": "user-1" },
    );
    const res = await PATCH(req as never, makeParams() as never);

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/projects/[id]/goals/[goalId]", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
  });

  it("401 인증 없으면 에러", async () => {
    const req = createDeleteRequest("/api/projects/proj-1/goals/goal-1");
    const res = await DELETE(req as never, makeParams() as never);

    expect(res.status).toBe(401);
    expect(db.prepare).not.toHaveBeenCalled();
  });

  // C118: '삭제'가 취소와 같은 동작이던 것을 실제 행 삭제로 바꿨다. 실패·취소로 끝난 목표만 지운다
  it.each(["CANCELLED", "FAILED"])("200 %s 목표는 행을 실제로 지운다", async (status) => {
    db._stmt.first
      .mockResolvedValueOnce(PROJECT_ROW)
      .mockResolvedValueOnce({ id: "goal-1", status });
    db._stmt.run.mockResolvedValueOnce({ meta: { changes: 1 } });

    const req = createDeleteRequest(
      "/api/projects/proj-1/goals/goal-1",
      { "x-user-id": "user-1" },
    );
    const res = await DELETE(req as never, makeParams() as never);
    const json = await parseJson(res);

    expect(res.status).toBe(200);
    expect(json.data.id).toBe("goal-1");
    const sqls = db.prepare.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(sqls.some((q: string) => q.startsWith("DELETE FROM goals"))).toBe(true);
    expect(sqls.some((q: string) => q.includes("UPDATE goals"))).toBe(false);
    expect(db._stmt.bind).toHaveBeenLastCalledWith("goal-1", "proj-1");
  });

  it("409 진행 중인 목표는 지우지 않는다(먼저 취소)", async () => {
    db._stmt.first
      .mockResolvedValueOnce(PROJECT_ROW)
      .mockResolvedValueOnce({ id: "goal-1", status: "ACTIVE" });

    const req = createDeleteRequest(
      "/api/projects/proj-1/goals/goal-1",
      { "x-user-id": "user-1" },
    );
    const res = await DELETE(req as never, makeParams() as never);
    const json = await parseJson(res);

    expect(res.status).toBe(409);
    expect(json.error.code).toBe("CONFLICT");
    expect(db._stmt.run).not.toHaveBeenCalled();
  });

  // 예전에는 DELETE가 달성 목표를 CANCELLED로 덮어써 달성 기록이 사라졌다
  it("409 달성한 목표는 지우지도 상태를 바꾸지도 않는다", async () => {
    db._stmt.first
      .mockResolvedValueOnce(PROJECT_ROW)
      .mockResolvedValueOnce({ id: "goal-1", status: "COMPLETED" });

    const req = createDeleteRequest(
      "/api/projects/proj-1/goals/goal-1",
      { "x-user-id": "user-1" },
    );
    const res = await DELETE(req as never, makeParams() as never);

    expect(res.status).toBe(409);
    expect(db._stmt.run).not.toHaveBeenCalled();
  });

  it("404 조회 뒤 다른 요청이 먼저 지웠으면 없는 목표로 답한다", async () => {
    db._stmt.first
      .mockResolvedValueOnce(PROJECT_ROW)
      .mockResolvedValueOnce({ id: "goal-1", status: "CANCELLED" });
    db._stmt.run.mockResolvedValueOnce({ meta: { changes: 0 } });

    const req = createDeleteRequest(
      "/api/projects/proj-1/goals/goal-1",
      { "x-user-id": "user-1" },
    );
    const res = await DELETE(req as never, makeParams() as never);

    expect(res.status).toBe(404);
  });

  it("404 프로젝트 없으면 에러", async () => {
    db._stmt.first.mockResolvedValueOnce(null);

    const req = createDeleteRequest(
      "/api/projects/proj-1/goals/goal-1",
      { "x-user-id": "user-1" },
    );
    const res = await DELETE(req as never, makeParams() as never);

    expect(res.status).toBe(404);
  });

  it("403 소유자가 아니면 에러", async () => {
    db._stmt.first.mockResolvedValueOnce(PROJECT_ROW);

    const req = createDeleteRequest(
      "/api/projects/proj-1/goals/goal-1",
      { "x-user-id": "other-user" },
    );
    const res = await DELETE(req as never, makeParams() as never);

    expect(res.status).toBe(403);
  });

  it("404 목표가 없으면 에러", async () => {
    db._stmt.first
      .mockResolvedValueOnce(PROJECT_ROW)
      .mockResolvedValueOnce(null);

    const req = createDeleteRequest(
      "/api/projects/proj-1/goals/goal-1",
      { "x-user-id": "user-1" },
    );
    const res = await DELETE(req as never, makeParams() as never);

    expect(res.status).toBe(404);
  });
});
