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
  animation: 0,
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
      animation: false,
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
      animation: true,
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
    expect(body.data.animation).toBe(true);
  });

  it("animation=false 저장 시 DB에 0으로 기록하고 응답에 반영", async () => {
    db._stmt.first.mockResolvedValueOnce(TIMER_ROW);
    const req = createPutRequest(
      "/api/timers/timer-1/overlay-settings",
      { animation: false },
      { "x-user-id": "user-1" }
    );
    const res = await PUT(req as never, makeParams() as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.animation).toBe(false);
    const sql = db.prepare.mock.calls.map((c: unknown[]) => String(c[0])).find((q: string) => q.includes("INSERT INTO overlay_settings"));
    expect(sql).toContain("animation");
    const bindArgs = db._stmt.bind.mock.calls.at(-1) as unknown[];
    expect(bindArgs.at(-2)).toBe(0); // animation은 updated_at 바로 앞
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

  it("bg에 CSS 규칙 탈출 문자열 → 400", async () => {
    db._stmt.first.mockResolvedValueOnce(TIMER_ROW);
    const req = createPutRequest(
      "/api/timers/timer-1/overlay-settings",
      { bg: "transparent} body::after{background:url(https://x/)} x{" },
      { "x-user-id": "user-1" }
    );
    const res = await PUT(req as never, makeParams() as never);
    expect(res.status).toBe(400);
    expect(db._stmt.run).not.toHaveBeenCalled();
  });

  it("bg에 url() → 400", async () => {
    db._stmt.first.mockResolvedValueOnce(TIMER_ROW);
    const req = createPutRequest(
      "/api/timers/timer-1/overlay-settings",
      { bg: "url(https://x/a.png)" },
      { "x-user-id": "user-1" }
    );
    const res = await PUT(req as never, makeParams() as never);
    expect(res.status).toBe(400);
    expect(db._stmt.run).not.toHaveBeenCalled();
  });

  it("color가 #rrggbb가 아님 → 400", async () => {
    db._stmt.first.mockResolvedValueOnce(TIMER_ROW);
    const req = createPutRequest(
      "/api/timers/timer-1/overlay-settings",
      { color: "red" },
      { "x-user-id": "user-1" }
    );
    const res = await PUT(req as never, makeParams() as never);
    expect(res.status).toBe(400);
    expect(db._stmt.run).not.toHaveBeenCalled();
  });

  it("boolean 필드에 문자열 → 400", async () => {
    db._stmt.first.mockResolvedValueOnce(TIMER_ROW);
    const req = createPutRequest(
      "/api/timers/timer-1/overlay-settings",
      { showTitle: "false" },
      { "x-user-id": "user-1" }
    );
    const res = await PUT(req as never, makeParams() as never);
    expect(res.status).toBe(400);
    expect(db._stmt.run).not.toHaveBeenCalled();
  });

  it("본문이 객체가 아님 → 400", async () => {
    db._stmt.first.mockResolvedValueOnce(TIMER_ROW);
    const req = createPutRequest(
      "/api/timers/timer-1/overlay-settings",
      null,
      { "x-user-id": "user-1" }
    );
    const res = await PUT(req as never, makeParams() as never);
    expect(res.status).toBe(400);
    expect(db._stmt.run).not.toHaveBeenCalled();
  });

  it("bg=transparent와 #rrggbb는 저장된다", async () => {
    db._stmt.first.mockResolvedValueOnce(TIMER_ROW);
    const req = createPutRequest(
      "/api/timers/timer-1/overlay-settings",
      { bg: "#112233", color: "#AABBCC" },
      { "x-user-id": "user-1" }
    );
    const res = await PUT(req as never, makeParams() as never);
    expect(res.status).toBe(200);
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
