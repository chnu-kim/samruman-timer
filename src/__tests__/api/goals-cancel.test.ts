import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockDB,
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
import { PATCH } from "@/app/api/projects/[id]/goals/[goalId]/route";

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
