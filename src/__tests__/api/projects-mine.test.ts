import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockDB, createGetRequest, parseJson } from "../helpers";

vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

import { getDB } from "@/lib/db";
import { GET as getMine } from "@/app/api/projects/mine/route";

const AUTH = { "x-user-id": "user-1" };

describe("GET /api/projects/mine", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
  });

  it("인증 없이 → 401", async () => {
    const req = createGetRequest("/api/projects/mine");
    const res = await getMine(req as never);
    expect(res.status).toBe(401);
  });

  it("200 내 프로젝트만 반환", async () => {
    db._stmt.first.mockResolvedValue({ cnt: 1 });
    db._stmt.all.mockResolvedValue({
      results: [
        {
          id: "p1",
          name: "내 프로젝트",
          description: null,
          timer_count: 1,
          created_at: "2025-01-01T00:00:00Z",
        },
      ],
    });
    const req = createGetRequest("/api/projects/mine", AUTH);
    const res = await getMine(req as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.projects).toHaveLength(1);
    expect(body.data.projects[0].name).toBe("내 프로젝트");
    expect(body.data.projects[0].timerCount).toBe(1);
    expect(body.data.pagination).toEqual({ page: 1, limit: 12, total: 1, totalPages: 1 });
    // 목록은 소유자 본인 것만 조회한다
    const sql = db.prepare.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(sql).toMatch(/p\.owner_user_id = \?/);
    expect(sql).not.toMatch(/owner_user_id != \?/);
    expect(db._stmt.bind.mock.calls[0][0]).toBe("user-1");
  });

  it("프로젝트 없을 때 빈 배열", async () => {
    db._stmt.first.mockResolvedValue({ cnt: 0 });
    db._stmt.all.mockResolvedValue({ results: [] });
    const req = createGetRequest("/api/projects/mine", AUTH);
    const res = await getMine(req as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.projects).toHaveLength(0);
  });

  // 모두 본인 프로젝트라 소유자 닉네임 검색은 모든 행에 걸린다. 이름·설명만 찾는다
  it("검색은 이름·설명만 찾고 검색어는 100자까지만 LIKE 패턴에 쓴다", async () => {
    db._stmt.first.mockResolvedValue({ cnt: 0 });

    const res = await getMine(createGetRequest(`/api/projects/mine?q=${"가".repeat(5000)}`, AUTH) as never);

    expect(res.status).toBe(200);
    const like = `%${"가".repeat(100)}%`;
    expect(db._stmt.bind.mock.calls[0]).toEqual(["user-1", like, like]);
    const sql = db.prepare.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(sql).not.toMatch(/nickname/);
  });
});

describe("GET /api/projects/mine 타이머 상태 (C030)", () => {
  const base = {
    id: "p1", name: "프로젝트1", description: null,
    timer_count: 1, created_at: "2026-10-01T00:00:00Z",
  };
  const NOW = new Date("2026-10-04T12:00:00Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function list(row: Record<string, unknown>) {
    const db = createMockDB();
    db._stmt.first.mockResolvedValue({ cnt: 1 });
    db._stmt.all.mockResolvedValue({ results: [{ ...base, ...row }] });
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
    const res = await getMine(createGetRequest("/api/projects/mine", AUTH) as never);
    const body = await parseJson(res);
    return { project: body.data.projects[0], db };
  }

  it("타이머 없는 프로젝트는 상태가 null", async () => {
    const { project, db } = await list({ timer_count: 0, timer_status: null, base_remaining_seconds: null, last_calculated_at: null, scheduled_start_at: null });
    expect(project).toMatchObject({ timerStatus: null, remainingSeconds: null, scheduledStartAt: null });
    // 목록은 기존 테이블 조인만 쓰고 쓰기를 하지 않는다
    const sql = db.prepare.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(sql).toMatch(/LEFT JOIN timers tm ON tm\.project_id = p\.id AND tm\.status != 'DELETED'/);
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("실행 중이면 조회 시점 잔여초를 계산한다", async () => {
    const { project } = await list({ timer_status: "RUNNING", base_remaining_seconds: 3600, last_calculated_at: "2026-10-04T11:50:00Z", scheduled_start_at: null });
    expect(project).toMatchObject({ timerStatus: "RUNNING", remainingSeconds: 3000 });
  });

  it("DB에 RUNNING으로 남아 있어도 잔여시간이 0이면 만료로 보인다", async () => {
    const { project } = await list({ timer_status: "RUNNING", base_remaining_seconds: 60, last_calculated_at: "2026-10-04T11:00:00Z", scheduled_start_at: null });
    expect(project).toMatchObject({ timerStatus: "EXPIRED", remainingSeconds: 0 });
  });

  it("시작 전 예약은 예약 시각을 싣는다", async () => {
    const { project } = await list({ timer_status: "SCHEDULED", base_remaining_seconds: 7200, last_calculated_at: "2026-10-04T00:00:00Z", scheduled_start_at: "2026-10-05T08:30:00Z" });
    expect(project).toMatchObject({ timerStatus: "SCHEDULED", remainingSeconds: 7200, scheduledStartAt: "2026-10-05T08:30:00Z" });
  });

  it("시작 시각이 지난 예약은 그 시각부터 흐른 실행 중으로 본다", async () => {
    const { project } = await list({ timer_status: "SCHEDULED", base_remaining_seconds: 7200, last_calculated_at: "2026-10-04T00:00:00Z", scheduled_start_at: "2026-10-04T11:00:00Z" });
    expect(project).toMatchObject({ timerStatus: "RUNNING", remainingSeconds: 3600, scheduledStartAt: null });
  });

  it("만료 상태는 잔여 0", async () => {
    const { project } = await list({ timer_status: "EXPIRED", base_remaining_seconds: 0, last_calculated_at: "2026-10-03T00:00:00Z", scheduled_start_at: null });
    expect(project).toMatchObject({ timerStatus: "EXPIRED", remainingSeconds: 0 });
  });
});
