import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDB, createGetRequest, parseJson } from "../helpers";

vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

import { getDB } from "@/lib/db";
import { GET } from "@/app/api/timers/[id]/logs/route";

function callGet(query = "") {
  const req = createGetRequest(`/api/timers/timer-1/logs${query}`);
  const params = Promise.resolve({ id: "timer-1" });
  return GET(req as never, { params } as never);
}

describe("GET /api/timers/[id]/logs", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
  });

  it("타이머 없음 → 404", async () => {
    db._stmt.first.mockResolvedValue(null);
    const res = await callGet();
    expect(res.status).toBe(404);
  });

  it("유효하지 않은 actionType → 400", async () => {
    // first: 타이머 존재 확인
    db._stmt.first
      .mockResolvedValueOnce({ id: "timer-1" }) // timer exists
    const res = await callGet("?actionType=INVALID");
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("유효한 actionType 필터 → 200", async () => {
    db._stmt.first
      .mockResolvedValueOnce({ id: "timer-1" }) // timer exists
      .mockResolvedValueOnce({ cnt: 0 }); // count
    db._stmt.all.mockResolvedValue({ results: [] });

    const res = await callGet("?actionType=ADD,SUBTRACT");
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.data.logs).toEqual([]);
    expect(body.data.pagination).toBeDefined();
  });

  it("기본 페이지네이션 값 (page=1, limit=20)", async () => {
    db._stmt.first
      .mockResolvedValueOnce({ id: "timer-1" })
      .mockResolvedValueOnce({ cnt: 50 });
    db._stmt.all.mockResolvedValue({ results: [] });

    const res = await callGet();
    const body = await parseJson(res);

    expect(body.data.pagination.page).toBe(1);
    expect(body.data.pagination.limit).toBe(20);
    expect(body.data.pagination.total).toBe(50);
    expect(body.data.pagination.totalPages).toBe(3);
  });

  it("limit 상한 250 초과 시 250으로 제한", async () => {
    db._stmt.first
      .mockResolvedValueOnce({ id: "timer-1" })
      .mockResolvedValueOnce({ cnt: 0 });
    db._stmt.all.mockResolvedValue({ results: [] });

    const res = await callGet("?limit=999");
    const body = await parseJson(res);
    expect(body.data.pagination.limit).toBe(250);
  });

  it("로그 데이터가 camelCase로 변환된다", async () => {
    db._stmt.first
      .mockResolvedValueOnce({ id: "timer-1" })
      .mockResolvedValueOnce({ cnt: 1 });
    db._stmt.all.mockResolvedValue({
      results: [{
        id: "log-1",
        action_type: "ADD",
        actor_name: "테스터",
        actor_user_id: "user-1",
        delta_seconds: 600,
        before_seconds: 0,
        after_seconds: 600,
        created_at: "2025-01-01T00:00:00Z",
      }],
    });

    const res = await callGet();
    const body = await parseJson(res);
    const log = body.data.logs[0];
    expect(log.actionType).toBe("ADD");
    expect(log.actorName).toBe("테스터");
    expect(log.deltaSeconds).toBe(600);
    expect(log.beforeSeconds).toBe(0);
    expect(log.afterSeconds).toBe(600);
  });
});
