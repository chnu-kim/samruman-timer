import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDB, createPostRequest, parseJson } from "../helpers";

vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

import { getDB } from "@/lib/db";
import { POST } from "@/app/api/timers/[id]/logs/[logId]/revert/route";

// 상태 전이·집계 제외는 실제 SQLite로 검증한다(integration/timer-revert.test.ts). 여기서는 입구의 거절 경로만 본다
const LOG_ID = "c".repeat(32);
const TIMER_ROW = {
  id: "timer-1",
  project_id: "proj-1",
  title: "타이머",
  description: null,
  base_remaining_seconds: 3600,
  last_calculated_at: new Date().toISOString(),
  status: "RUNNING",
  scheduled_start_at: null,
  created_by: "user-1",
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
  owner_user_id: "user-1",
};

function call(logId = LOG_ID, headers: Record<string, string> = { "x-user-id": "user-1" }) {
  const req = createPostRequest(`/api/timers/timer-1/logs/${logId}/revert`, {}, headers);
  return POST(req as never, { params: Promise.resolve({ id: "timer-1", logId }) } as never);
}

describe("POST /api/timers/[id]/logs/[logId]/revert", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
  });

  it("인증 없이 → 401", async () => {
    expect((await call(LOG_ID, {})).status).toBe(401);
  });

  it("32자 hex가 아닌 기록 ID → 400, DB를 읽지 않는다", async () => {
    const res = await call("bad-id");
    expect(res.status).toBe(400);
    expect((await parseJson(res)).error.code).toBe("BAD_REQUEST");
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("타이머 없음·삭제됨 → 404", async () => {
    db._stmt.first.mockResolvedValueOnce(null);
    expect((await call()).status).toBe(404);
    db._stmt.first.mockResolvedValueOnce({ ...TIMER_ROW, status: "DELETED" });
    expect((await call()).status).toBe(404);
  });

  it("소유자 아님 → 403, 쓰지 않는다", async () => {
    db._stmt.first.mockResolvedValueOnce(TIMER_ROW);
    expect((await call(LOG_ID, { "x-user-id": "other" })).status).toBe(403);
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("이 타이머의 기록이 아님 → 404", async () => {
    db._stmt.first.mockResolvedValueOnce(TIMER_ROW).mockResolvedValueOnce(null);
    const res = await call();
    expect(res.status).toBe(404);
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("이미 되돌린 기록 → 409 CONFLICT", async () => {
    db._stmt.first.mockResolvedValueOnce(TIMER_ROW).mockResolvedValueOnce({
      id: LOG_ID, action_type: "ADD", actor_name: "닉", actor_user_id: "user-1",
      delta_seconds: 600, before_seconds: 3000, after_seconds: 3600,
      created_at: "2025-01-01T00:00:00Z", reverted_at: "2025-01-01T00:00:05Z",
    });
    const res = await call();
    expect(res.status).toBe(409);
    expect((await parseJson(res)).error.code).toBe("CONFLICT");
    expect(db.batch).not.toHaveBeenCalled();
  });
});
