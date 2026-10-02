import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockDB,
  createGetRequest,
  createPostRequest,
  createPostRequestRaw,
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
import { GET, POST } from "@/app/api/projects/[id]/goals/route";

const PROJECT_ROW = { id: "proj-1", owner_user_id: "user-1" };
const GOAL_ROW = {
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

function makeParams(id = "proj-1") {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/projects/[id]/goals", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
    vi.mocked(computeProgress).mockResolvedValue({
      progress: { percentage: 50, currentSeconds: 18000, remainingToTarget: 18000 },
      newStatus: null,
    });
  });

  it("200 목표 목록 반환", async () => {
    db._stmt.first.mockResolvedValueOnce({ id: "proj-1" }); // project check
    db._stmt.all.mockResolvedValueOnce({ results: [GOAL_ROW] });

    const req = createGetRequest("/api/projects/proj-1/goals");
    const res = await GET(req as never, makeParams() as never);
    const json = await parseJson(res);

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].id).toBe("goal-1");
    expect(json.data[0].progress.percentage).toBe(50);
  });

  it("404 프로젝트 없으면 에러", async () => {
    db._stmt.first.mockResolvedValueOnce(null);

    const req = createGetRequest("/api/projects/nonexistent/goals");
    const res = await GET(req as never, makeParams("nonexistent") as never);

    expect(res.status).toBe(404);
  });

  it("ACTIVE 목표가 COMPLETED로 전이되면 DB 업데이트", async () => {
    db._stmt.first.mockResolvedValueOnce({ id: "proj-1" });
    db._stmt.all.mockResolvedValueOnce({ results: [{ ...GOAL_ROW }] });
    vi.mocked(computeProgress).mockResolvedValueOnce({
      progress: { percentage: 100, currentSeconds: 36000, remainingToTarget: 0 },
      newStatus: "COMPLETED",
    });

    const req = createGetRequest("/api/projects/proj-1/goals");
    const res = await GET(req as never, makeParams() as never);
    const json = await parseJson(res);

    expect(res.status).toBe(200);
    expect(json.data[0].status).toBe("COMPLETED");
    // UPDATE 쿼리가 호출되었는지 확인
    expect(db._stmt.run).toHaveBeenCalled();
  });

  it("목표가 여러 개여도 타이머 상태는 한 번만 읽어 모든 목표에 넘긴다", async () => {
    vi.mocked(computeProgress).mockClear();
    db._stmt.first.mockResolvedValueOnce({ id: "proj-1" });
    db._stmt.all.mockResolvedValueOnce({
      results: [{ ...GOAL_ROW }, { ...GOAL_ROW, id: "goal-2" }, { ...GOAL_ROW, id: "goal-3" }],
    });

    const req = createGetRequest("/api/projects/proj-1/goals");
    const res = await GET(req as never, makeParams() as never);

    expect(res.status).toBe(200);
    const timerQueries = db.prepare.mock.calls.filter((c) => String(c[0]).includes("FROM timers"));
    expect(timerQueries).toHaveLength(1);
    const snapshots = vi.mocked(computeProgress).mock.calls.map((c) => c[3]);
    expect(snapshots).toHaveLength(3);
    expect(snapshots[0]).toBeDefined();
    expect(new Set(snapshots).size).toBe(1);
  });

  it("lazy 전이 UPDATE는 ACTIVE일 때만 적용된다", async () => {
    db._stmt.first.mockResolvedValueOnce({ id: "proj-1" });
    db._stmt.all.mockResolvedValueOnce({ results: [{ ...GOAL_ROW }] });
    vi.mocked(computeProgress).mockResolvedValueOnce({
      progress: { percentage: 100, currentSeconds: 36000, remainingToTarget: 0 },
      newStatus: "COMPLETED",
    });

    await GET(createGetRequest("/api/projects/proj-1/goals") as never, makeParams() as never);

    const update = db.prepare.mock.calls.map((c) => String(c[0])).find((q) => q.startsWith("UPDATE goals"));
    expect(update).toContain("AND status = 'ACTIVE'");
  });

  it("진행 중인 목표를 우선해 최대 50개만 읽고 응답은 생성일 역순으로 정렬한다", async () => {
    db._stmt.first.mockResolvedValueOnce({ id: "proj-1" });
    db._stmt.all.mockResolvedValueOnce({
      results: [
        { ...GOAL_ROW, id: "active-old", created_at: "2026-01-01T00:00:00.000Z" },
        { ...GOAL_ROW, id: "done-new", status: "COMPLETED", created_at: "2026-02-01T00:00:00.000Z" },
      ],
    });

    const res = await GET(createGetRequest("/api/projects/proj-1/goals") as never, makeParams() as never);
    const json = await parseJson(res);

    const listSql = db.prepare.mock.calls.map((c) => String(c[0])).find((q) => q.includes("FROM goals"));
    expect(listSql).toContain("ORDER BY (status = 'ACTIVE') DESC, created_at DESC");
    expect(listSql).toContain("LIMIT 50");
    expect(json.data.map((g: { id: string }) => g.id)).toEqual(["done-new", "active-old"]);
  });
});

