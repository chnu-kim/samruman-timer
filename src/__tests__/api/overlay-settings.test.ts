import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockDB,
  createGetRequest,
  createPutRequest,
  createPutRequestRaw,
  parseJson,
} from "../helpers";

vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

import { getDB } from "@/lib/db";
import { GET, PUT } from "@/app/api/timers/[id]/overlay-settings/route";

const TIMER_ROW = {
  id: "timer-1",
  status: "RUNNING",
  owner_user_id: "user-1",
};

const SETTINGS_ROW = {
  font_size: 96,
  text_color: "#00ff88",
  background: "transparent",
  show_title: 1,
  text_shadow: 0,
  position: "top-left",
};

function makeParams(id = "timer-1") {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/timers/[id]/overlay-settings", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
  });

  it("200 저장된 설정 반환", async () => {
    db._stmt.first
      .mockResolvedValueOnce(TIMER_ROW) // timer check
      .mockResolvedValueOnce(SETTINGS_ROW); // settings
    const req = createGetRequest("/api/timers/timer-1/overlay-settings");
    const res = await GET(req as never, makeParams() as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toEqual({
      fontSize: 96,
      color: "#00ff88",
      bg: "transparent",
      showTitle: true,
      shadow: false,
      position: "top-left",
    });
  });

  it("200 설정 없으면 기본값 반환", async () => {
    db._stmt.first
      .mockResolvedValueOnce(TIMER_ROW) // timer exists
      .mockResolvedValueOnce(null); // no settings
    const req = createGetRequest("/api/timers/timer-1/overlay-settings");
    const res = await GET(req as never, makeParams() as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toEqual({
      fontSize: 72,
      color: "#ffffff",
      bg: "transparent",
      showTitle: false,
      shadow: true,
      position: "center",
    });
  });

  it("타이머 미존재 → 404", async () => {
    db._stmt.first.mockResolvedValueOnce(null);
    const req = createGetRequest("/api/timers/nonexistent/overlay-settings");
    const res = await GET(req as never, makeParams("nonexistent") as never);
    expect(res.status).toBe(404);
  });

  it("DELETED 타이머 → 404", async () => {
    db._stmt.first.mockResolvedValueOnce({ ...TIMER_ROW, status: "DELETED" });
    const req = createGetRequest("/api/timers/timer-1/overlay-settings");
    const res = await GET(req as never, makeParams() as never);
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/timers/[id]/overlay-settings", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
  });

  it("200 소유자가 설정 저장", async () => {
    db._stmt.first.mockResolvedValueOnce(TIMER_ROW);
    const req = createPutRequest(
      "/api/timers/timer-1/overlay-settings",
      { fontSize: 96, color: "#00ff88", showTitle: true, shadow: false, position: "top-left" },
      { "x-user-id": "user-1" }
    );
    const res = await PUT(req as never, makeParams() as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.fontSize).toBe(96);
    expect(body.data.color).toBe("#00ff88");
    expect(body.data.showTitle).toBe(true);
    expect(body.data.shadow).toBe(false);
    expect(body.data.position).toBe("top-left");
  });

  it("미인증 → 401", async () => {
    const req = createPutRequest(
      "/api/timers/timer-1/overlay-settings",
      { fontSize: 72 }
    );
    const res = await PUT(req as never, makeParams() as never);
    expect(res.status).toBe(401);
  });

  it("비소유자 → 403", async () => {
    db._stmt.first.mockResolvedValueOnce(TIMER_ROW);
    const req = createPutRequest(
      "/api/timers/timer-1/overlay-settings",
      { fontSize: 72 },
      { "x-user-id": "other-user" }
    );
    const res = await PUT(req as never, makeParams() as never);
    expect(res.status).toBe(403);
  });

  it("fontSize 범위 초과 → 400", async () => {
    db._stmt.first.mockResolvedValueOnce(TIMER_ROW);
    const req = createPutRequest(
      "/api/timers/timer-1/overlay-settings",
      { fontSize: 999 },
      { "x-user-id": "user-1" }
    );
    const res = await PUT(req as never, makeParams() as never);
    expect(res.status).toBe(400);
  });

  it("잘못된 position → 400", async () => {
    db._stmt.first.mockResolvedValueOnce(TIMER_ROW);
    const req = createPutRequest(
      "/api/timers/timer-1/overlay-settings",
      { position: "invalid" },
      { "x-user-id": "user-1" }
    );
    const res = await PUT(req as never, makeParams() as never);
    expect(res.status).toBe(400);
  });

  it("유효하지 않은 JSON → 400", async () => {
    db._stmt.first.mockResolvedValueOnce(TIMER_ROW);
    const req = createPutRequestRaw(
      "/api/timers/timer-1/overlay-settings",
      "not-json",
      { "x-user-id": "user-1" }
    );
    const res = await PUT(req as never, makeParams() as never);
    expect(res.status).toBe(400);
  });

  it("타이머 미존재 → 404", async () => {
    db._stmt.first.mockResolvedValueOnce(null);
    const req = createPutRequest(
      "/api/timers/timer-1/overlay-settings",
      { fontSize: 72 },
      { "x-user-id": "user-1" }
    );
    const res = await PUT(req as never, makeParams() as never);
    expect(res.status).toBe(404);
  });
});
