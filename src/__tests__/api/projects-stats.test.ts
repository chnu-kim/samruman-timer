import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDB, createGetRequest, parseJson } from "../helpers";

vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

import { getDB } from "@/lib/db";
import { GET } from "@/app/api/projects/[id]/stats/route";

describe("GET /api/projects/[id]/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const callGET = (projectId: string, query = "", userId = "owner1") =>
    GET(
      createGetRequest(
        `/api/projects/${projectId}/stats${query ? `?${query}` : ""}`,
        { "x-user-id": userId }
      ),
      { params: Promise.resolve({ id: projectId }) }
    );

  it("프로젝트 미존재 시 404", async () => {
    const db = createMockDB();
    db._stmt.first.mockResolvedValueOnce(null);
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);

    const res = await callGET("nonexistent");
    expect(res.status).toBe(404);
    const json = await parseJson(res);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("소유자가 아닌 경우 403", async () => {
    const db = createMockDB();
    db._stmt.first.mockResolvedValueOnce({ id: "proj1", owner_user_id: "owner1" });
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);

    const res = await callGET("proj1", "", "other-user");
    expect(res.status).toBe(403);
    const json = await parseJson(res);
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("프로젝트 존재 + 로그 없음 → 200 + 0 값", async () => {
    const db = createMockDB();
    db._stmt.first
      .mockResolvedValueOnce({ id: "proj1", owner_user_id: "owner1" })
      .mockResolvedValueOnce({
        total_added: 0,
        total_subtracted: 0,
        total_events: 0,
        unique_donors: 0,
      });
    db._stmt.all
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ results: [] });
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);

    const res = await callGET("proj1");
    expect(res.status).toBe(200);
    const json = await parseJson(res);

    expect(json.data.summary.totalAddedSeconds).toBe(0);
    expect(json.data.summary.totalSubtractedSeconds).toBe(0);
    expect(json.data.summary.netAddedSeconds).toBe(0);
    expect(json.data.summary.totalEvents).toBe(0);
    expect(json.data.summary.uniqueDonors).toBe(0);
    expect(json.data.summary.peakHour).toBeNull();
    expect(json.data.topDonors).toEqual([]);
    expect(json.data.hourlyDistribution).toEqual([]);
    expect(json.data.dailyActivity).toEqual([]);
  });

  it("프로젝트 존재 + 로그 있음 → 200 + 정상 데이터", async () => {
    const db = createMockDB();
    db._stmt.first
      .mockResolvedValueOnce({ id: "proj1", owner_user_id: "owner1" })
      .mockResolvedValueOnce({
        total_added: 7200,
        total_subtracted: 1800,
        total_events: 15,
        unique_donors: 5,
      });
    db._stmt.all
      .mockResolvedValueOnce({
        results: [
          { actor_name: "user1", total_seconds: 3600, event_count: 3 },
          { actor_name: "user2", total_seconds: 1800, event_count: 2 },
        ],
      })
      .mockResolvedValueOnce({
        results: [
          { hour_of_day: 14, event_count: 8, adds: 5, subtracts: 3, added_seconds: 3600 },
          { hour_of_day: 20, event_count: 7, adds: 4, subtracts: 3, added_seconds: 2400 },
        ],
      })
      .mockResolvedValueOnce({
        results: [
          { date: "2025-01-01", event_count: 10, added_seconds: 5000, subtracted_seconds: 1000 },
        ],
      });
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);

    const res = await callGET("proj1");
    expect(res.status).toBe(200);
    const json = await parseJson(res);

    expect(json.data.summary.totalAddedSeconds).toBe(7200);
    expect(json.data.summary.totalSubtractedSeconds).toBe(1800);
    expect(json.data.summary.netAddedSeconds).toBe(5400);
    expect(json.data.summary.totalEvents).toBe(15);
    expect(json.data.summary.uniqueDonors).toBe(5);
    expect(json.data.summary.peakHour).toBe(14);

    expect(json.data.topDonors).toHaveLength(2);
    expect(json.data.topDonors[0].actorName).toBe("user1");
    expect(json.data.topDonors[0].totalSeconds).toBe(3600);

    expect(json.data.hourlyDistribution).toHaveLength(2);
    expect(json.data.hourlyDistribution[0].hour).toBe(14);

    expect(json.data.dailyActivity).toHaveLength(1);
    expect(json.data.dailyActivity[0].date).toBe("2025-01-01");
  });

  it("donorLimit 파라미터 적용", async () => {
    const db = createMockDB();
    db._stmt.first
      .mockResolvedValueOnce({ id: "proj1", owner_user_id: "owner1" })
      .mockResolvedValueOnce({
        total_added: 0,
        total_subtracted: 0,
        total_events: 0,
        unique_donors: 0,
      });
    db._stmt.all
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ results: [] });
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);

    await callGET("proj1", "donorLimit=5");

    const allBindArgs = db._stmt.bind.mock.calls.flat();
    expect(allBindArgs).toContain(5);
  });

  it("donorLimit 최대 50 제한", async () => {
    const db = createMockDB();
    db._stmt.first
      .mockResolvedValueOnce({ id: "proj1", owner_user_id: "owner1" })
      .mockResolvedValueOnce({
        total_added: 0,
        total_subtracted: 0,
        total_events: 0,
        unique_donors: 0,
      });
    db._stmt.all
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ results: [] });
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);

    await callGET("proj1", "donorLimit=100");

    const allBindArgs = db._stmt.bind.mock.calls.flat();
    expect(allBindArgs).toContain(50);
    expect(allBindArgs).not.toContain(100);
  });
});
