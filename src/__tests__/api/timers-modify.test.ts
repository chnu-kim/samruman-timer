import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDB, createPostRequest, createPostRequestRaw, parseJson } from "../helpers";

vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

import { getDB } from "@/lib/db";
import { POST } from "@/app/api/timers/[id]/modify/route";

const TIMER_ROW = {
  id: "timer-1",
  project_id: "proj-1",
  title: "테스트 타이머",
  description: null,
  base_remaining_seconds: 3600,
  last_calculated_at: new Date().toISOString(),
  status: "RUNNING",
  created_by: "user-1",
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
  owner_user_id: "user-1",
};

function callPost(body: unknown, userId = "user-1") {
  const req = createPostRequest("/api/timers/timer-1/modify", body, {
    "x-user-id": userId,
  });
  const params = Promise.resolve({ id: "timer-1" });
  return POST(req as never, { params } as never);
}

describe("POST /api/timers/[id]/modify", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    db._stmt.first.mockResolvedValue(TIMER_ROW);
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
  });

  it("인증 없이 → 401", async () => {
    const req = createPostRequest("/api/timers/timer-1/modify", {
      action: "ADD", deltaSeconds: 100, actorName: "test",
    });
    const res = await POST(req as never, { params: Promise.resolve({ id: "timer-1" }) } as never);
    expect(res.status).toBe(401);
  });

  it("타이머 없음 → 404", async () => {
    db._stmt.first.mockResolvedValue(null);
    const res = await callPost({ action: "ADD", deltaSeconds: 100, actorName: "test" });
    expect(res.status).toBe(404);
  });

  it("소유자 아님 → 403", async () => {
    const res = await callPost(
      { action: "ADD", deltaSeconds: 100, actorName: "test" },
      "other-user"
    );
    expect(res.status).toBe(403);
  });

  it("잘못된 JSON → 400", async () => {
    const req = createPostRequestRaw("/api/timers/timer-1/modify", "bad{", {
      "x-user-id": "user-1",
    });
    const res = await POST(req as never, { params: Promise.resolve({ id: "timer-1" }) } as never);
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("잘못된 action → 400", async () => {
    const res = await callPost({ action: "INVALID", deltaSeconds: 100, actorName: "test" });
    expect(res.status).toBe(400);
  });

  it("deltaSeconds 음수 → 400", async () => {
    const res = await callPost({ action: "ADD", deltaSeconds: -1, actorName: "test" });
    expect(res.status).toBe(400);
  });

  it("deltaSeconds 소수점 → 400", async () => {
    const res = await callPost({ action: "ADD", deltaSeconds: 1.5, actorName: "test" });
    expect(res.status).toBe(400);
  });

  it("deltaSeconds 상한 초과 → 400", async () => {
    const res = await callPost({ action: "ADD", deltaSeconds: 31_536_001, actorName: "test" });
    expect(res.status).toBe(400);
  });

  it("actorName 빈 문자열 → 400", async () => {
    const res = await callPost({ action: "ADD", deltaSeconds: 100, actorName: "" });
    expect(res.status).toBe(400);
  });

  it("actorName 51자 → 400", async () => {
    const res = await callPost({ action: "ADD", deltaSeconds: 100, actorName: "a".repeat(51) });
    expect(res.status).toBe(400);
  });

  it("actorName이 숫자 → 400 타입 검증", async () => {
    const res = await callPost({ action: "ADD", deltaSeconds: 100, actorName: 123 });
    expect(res.status).toBe(400);
  });

  it("만료된 타이머에 SUBTRACT → 200 허용, SUBTRACT 로그 기록 (before=0, after=0)", async () => {
    db._stmt.first.mockResolvedValue({
      ...TIMER_ROW,
      status: "EXPIRED",
      base_remaining_seconds: 0,
    });
    const res = await callPost({ action: "SUBTRACT", deltaSeconds: 100, actorName: "test" });
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.data.status).toBe("EXPIRED");
    expect(body.data.log.actionType).toBe("SUBTRACT");
    expect(body.data.log.beforeSeconds).toBe(0);
    expect(body.data.log.afterSeconds).toBe(0);
  });

  it("유효한 ADD 요청 → 200 + log 포함", async () => {
    const res = await callPost({ action: "ADD", deltaSeconds: 600, actorName: "테스터" });
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.data.status).toBe("RUNNING");
    expect(body.data.log).toBeDefined();
    expect(body.data.log.actionType).toBe("ADD");
    expect(body.data.log.deltaSeconds).toBe(600);
    expect(body.data.log.actorName).toBe("테스터");
  });
});
