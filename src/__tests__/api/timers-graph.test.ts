import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDB, createGetRequest, parseJson } from "../helpers";

vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

import { getDB } from "@/lib/db";
import { GET } from "@/app/api/timers/[id]/graph/route";

function callGet(query = "") {
  const req = createGetRequest(`/api/timers/timer-1/graph${query}`);
  const params = Promise.resolve({ id: "timer-1" });
  return GET(req as never, { params } as never);
}

describe("GET /api/timers/[id]/graph", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
  });

  it("mode 미지정 → 400 BAD_REQUEST", async () => {
    const res = await callGet();
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("유효하지 않은 mode → 400 BAD_REQUEST", async () => {
    const res = await callGet("?mode=invalid");
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("타이머 없음 → 404 NOT_FOUND", async () => {
    db._stmt.first.mockResolvedValue(null);
    const res = await callGet("?mode=remaining");
    expect(res.status).toBe(404);
    const body = await parseJson(res);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  describe("mode=remaining", () => {
    it("포인트 데이터를 반환한다", async () => {
      db._stmt.first.mockResolvedValueOnce({ id: "timer-1" });
      db._stmt.all.mockResolvedValue({
        results: [
          { created_at: "2025-01-01T00:00:00Z", after_seconds: 86400 },
          { created_at: "2025-01-01T01:00:00Z", after_seconds: 82800 },
        ],
      });

      const res = await callGet("?mode=remaining");
      expect(res.status).toBe(200);
      const body = await parseJson(res);
      expect(body.data.mode).toBe("remaining");
      expect(body.data.points).toHaveLength(2);
      expect(body.data.points[0]).toEqual({
        timestamp: "2025-01-01T00:00:00Z",
        remainingSeconds: 86400,
      });
    });

    it("로그 없으면 빈 배열 반환", async () => {
      db._stmt.first.mockResolvedValueOnce({ id: "timer-1" });
      db._stmt.all.mockResolvedValue({ results: [] });

      const res = await callGet("?mode=remaining");
      const body = await parseJson(res);
      expect(body.data.points).toEqual([]);
    });
  });

  describe("mode=cumulative", () => {
    it("누적 추가/차감량을 계산한다", async () => {
      db._stmt.first.mockResolvedValueOnce({ id: "timer-1" });
      db._stmt.all.mockResolvedValue({
        results: [
          { created_at: "2025-01-01T00:00:00Z", action_type: "ADD", delta_seconds: 3600 },
          { created_at: "2025-01-01T01:00:00Z", action_type: "SUBTRACT", delta_seconds: 1800 },
          { created_at: "2025-01-01T02:00:00Z", action_type: "ADD", delta_seconds: 7200 },
        ],
      });

      const res = await callGet("?mode=cumulative");
      expect(res.status).toBe(200);
      const body = await parseJson(res);
      expect(body.data.mode).toBe("cumulative");
      expect(body.data.points).toHaveLength(3);
      // 첫 번째: ADD 3600
      expect(body.data.points[0]).toEqual({
        timestamp: "2025-01-01T00:00:00Z",
        totalAdded: 3600,
        totalSubtracted: 0,
      });
      // 두 번째: SUBTRACT 1800
      expect(body.data.points[1]).toEqual({
        timestamp: "2025-01-01T01:00:00Z",
        totalAdded: 3600,
        totalSubtracted: 1800,
      });
      // 세 번째: ADD 7200 → 누적 10800
      expect(body.data.points[2]).toEqual({
        timestamp: "2025-01-01T02:00:00Z",
        totalAdded: 10800,
        totalSubtracted: 1800,
      });
    });
  });

  describe("mode=frequency", () => {
    it("시간대별 이벤트 빈도를 반환한다", async () => {
      db._stmt.first.mockResolvedValueOnce({ id: "timer-1" });
      db._stmt.all.mockResolvedValue({
        results: [
          { hour: "2025-01-01T00:00:00Z", count: 5, adds: 3, subtracts: 2 },
          { hour: "2025-01-01T01:00:00Z", count: 2, adds: 1, subtracts: 1 },
        ],
      });

      const res = await callGet("?mode=frequency");
      expect(res.status).toBe(200);
      const body = await parseJson(res);
      expect(body.data.mode).toBe("frequency");
      expect(body.data.buckets).toHaveLength(2);
      expect(body.data.buckets[0]).toEqual({
        hour: "2025-01-01T00:00:00Z",
        count: 5,
        adds: 3,
        subtracts: 2,
      });
    });
  });
});
