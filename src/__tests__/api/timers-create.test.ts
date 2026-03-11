import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDB, createPostRequest, parseJson } from "../helpers";

vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

import { getDB } from "@/lib/db";
import { POST } from "@/app/api/projects/[id]/timers/route";

const PROJECT_ROW = { owner_user_id: "user-1", status: "ACTIVE" };

function callPost(body: unknown, headers: Record<string, string> = {}) {
  const req = createPostRequest("/api/projects/proj-1/timers", body, {
    "x-user-id": "user-1",
    "x-user-nickname": encodeURIComponent("테스터"),
    ...headers,
  });
  const params = Promise.resolve({ id: "proj-1" });
  return POST(req as never, { params } as never);
}

function callPostNoAuth(body: unknown) {
  const req = createPostRequest("/api/projects/proj-1/timers", body);
  const params = Promise.resolve({ id: "proj-1" });
  return POST(req as never, { params } as never);
}

describe("POST /api/projects/[id]/timers", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    // first() 호출: 1. project owner 확인, 2. 기존 타이머 count
    db._stmt.first
      .mockResolvedValueOnce(PROJECT_ROW)
      .mockResolvedValueOnce({ cnt: 0 });
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
  });

  it("인증 없이 → 401", async () => {
    const res = await callPostNoAuth({ title: "테스트", initialSeconds: 3600 });
    expect(res.status).toBe(401);
  });

  it("프로젝트 없음 → 404", async () => {
    db._stmt.first.mockReset();
    db._stmt.first.mockResolvedValue(null);
    const res = await callPost({ title: "테스트", initialSeconds: 3600 });
    expect(res.status).toBe(404);
  });

  it("소유자 아님 → 403", async () => {
    db._stmt.first.mockReset();
    db._stmt.first.mockResolvedValue({ owner_user_id: "other-user", status: "ACTIVE" });
    const res = await callPost({ title: "테스트", initialSeconds: 3600 });
    expect(res.status).toBe(403);
  });

  it("title 빈 문자열 → 400", async () => {
    const res = await callPost({ title: "", initialSeconds: 3600 });
    expect(res.status).toBe(400);
  });

  it("title 101자 → 400", async () => {
    const res = await callPost({ title: "a".repeat(101), initialSeconds: 3600 });
    expect(res.status).toBe(400);
  });

  it("initialSeconds 음수 → 400", async () => {
    const res = await callPost({ title: "타이머", initialSeconds: -1 });
    expect(res.status).toBe(400);
  });

  it("initialSeconds 0 → 400", async () => {
    const res = await callPost({ title: "타이머", initialSeconds: 0 });
    expect(res.status).toBe(400);
  });

  it("initialSeconds 상한 초과 → 400", async () => {
    const res = await callPost({ title: "타이머", initialSeconds: 31_536_001 });
    expect(res.status).toBe(400);
  });

  it("initialSeconds 소수 → 400", async () => {
    const res = await callPost({ title: "타이머", initialSeconds: 3600.5 });
    expect(res.status).toBe(400);
  });

  it("scheduledStartAt 과거 → 400", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const res = await callPost({ title: "타이머", initialSeconds: 3600, scheduledStartAt: past });
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.error.message).toContain("미래");
  });

  it("성공 201 + CREATE 로그 (RUNNING)", async () => {
    const res = await callPost({ title: "새타이머", initialSeconds: 7200 });
    expect(res.status).toBe(201);
    const body = await parseJson(res);
    expect(body.data.id).toMatch(/^[0-9a-f]{32}$/);
    expect(body.data.title).toBe("새타이머");
    expect(body.data.remainingSeconds).toBe(7200);
    expect(body.data.status).toBe("RUNNING");
    // batch 호출 확인 (타이머 INSERT + 로그 INSERT)
    expect(db.batch).toHaveBeenCalledTimes(1);
  });

  it("성공 201 + SCHEDULED 상태", async () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    const res = await callPost({
      title: "예약타이머",
      initialSeconds: 3600,
      scheduledStartAt: future,
    });
    expect(res.status).toBe(201);
    const body = await parseJson(res);
    expect(body.data.status).toBe("SCHEDULED");
    expect(body.data.scheduledStartAt).toBeDefined();
  });

  it("프로젝트당 타이머 1개 제약", async () => {
    db._stmt.first.mockReset();
    db._stmt.first
      .mockResolvedValueOnce(PROJECT_ROW)
      .mockResolvedValueOnce({ cnt: 1 });
    const res = await callPost({ title: "두번째", initialSeconds: 3600 });
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.error.message).toContain("하나");
  });

  it("잘못된 percent-encoding 닉네임 → 500이 아닌 정상 처리", async () => {
    const res = await callPost(
      { title: "테스트", initialSeconds: 3600 },
      { "x-user-nickname": "%E0%A4" }
    );
    expect(res.status).toBe(201);
    const body = await parseJson(res);
    expect(body.data.id).toBeDefined();
  });
});
