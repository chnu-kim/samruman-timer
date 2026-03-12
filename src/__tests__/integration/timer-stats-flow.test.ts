import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockDB,
  createPostRequest,
  createGetRequest,
  parseJson,
} from "../helpers";

vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

import { getDB } from "@/lib/db";
import { POST as createTimer } from "@/app/api/projects/[id]/timers/route";
import { POST as modifyTimer } from "@/app/api/timers/[id]/modify/route";
import { GET as getTimerStats } from "@/app/api/timers/[id]/stats/route";

const AUTH_HEADERS = {
  "x-user-id": "user-1",
  "x-user-nickname": encodeURIComponent("테스터"),
};

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("타이머 통계 통합 흐름", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
  });

  it("1. 타이머 생성 → 여러 번 시간 변경 → 통계 조회", async () => {
    // Step 1: 타이머 생성
    db._stmt.first
      .mockResolvedValueOnce({ owner_user_id: "user-1", status: "ACTIVE" })
      .mockResolvedValueOnce({ cnt: 0 });

    const createReq = createPostRequest("/api/projects/proj-1/timers", {
      title: "통계 테스트 타이머",
      initialSeconds: 3600,
    }, AUTH_HEADERS);
    const createRes = await createTimer(createReq as never, makeParams("proj-1") as never);
    expect(createRes.status).toBe(201);

    // Step 2: ADD 시간 추가 (시청자1)
    db._stmt.first.mockResolvedValue({
      id: "timer-1",
      project_id: "proj-1",
      title: "통계 테스트 타이머",
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

    const addReq1 = createPostRequest("/api/timers/timer-1/modify", {
      action: "ADD",
      deltaSeconds: 600,
      actorName: "시청자1",
    }, AUTH_HEADERS);
    const addRes1 = await modifyTimer(addReq1 as never, makeParams("timer-1") as never);
    expect(addRes1.status).toBe(200);

    // Step 3: ADD 시간 추가 (시청자2)
    db._stmt.first.mockResolvedValue({
      id: "timer-1",
      project_id: "proj-1",
      title: "통계 테스트 타이머",
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

    const addReq2 = createPostRequest("/api/timers/timer-1/modify", {
      action: "ADD",
      deltaSeconds: 1200,
      actorName: "시청자2",
    }, AUTH_HEADERS);
    const addRes2 = await modifyTimer(addReq2 as never, makeParams("timer-1") as never);
    expect(addRes2.status).toBe(200);

    // Step 4: SUBTRACT 시간 감소
    db._stmt.first.mockResolvedValue({
      id: "timer-1",
      project_id: "proj-1",
      title: "통계 테스트 타이머",
      description: null,
      base_remaining_seconds: 5400,
      last_calculated_at: new Date().toISOString(),
      status: "RUNNING",
      scheduled_start_at: null,
      created_by: "user-1",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
      owner_user_id: "user-1",
    });

    const subReq = createPostRequest("/api/timers/timer-1/modify", {
      action: "SUBTRACT",
      deltaSeconds: 300,
      actorName: "시청자3",
    }, AUTH_HEADERS);
    const subRes = await modifyTimer(subReq as never, makeParams("timer-1") as never);
    expect(subRes.status).toBe(200);

    // Step 5: 통계 조회
    db._stmt.first
      .mockResolvedValueOnce({ id: "timer-1", owner_user_id: "user-1" })
      .mockResolvedValueOnce({
        total_added: 1800,
        total_subtracted: 300,
        total_events: 3,
        unique_donors: 2,
      });
    db._stmt.all
      .mockResolvedValueOnce({
        results: [
          { actor_name: "시청자2", total_seconds: 1200, event_count: 1 },
          { actor_name: "시청자1", total_seconds: 600, event_count: 1 },
        ],
      })
      .mockResolvedValueOnce({
        results: [
          { hour_of_day: 14, event_count: 3, adds: 2, subtracts: 1, added_seconds: 1800 },
        ],
      })
      .mockResolvedValueOnce({
        results: [
          { date: "2025-01-01", event_count: 3, added_seconds: 1800, subtracted_seconds: 300 },
        ],
      });

    const statsReq = createGetRequest("/api/timers/timer-1/stats", AUTH_HEADERS);
    const statsRes = await getTimerStats(statsReq as never, makeParams("timer-1") as never);
    const statsBody = await parseJson(statsRes);

    expect(statsRes.status).toBe(200);
    expect(statsBody.data.summary.totalAddedSeconds).toBe(1800);
    expect(statsBody.data.summary.totalSubtractedSeconds).toBe(300);
    expect(statsBody.data.summary.netAddedSeconds).toBe(1500);
    expect(statsBody.data.summary.totalEvents).toBe(3);
    expect(statsBody.data.summary.uniqueDonors).toBe(2);
    expect(statsBody.data.summary.peakHour).toBe(14);

    // topDonors 정렬 확인 (시청자2가 더 많이 기부)
    expect(statsBody.data.topDonors).toHaveLength(2);
    expect(statsBody.data.topDonors[0].actorName).toBe("시청자2");
    expect(statsBody.data.topDonors[0].totalSeconds).toBe(1200);
    expect(statsBody.data.topDonors[1].actorName).toBe("시청자1");

    // 시간대별 분포 확인
    expect(statsBody.data.hourlyDistribution).toHaveLength(1);
    expect(statsBody.data.hourlyDistribution[0].adds).toBe(2);
    expect(statsBody.data.hourlyDistribution[0].subtracts).toBe(1);

    // 일별 활동 확인
    expect(statsBody.data.dailyActivity).toHaveLength(1);
    expect(statsBody.data.dailyActivity[0].addedSeconds).toBe(1800);
    expect(statsBody.data.dailyActivity[0].subtractedSeconds).toBe(300);
  });

  it("2. 비소유자가 통계 조회 시도 → 403", async () => {
    db._stmt.first.mockResolvedValueOnce({ id: "timer-1", owner_user_id: "user-1" });

    const statsReq = createGetRequest("/api/timers/timer-1/stats", {
      "x-user-id": "other-user",
    });
    const statsRes = await getTimerStats(statsReq as never, makeParams("timer-1") as never);
    expect(statsRes.status).toBe(403);
  });

  it("3. 존재하지 않는 타이머 통계 조회 → 404", async () => {
    db._stmt.first.mockResolvedValueOnce(null);

    const statsReq = createGetRequest("/api/timers/nonexistent/stats", AUTH_HEADERS);
    const statsRes = await getTimerStats(statsReq as never, makeParams("nonexistent") as never);
    expect(statsRes.status).toBe(404);
  });

  it("4. 로그 없는 타이머의 통계 → 모두 0", async () => {
    db._stmt.first
      .mockResolvedValueOnce({ id: "timer-empty", owner_user_id: "user-1" })
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

    const statsReq = createGetRequest("/api/timers/timer-empty/stats", AUTH_HEADERS);
    const statsRes = await getTimerStats(statsReq as never, makeParams("timer-empty") as never);
    const statsBody = await parseJson(statsRes);

    expect(statsRes.status).toBe(200);
    expect(statsBody.data.summary.totalAddedSeconds).toBe(0);
    expect(statsBody.data.summary.netAddedSeconds).toBe(0);
    expect(statsBody.data.summary.peakHour).toBeNull();
    expect(statsBody.data.topDonors).toEqual([]);
    expect(statsBody.data.hourlyDistribution).toEqual([]);
    expect(statsBody.data.dailyActivity).toEqual([]);
  });
});
