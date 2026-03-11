import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDB, createPostRequest, createGetRequest, parseJson } from "../helpers";

vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

import { getDB } from "@/lib/db";
import { POST as createTimer } from "@/app/api/projects/[id]/timers/route";
import { GET as getTimer } from "@/app/api/timers/[id]/route";
import { POST as modifyTimer } from "@/app/api/timers/[id]/modify/route";
import { GET as getLogs } from "@/app/api/timers/[id]/logs/route";
import { GET as getGraph } from "@/app/api/timers/[id]/graph/route";

const AUTH_HEADERS = {
  "x-user-id": "user-1",
  "x-user-nickname": encodeURIComponent("테스터"),
};

describe("타이머 전체 생명주기", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
  });

  it("1. 타이머 생성 → CREATE 로그", async () => {
    db._stmt.first
      .mockResolvedValueOnce({ owner_user_id: "user-1", status: "ACTIVE" }) // project owner
      .mockResolvedValueOnce({ cnt: 0 }); // no existing timer

    const req = createPostRequest("/api/projects/proj-1/timers", {
      title: "라이프사이클 타이머",
      initialSeconds: 3600,
    }, AUTH_HEADERS);

    const res = await createTimer(req as never, { params: Promise.resolve({ id: "proj-1" }) } as never);
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.data.title).toBe("라이프사이클 타이머");
    expect(body.data.remainingSeconds).toBe(3600);
    expect(body.data.status).toBe("RUNNING");
    expect(db.batch).toHaveBeenCalledTimes(1);
  });

  it("2. 타이머 조회 → remaining 계산", async () => {
    const now = new Date().toISOString();
    db._stmt.first.mockResolvedValue({
      id: "timer-1",
      project_id: "proj-1",
      title: "테스트",
      description: null,
      base_remaining_seconds: 3600,
      last_calculated_at: now,
      status: "RUNNING",
      scheduled_start_at: null,
      created_by: "user-1",
      created_at: now,
      updated_at: now,
      creator_id: "user-1",
      creator_nickname: "테스터",
      owner_user_id: "user-1",
    });

    const req = createGetRequest("/api/timers/timer-1");
    const res = await getTimer(req as never, { params: Promise.resolve({ id: "timer-1" }) } as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.remainingSeconds).toBeGreaterThanOrEqual(3599);
    expect(body.data.remainingSeconds).toBeLessThanOrEqual(3600);
  });

  it("3. ADD → 시간 증가 + ADD 로그", async () => {
    // modify route에서 timer 조회
    db._stmt.first.mockResolvedValue({
      id: "timer-1",
      project_id: "proj-1",
      title: "테스트",
      description: null,
      base_remaining_seconds: 3600,
      last_calculated_at: new Date().toISOString(),
      status: "RUNNING",
      scheduled_start_at: null,
      created_by: "user-1",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
      owner_user_id: "user-1",
    });

    const req = createPostRequest("/api/timers/timer-1/modify", {
      action: "ADD",
      deltaSeconds: 600,
      actorName: "시청자1",
    }, AUTH_HEADERS);
    const res = await modifyTimer(req as never, { params: Promise.resolve({ id: "timer-1" }) } as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.remainingSeconds).toBeGreaterThanOrEqual(4199);
    expect(body.data.log.actionType).toBe("ADD");
    expect(body.data.log.deltaSeconds).toBe(600);
  });

  it("4. SUBTRACT → 시간 감소", async () => {
    db._stmt.first.mockResolvedValue({
      id: "timer-1",
      project_id: "proj-1",
      title: "테스트",
      description: null,
      base_remaining_seconds: 4200,
      last_calculated_at: new Date().toISOString(),
      status: "RUNNING",
      scheduled_start_at: null,
      created_by: "user-1",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
      owner_user_id: "user-1",
    });

    const req = createPostRequest("/api/timers/timer-1/modify", {
      action: "SUBTRACT",
      deltaSeconds: 200,
      actorName: "시청자2",
    }, AUTH_HEADERS);
    const res = await modifyTimer(req as never, { params: Promise.resolve({ id: "timer-1" }) } as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.remainingSeconds).toBeGreaterThanOrEqual(3999);
    expect(body.data.log.actionType).toBe("SUBTRACT");
  });

  it("5. 로그 목록 조회", async () => {
    db._stmt.first
      .mockResolvedValueOnce({ id: "timer-1" }) // timer 존재 확인
      .mockResolvedValueOnce({ cnt: 3 }); // 총 개수
    db._stmt.all.mockResolvedValue({
      results: [
        { id: "log-3", action_type: "SUBTRACT", actor_name: "시청자2", actor_user_id: null, delta_seconds: 200, before_seconds: 4200, after_seconds: 4000, created_at: "2025-01-01T00:03:00Z" },
        { id: "log-2", action_type: "ADD", actor_name: "시청자1", actor_user_id: null, delta_seconds: 600, before_seconds: 3600, after_seconds: 4200, created_at: "2025-01-01T00:02:00Z" },
        { id: "log-1", action_type: "CREATE", actor_name: "테스터", actor_user_id: "user-1", delta_seconds: 3600, before_seconds: 0, after_seconds: 3600, created_at: "2025-01-01T00:01:00Z" },
      ],
    });

    const req = createGetRequest("/api/timers/timer-1/logs");
    const res = await getLogs(req as never, { params: Promise.resolve({ id: "timer-1" }) } as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.logs).toHaveLength(3);
    expect(body.data.logs[0].actionType).toBe("SUBTRACT");
    expect(body.data.logs[2].actionType).toBe("CREATE");
    expect(body.data.pagination.total).toBe(3);
  });

  it("6. 그래프 데이터 조회 (remaining 모드)", async () => {
    db._stmt.first.mockResolvedValue({ id: "timer-1" });
    db._stmt.all.mockResolvedValue({
      results: [
        { action_type: "CREATE", before_seconds: 0, after_seconds: 3600, created_at: "2025-01-01T00:01:00Z" },
        { action_type: "ADD", before_seconds: 3600, after_seconds: 4200, created_at: "2025-01-01T00:02:00Z" },
      ],
    });

    const req = createGetRequest("/api/timers/timer-1/graph?mode=remaining");
    const res = await getGraph(req as never, { params: Promise.resolve({ id: "timer-1" }) } as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.mode).toBe("remaining");
    expect(body.data.points).toHaveLength(2);
  });

  it("7. SUBTRACT로 만료 → EXPIRED + EXPIRE 로그", async () => {
    db._stmt.first.mockResolvedValue({
      id: "timer-1",
      project_id: "proj-1",
      title: "테스트",
      description: null,
      base_remaining_seconds: 100,
      last_calculated_at: new Date().toISOString(),
      status: "RUNNING",
      scheduled_start_at: null,
      created_by: "user-1",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
      owner_user_id: "user-1",
    });

    const req = createPostRequest("/api/timers/timer-1/modify", {
      action: "SUBTRACT",
      deltaSeconds: 99999,
      actorName: "시청자",
    }, AUTH_HEADERS);
    const res = await modifyTimer(req as never, { params: Promise.resolve({ id: "timer-1" }) } as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.status).toBe("EXPIRED");
    expect(body.data.remainingSeconds).toBe(0);
  });

  it("8. ADD로 재오픈 → RUNNING + REOPEN + ADD 로그", async () => {
    db._stmt.first.mockResolvedValue({
      id: "timer-1",
      project_id: "proj-1",
      title: "테스트",
      description: null,
      base_remaining_seconds: 0,
      last_calculated_at: new Date().toISOString(),
      status: "EXPIRED",
      scheduled_start_at: null,
      created_by: "user-1",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
      owner_user_id: "user-1",
    });

    const req = createPostRequest("/api/timers/timer-1/modify", {
      action: "ADD",
      deltaSeconds: 1800,
      actorName: "시청자",
    }, AUTH_HEADERS);
    const res = await modifyTimer(req as never, { params: Promise.resolve({ id: "timer-1" }) } as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.status).toBe("RUNNING");
    expect(body.data.remainingSeconds).toBe(1800);
  });
});
