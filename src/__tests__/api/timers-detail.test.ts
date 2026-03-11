import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDB, createGetRequest, createPatchRequest, parseJson } from "../helpers";

vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

import { getDB } from "@/lib/db";
import { GET, PATCH } from "@/app/api/timers/[id]/route";

const TIMER_ROW = {
  id: "timer-1",
  project_id: "proj-1",
  title: "테스트 타이머",
  description: null,
  base_remaining_seconds: 3600,
  last_calculated_at: new Date().toISOString(),
  status: "RUNNING",
  scheduled_start_at: null,
  created_by: "user-1",
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
  creator_id: "user-1",
  creator_nickname: "유저1",
  owner_user_id: "user-1",
};

function makeParams(id = "timer-1") {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/timers/[id]", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
  });

  it("200 타이머 상세 반환", async () => {
    db._stmt.first.mockResolvedValue(TIMER_ROW);
    const req = createGetRequest("/api/timers/timer-1");
    const res = await GET(req as never, makeParams() as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.id).toBe("timer-1");
    expect(body.data.title).toBe("테스트 타이머");
    expect(body.data.status).toBe("RUNNING");
    expect(body.data.remainingSeconds).toBeGreaterThanOrEqual(3590);
    expect(body.data.createdBy.nickname).toBe("유저1");
    expect(body.data.projectOwnerId).toBe("user-1");
  });

  it("미존재 → 404", async () => {
    db._stmt.first.mockResolvedValue(null);
    const req = createGetRequest("/api/timers/nonexistent");
    const res = await GET(req as never, makeParams("nonexistent") as never);
    expect(res.status).toBe(404);
  });

  it("DELETED → 404", async () => {
    db._stmt.first.mockResolvedValue({ ...TIMER_ROW, status: "DELETED" });
    const req = createGetRequest("/api/timers/timer-1");
    const res = await GET(req as never, makeParams() as never);
    expect(res.status).toBe(404);
  });

  it("SCHEDULED + 시작 시각 경과 → RUNNING 전환", async () => {
    db._stmt.first.mockResolvedValue({
      ...TIMER_ROW,
      status: "SCHEDULED",
      scheduled_start_at: new Date(Date.now() - 10_000).toISOString(),
    });
    const req = createGetRequest("/api/timers/timer-1");
    const res = await GET(req as never, makeParams() as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.status).toBe("RUNNING");
    expect(db.batch).toHaveBeenCalled();
  });

  it("RUNNING + 잔여 시간 0 → EXPIRED 전환", async () => {
    db._stmt.first.mockResolvedValue({
      ...TIMER_ROW,
      base_remaining_seconds: 5,
      last_calculated_at: new Date(Date.now() - 20_000).toISOString(),
    });
    const req = createGetRequest("/api/timers/timer-1");
    const res = await GET(req as never, makeParams() as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.status).toBe("EXPIRED");
    expect(body.data.remainingSeconds).toBe(0);
  });
});

describe("PATCH /api/timers/[id]", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
  });

  it("인증 없이 → 401", async () => {
    const req = createPatchRequest("/api/timers/timer-1", { title: "새제목" });
    const res = await PATCH(req as never, makeParams() as never);
    expect(res.status).toBe(401);
  });

  it("소유자 아님 → 403", async () => {
    db._stmt.first.mockResolvedValue({ id: "timer-1", status: "RUNNING", owner_user_id: "other-user" });
    const req = createPatchRequest("/api/timers/timer-1", { title: "새제목" }, {
      "x-user-id": "user-1",
    });
    const res = await PATCH(req as never, makeParams() as never);
    expect(res.status).toBe(403);
  });

  it("미존재 → 404", async () => {
    db._stmt.first.mockResolvedValue(null);
    const req = createPatchRequest("/api/timers/timer-1", { title: "새제목" }, {
      "x-user-id": "user-1",
    });
    const res = await PATCH(req as never, makeParams() as never);
    expect(res.status).toBe(404);
  });

  it("title 빈 문자열 → 400", async () => {
    db._stmt.first.mockResolvedValue({ id: "timer-1", status: "RUNNING", owner_user_id: "user-1" });
    const req = createPatchRequest("/api/timers/timer-1", { title: "" }, {
      "x-user-id": "user-1",
    });
    const res = await PATCH(req as never, makeParams() as never);
    expect(res.status).toBe(400);
  });

  it("변경할 필드 없음 → 400", async () => {
    db._stmt.first.mockResolvedValue({ id: "timer-1", status: "RUNNING", owner_user_id: "user-1" });
    const req = createPatchRequest("/api/timers/timer-1", {}, {
      "x-user-id": "user-1",
    });
    const res = await PATCH(req as never, makeParams() as never);
    expect(res.status).toBe(400);
  });

  it("200 수정 성공", async () => {
    db._stmt.first
      .mockResolvedValueOnce({ id: "timer-1", status: "RUNNING", owner_user_id: "user-1" })
      .mockResolvedValueOnce({
        id: "timer-1",
        project_id: "proj-1",
        title: "새제목",
        description: null,
        base_remaining_seconds: 3600,
        last_calculated_at: new Date().toISOString(),
        status: "RUNNING",
        scheduled_start_at: null,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-06-01T00:00:00Z",
        creator_id: "user-1",
        creator_nickname: "유저1",
        owner_user_id: "user-1",
      });
    const req = createPatchRequest("/api/timers/timer-1", { title: "새제목" }, {
      "x-user-id": "user-1",
    });
    const res = await PATCH(req as never, makeParams() as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.title).toBe("새제목");
    expect(body.data.createdBy.nickname).toBe("유저1");
  });
});