describe("POST /api/projects/[id]/goals", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
    vi.mocked(computeProgress).mockResolvedValue({
      progress: { percentage: 0, currentSeconds: 0, remainingToTarget: 36000 },
      newStatus: null,
    });
  });

  it("401 인증 없으면 에러", async () => {
    const req = createPostRequest(
      "/api/projects/proj-1/goals",
      { type: "DURATION", title: "목표", targetSeconds: 3600 },
    );
    const res = await POST(req as never, makeParams() as never);

    expect(res.status).toBe(401);
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("201 DURATION 목표 생성 성공", async () => {
    db._stmt.first.mockResolvedValueOnce(PROJECT_ROW);

    const req = createPostRequest(
      "/api/projects/proj-1/goals",
      { type: "DURATION", title: "10시간 달성", targetSeconds: 36000 },
      { "x-user-id": "user-1" },
    );
    const res = await POST(req as never, makeParams() as never);
    const json = await parseJson(res);

    expect(res.status).toBe(201);
    expect(json.data.type).toBe("DURATION");
    expect(json.data.title).toBe("10시간 달성");
    expect(json.data.targetSeconds).toBe(36000);
    expect(json.data.status).toBe("ACTIVE");
  });

  it("201 DEADLINE 목표 생성 성공", async () => {
    db._stmt.first.mockResolvedValueOnce(PROJECT_ROW);
    const futureDate = new Date(Date.now() + 86400000).toISOString();

    const req = createPostRequest(
      "/api/projects/proj-1/goals",
      { type: "DEADLINE", title: "데드라인 목표", targetDatetime: futureDate },
      { "x-user-id": "user-1" },
    );
    const res = await POST(req as never, makeParams() as never);
    const json = await parseJson(res);

    expect(res.status).toBe(201);
    expect(json.data.type).toBe("DEADLINE");
  });

  it("400 진행 중인 목표가 상한(20개)에 도달", async () => {
    db._stmt.first
      .mockResolvedValueOnce(PROJECT_ROW)
      .mockResolvedValueOnce({ cnt: 20 });
    db._stmt.all.mockResolvedValueOnce({
      results: Array.from({ length: 20 }, (_, i) => ({ ...GOAL_ROW, id: `goal-${i}` })),
    });

    const req = createPostRequest(
      "/api/projects/proj-1/goals",
      { type: "DURATION", title: "목표", targetSeconds: 3600 },
      { "x-user-id": "user-1" },
    );
    const res = await POST(req as never, makeParams() as never);

    expect(res.status).toBe(400);
    expect(db._stmt.run).not.toHaveBeenCalled();
  });

  it("상한에 걸려도 이미 달성한 목표를 먼저 전이하고 자리가 나면 생성한다", async () => {
    db._stmt.first
      .mockResolvedValueOnce(PROJECT_ROW)
      .mockResolvedValueOnce({ cnt: 20 });
    db._stmt.all.mockResolvedValueOnce({
      results: Array.from({ length: 20 }, (_, i) => ({ ...GOAL_ROW, id: `goal-${i}` })),
    });
    vi.mocked(computeProgress).mockResolvedValueOnce({
      progress: { percentage: 100, currentSeconds: 36000, remainingToTarget: 0 },
      newStatus: "COMPLETED",
    });

    const req = createPostRequest(
      "/api/projects/proj-1/goals",
      { type: "DURATION", title: "목표", targetSeconds: 3600 },
      { "x-user-id": "user-1" },
    );
    const res = await POST(req as never, makeParams() as never);

    expect(res.status).toBe(201);
    const sqls = db.prepare.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((q) => q.startsWith("UPDATE goals") && q.includes("AND status = 'ACTIVE'"))).toBe(true);
    expect(sqls.some((q) => q.includes("INSERT INTO goals"))).toBe(true);
  });

  it("404 프로젝트 없으면 에러", async () => {
    db._stmt.first.mockResolvedValueOnce(null);

    const req = createPostRequest(
      "/api/projects/proj-1/goals",
      { type: "DURATION", title: "목표", targetSeconds: 3600 },
      { "x-user-id": "user-1" },
    );
    const res = await POST(req as never, makeParams() as never);

    expect(res.status).toBe(404);
  });

  it("403 소유자가 아니면 에러", async () => {
    db._stmt.first.mockResolvedValueOnce(PROJECT_ROW);

    const req = createPostRequest(
      "/api/projects/proj-1/goals",
      { type: "DURATION", title: "목표", targetSeconds: 3600 },
      { "x-user-id": "other-user" },
    );
    const res = await POST(req as never, makeParams() as never);

    expect(res.status).toBe(403);
  });

  it("400 잘못된 JSON 본문", async () => {
    db._stmt.first.mockResolvedValueOnce(PROJECT_ROW);

    const req = createPostRequestRaw(
      "/api/projects/proj-1/goals",
      "not json",
      { "x-user-id": "user-1" },
    );
    const res = await POST(req as never, makeParams() as never);

    expect(res.status).toBe(400);
  });

  it("400 빈 제목", async () => {
    db._stmt.first.mockResolvedValueOnce(PROJECT_ROW);

    const req = createPostRequest(
      "/api/projects/proj-1/goals",
      { type: "DURATION", title: "", targetSeconds: 3600 },
      { "x-user-id": "user-1" },
    );
    const res = await POST(req as never, makeParams() as never);

    expect(res.status).toBe(400);
  });

  it("400 제목 100자 초과", async () => {
    db._stmt.first.mockResolvedValueOnce(PROJECT_ROW);

    const req = createPostRequest(
      "/api/projects/proj-1/goals",
      { type: "DURATION", title: "a".repeat(101), targetSeconds: 3600 },
      { "x-user-id": "user-1" },
    );
    const res = await POST(req as never, makeParams() as never);

    expect(res.status).toBe(400);
  });

  it("400 유효하지 않은 목표 타입", async () => {
    db._stmt.first.mockResolvedValueOnce(PROJECT_ROW);

    const req = createPostRequest(
      "/api/projects/proj-1/goals",
      { type: "INVALID", title: "목표", targetSeconds: 3600 },
      { "x-user-id": "user-1" },
    );
    const res = await POST(req as never, makeParams() as never);

    expect(res.status).toBe(400);
  });

  it("400 DURATION에 targetSeconds 범위 초과", async () => {
    db._stmt.first.mockResolvedValueOnce(PROJECT_ROW);

    const req = createPostRequest(
      "/api/projects/proj-1/goals",
      { type: "DURATION", title: "목표", targetSeconds: 9_000_000 },
      { "x-user-id": "user-1" },
    );
    const res = await POST(req as never, makeParams() as never);

    expect(res.status).toBe(400);
  });

  it("400 DEADLINE에 과거 날짜", async () => {
    db._stmt.first.mockResolvedValueOnce(PROJECT_ROW);

    const req = createPostRequest(
      "/api/projects/proj-1/goals",
      { type: "DEADLINE", title: "목표", targetDatetime: "2020-01-01T00:00:00Z" },
      { "x-user-id": "user-1" },
    );
    const res = await POST(req as never, makeParams() as never);

    expect(res.status).toBe(400);
  });
});
