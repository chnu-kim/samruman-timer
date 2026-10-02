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

  it("삭제된 타이머는 존재 확인에서 제외해 404로 처리한다", async () => {
    db._stmt.first.mockResolvedValue(null);
    const res = await callGet("?mode=remaining");
    expect(res.status).toBe(404);
    const sql = String(db.prepare.mock.calls[0][0]);
    expect(sql).toContain("status != 'DELETED'");
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
    it("SQL이 계산한 누적 추가/차감량을 포인트로 반환한다", async () => {
      db._stmt.first.mockResolvedValueOnce({ id: "timer-1" });
      db._stmt.all.mockResolvedValue({
        results: [
          { created_at: "2025-01-01T00:00:00Z", total_added: 3600, total_subtracted: 0 },
          { created_at: "2025-01-01T01:00:00Z", total_added: 3600, total_subtracted: 1800 },
          { created_at: "2025-01-01T02:00:00Z", total_added: 10800, total_subtracted: 1800 },
        ],
      });

      const res = await callGet("?mode=cumulative");
      expect(res.status).toBe(200);
      const body = await parseJson(res);
      expect(body.data.mode).toBe("cumulative");
      expect(body.data.points).toEqual([
        { timestamp: "2025-01-01T00:00:00Z", totalAdded: 3600, totalSubtracted: 0 },
        { timestamp: "2025-01-01T01:00:00Z", totalAdded: 3600, totalSubtracted: 1800 },
        { timestamp: "2025-01-01T02:00:00Z", totalAdded: 10800, totalSubtracted: 1800 },
      ]);
    });
  });

  describe("포인트 수 상한", () => {
    it.each(["remaining", "cumulative"])("mode=%s는 1000개 안팎으로 균등 추출하고 마지막 점을 포함한다", async (mode) => {
      db._stmt.first.mockResolvedValueOnce({ id: "timer-1" });
      db._stmt.all.mockResolvedValue({ results: [] });

      await callGet(`?mode=${mode}`);

      const sql = String(db.prepare.mock.calls.at(-1)?.[0]);
      expect(sql).toContain("(rn - 1) % ((total + 1000 - 1) / 1000) = 0 OR rn = total");
    });

    it("mode=frequency는 최근 1000개 시간 구간만 반환한다", async () => {
      db._stmt.first.mockResolvedValueOnce({ id: "timer-1" });
      db._stmt.all.mockResolvedValue({ results: [] });

      await callGet("?mode=frequency");

      const sql = String(db.prepare.mock.calls.at(-1)?.[0]);
      expect(sql).toMatch(/ORDER BY hour DESC\s+LIMIT 1000/);
      expect(sql).toMatch(/\)\s+ORDER BY hour ASC/);
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
