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
