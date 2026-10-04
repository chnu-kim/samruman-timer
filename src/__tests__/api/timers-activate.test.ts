import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockDB, createPostRequest, parseJson } from "../helpers";

vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

import { getDB } from "@/lib/db";
import { POST } from "@/app/api/timers/[id]/activate/route";

const TIMER_ID = "a".repeat(32);
const NOW = new Date("2026-10-04T10:00:00.000Z");
const FUTURE = "2026-10-04T12:00:00.000Z";

const SCHEDULED_ROW = {
  id: TIMER_ID,
  project_id: "b".repeat(32),
  title: "예약 타이머",
  description: null,
  base_remaining_seconds: 3600,
  last_calculated_at: "2026-10-04T09:00:00.000Z",
  status: "SCHEDULED",
  scheduled_start_at: FUTURE,
  created_by: "user-1",
  created_at: "2026-10-04T09:00:00.000Z",
  updated_at: "2026-10-04T09:00:00.000Z",
  owner_user_id: "user-1",
};

function callPost(id = TIMER_ID, headers: Record<string, string> = { "x-user-id": "user-1", "x-user-nickname": encodeURIComponent("방송인") }) {
  const req = createPostRequest(`/api/timers/${id}/activate`, undefined, headers);
  return POST(req as never, { params: Promise.resolve({ id }) } as never);
}

/** batch에 넘긴 문장들의 SQL·바인드 값 */
function batchCalls(db: ReturnType<typeof createMockDB>) {
  const sqls = db.prepare.mock.calls.map((c) => c[0] as string);
  const binds = db._stmt.bind.mock.calls;
  const updateIdx = sqls.findIndex((s) => s.includes("UPDATE timers"));
  return { sqls, binds, updateIdx };
}

describe("POST /api/timers/[id]/activate", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    db = createMockDB();
    db._stmt.first.mockResolvedValue(SCHEDULED_ROW);
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("인증 없이 → 401", async () => {
    const res = await callPost(TIMER_ID, {});
    expect(res.status).toBe(401);
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("32자 hex가 아닌 ID → 400", async () => {
    const res = await callPost("timer-1");
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("타이머 없음 → 404", async () => {
    db._stmt.first.mockResolvedValue(null);
    const res = await callPost();
    expect(res.status).toBe(404);
  });

  it("삭제된 타이머 → 404", async () => {
    db._stmt.first.mockResolvedValue({ ...SCHEDULED_ROW, status: "DELETED" });
    const res = await callPost();
    expect(res.status).toBe(404);
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("소유자 아님 → 403", async () => {
    const res = await callPost(TIMER_ID, { "x-user-id": "other-user" });
    expect(res.status).toBe(403);
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("이미 RUNNING → 409, 쓰기 없음", async () => {
    db._stmt.first.mockResolvedValue({ ...SCHEDULED_ROW, status: "RUNNING", scheduled_start_at: null });
    const res = await callPost();
    expect(res.status).toBe(409);
    const body = await parseJson(res);
    expect(body.error.code).toBe("CONFLICT");
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("예약 시각 → RUNNING, 지금 기준 시작 + 소유자 이름의 ACTIVATE 로그", async () => {
    const res = await callPost();
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.data).toMatchObject({
      id: TIMER_ID,
      status: "RUNNING",
      remainingSeconds: 3600,
      log: {
        actionType: "ACTIVATE",
        actorName: "방송인",
        actorUserId: "user-1",
        deltaSeconds: 0,
        beforeSeconds: 3600,
        afterSeconds: 3600,
        createdAt: NOW.toISOString(),
      },
    });
    expect(body.data.log.id).toMatch(/^[0-9a-f]{32}$/);

    expect(db.batch).toHaveBeenCalledTimes(1);
    const { sqls, binds, updateIdx } = batchCalls(db);
    // 상태 UPDATE는 STATE_GUARD로 읽은 상태를 확인하고, 시작 시각도 지금으로 맞춘다
    expect(sqls[updateIdx]).toContain("status = 'RUNNING'");
    expect(sqls[updateIdx]).toContain("scheduled_start_at = ?");
    expect(sqls[updateIdx]).toContain("AND status = ? AND base_remaining_seconds = ? AND last_calculated_at = ?");
    const nowStr = NOW.toISOString();
    expect(binds[updateIdx]).toEqual([nowStr, nowStr, nowStr, TIMER_ID, "SCHEDULED", 3600, SCHEDULED_ROW.last_calculated_at]);
    // 로그 INSERT는 UPDATE가 적용됐을 때만
    expect(sqls[updateIdx + 1]).toContain("WHERE changes() = 1");
    expect(binds[updateIdx + 1].slice(1)).toEqual([TIMER_ID, "ACTIVATE", "방송인", "user-1", 0, 3600, 3600, nowStr]);
  });

  it("예약 시각이 이미 지났으면 자동 활성화(시각 기준)가 이기고 → 409", async () => {
    db._stmt.first.mockResolvedValue({ ...SCHEDULED_ROW, scheduled_start_at: "2026-10-04T09:59:59.000Z" });
    const res = await callPost();
    expect(res.status).toBe(409);
    // 자동 활성화 한 번만 쓰고, 지금 시각 기준의 수동 활성화는 쓰지 않는다
    expect(db.batch).toHaveBeenCalledTimes(1);
    const { binds } = batchCalls(db);
    const logBind = binds.find((b) => b[2] === "ACTIVATE");
    expect(logBind?.[3]).toBe("system");
  });

  it("다른 요청이 먼저 시작했으면(CAS 실패) → 409", async () => {
    db.batch.mockResolvedValueOnce([{ meta: { changes: 0 } }]);
    db._stmt.first
      .mockResolvedValueOnce(SCHEDULED_ROW)
      .mockResolvedValueOnce({ status: "RUNNING", base_remaining_seconds: 3600, last_calculated_at: NOW.toISOString(), updated_at: NOW.toISOString() });
    const res = await callPost();
    expect(res.status).toBe(409);
  });

  it("그 사이 삭제됐으면(CAS 실패 후 행 없음) → 404", async () => {
    db.batch.mockResolvedValueOnce([{ meta: { changes: 0 } }]);
    db._stmt.first.mockResolvedValueOnce(SCHEDULED_ROW).mockResolvedValueOnce(null);
    const res = await callPost();
    expect(res.status).toBe(404);
  });
});
