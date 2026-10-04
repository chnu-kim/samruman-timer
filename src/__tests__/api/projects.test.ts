import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockDB, createGetRequest, createPostRequest, createPostRequestRaw, parseJson } from "../helpers";

// getDB mock
vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

import { getDB } from "@/lib/db";
import { GET, POST } from "@/app/api/projects/route";

describe("GET /api/projects", () => {
  it("프로젝트 목록을 반환한다", async () => {
    const db = createMockDB();
    db._stmt.first.mockResolvedValue({ cnt: 1 });
    db._stmt.all.mockResolvedValue({
      results: [
        {
          id: "p1",
          name: "프로젝트1",
          description: null,
          owner_nickname: "유저1",
          timer_count: 2,
          created_at: "2025-01-01T00:00:00Z",
        },
      ],
    });
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);

    const req = createGetRequest("/api/projects");
    const res = await GET(req as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.projects).toHaveLength(1);
    expect(body.data.projects[0].ownerNickname).toBe("유저1");
    expect(body.data.projects[0].timerCount).toBe(2);
    expect(body.data.pagination).toEqual({ page: 1, limit: 12, total: 1, totalPages: 1 });
  });

  it("검색어는 100자까지만 LIKE 패턴에 쓴다", async () => {
    const db = createMockDB();
    db._stmt.first.mockResolvedValue({ cnt: 0 });
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);

    const res = await GET(createGetRequest(`/api/projects?q=${"가".repeat(5000)}`) as never);

    expect(res.status).toBe(200);
    const like = db._stmt.bind.mock.calls[0][0] as string;
    expect(like).toBe(`%${"가".repeat(100)}%`);
  });
});

describe("GET /api/projects 타이머 상태 (C030)", () => {
  const base = {
    id: "p1", name: "프로젝트1", description: null, owner_nickname: "유저1",
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
    const res = await GET(createGetRequest("/api/projects") as never);
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

describe("POST /api/projects", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
  });

  it("인증 없이 → 401", async () => {
    const req = createPostRequest("/api/projects", { name: "test" });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it("유효한 요청 → 201 생성", async () => {
    const req = createPostRequest("/api/projects", { name: "새 프로젝트" }, {
      "x-user-id": "user-1",
    });
    const res = await POST(req as never);
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.data.name).toBe("새 프로젝트");
    expect(body.data.ownerUserId).toBe("user-1");
    expect(body.data.id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("잘못된 JSON → 400", async () => {
    const req = createPostRequestRaw("/api/projects", "not-json{", {
      "x-user-id": "user-1",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("name이 숫자 → 400 타입 검증", async () => {
    const req = createPostRequest("/api/projects", { name: 123 }, {
      "x-user-id": "user-1",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("name 빈 문자열 → 400", async () => {
    const req = createPostRequest("/api/projects", { name: "" }, {
      "x-user-id": "user-1",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("name 101자 → 400", async () => {
    const req = createPostRequest("/api/projects", { name: "a".repeat(101) }, {
      "x-user-id": "user-1",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("description 501자 → 400", async () => {
    const req = createPostRequest("/api/projects", {
      name: "ok",
      description: "x".repeat(501),
    }, { "x-user-id": "user-1" });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("description이 배열 → 400 타입 검증", async () => {
    const req = createPostRequest("/api/projects", {
      name: "ok",
      description: ["not", "string"],
    }, { "x-user-id": "user-1" });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });
});
