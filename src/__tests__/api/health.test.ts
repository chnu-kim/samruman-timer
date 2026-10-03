import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import { createMockDB, createGetRequest, parseJson } from "../helpers";

vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

import { getDB } from "@/lib/db";
import { GET } from "@/app/api/health/route";
import { EXPECTED_LATEST_MIGRATION } from "@/lib/health";

const REQUEST_ID = "00000000-0000-4000-8000-000000000001";

function healthRequest() {
  return createGetRequest("/api/health", { "x-request-id": REQUEST_ID });
}

function logsOf(spy: MockInstance<typeof console.log>) {
  return spy.mock.calls.map((c) => JSON.parse(String(c[0])));
}

let db: ReturnType<typeof createMockDB>;
let consoleLog: MockInstance<typeof console.log>;
let consoleError: MockInstance<typeof console.error>;
let consoleWarn: MockInstance<typeof console.warn>;

beforeEach(() => {
  db = createMockDB();
  vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
  consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  consoleLog.mockRestore();
  consoleError.mockRestore();
  consoleWarn.mockRestore();
});

describe("GET /api/health", () => {
  it("원격 최신 마이그레이션이 기대값과 같으면 200 { data: { ok: true } } + health.check 한 건", async () => {
    db._stmt.first.mockResolvedValue({ name: EXPECTED_LATEST_MIGRATION });

    const res = await GET(healthRequest());

    expect(res.status).toBe(200);
    expect(await parseJson(res)).toEqual({ data: { ok: true } });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(db.prepare).toHaveBeenCalledTimes(1);
    expect(db.prepare).toHaveBeenCalledWith("SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1");

    const logs = logsOf(consoleLog);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ level: "info", event: "health.check", requestId: REQUEST_ID, ok: true });
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("원격이 앞서 있으면(마이그레이션 먼저 적용 후 배포 전) 200 + health.check(info) + health.schema_ahead(warn)", async () => {
    db._stmt.first.mockResolvedValue({ name: "9999_future.sql" });

    const res = await GET(healthRequest());

    // 정상 롤아웃 중에도 생기는 상태라 프로브 알림이 가지 않게 200을 유지한다
    expect(res.status).toBe(200);
    expect(await parseJson(res)).toEqual({ data: { ok: true } });

    // health.check는 그대로 남고(버전이 요청을 받았다는 근거) 스키마 상태는 섞지 않는다
    const logs = logsOf(consoleLog);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ level: "info", event: "health.check", requestId: REQUEST_ID, ok: true });
    expect(logs[0]).not.toHaveProperty("schemaState");

    const warns = logsOf(consoleWarn);
    expect(warns).toHaveLength(1);
    expect(warns[0]).toMatchObject({
      level: "warn",
      event: "health.schema_ahead",
      requestId: REQUEST_ID,
      schemaState: "ahead",
      expected: EXPECTED_LATEST_MIGRATION,
      actual: "9999_future.sql",
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("원격이 뒤처지면 503 + health.schema_drift(error). 응답 본문에 마이그레이션 이름을 넣지 않는다", async () => {
    db._stmt.first.mockResolvedValue({ name: "0001_initial.sql" });

    const res = await GET(healthRequest());
    const text = await res.text();

    expect(res.status).toBe(503);
    expect(JSON.parse(text)).toEqual({
      error: { code: "SERVICE_UNAVAILABLE", message: expect.any(String) },
    });
    expect(text).not.toContain("0001");
    expect(text).not.toContain(EXPECTED_LATEST_MIGRATION);
    expect(res.headers.get("cache-control")).toBe("no-store");

    const errors = logsOf(consoleError);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      level: "error",
      event: "health.schema_drift",
      requestId: REQUEST_ID,
      method: "GET",
      path: "/api/health",
      ok: false,
      kind: "schema_drift",
      schemaState: "behind",
      expected: EXPECTED_LATEST_MIGRATION,
      actual: "0001_initial.sql",
    });
    // 실패는 health.check로 남기지 않는다(verify --expect-event health.check가 정상 근거로 세지 않도록)
    expect(consoleLog).not.toHaveBeenCalled();
  });

  it("적용 기록이 없으면 503 + schemaState=missing, actual=null", async () => {
    db._stmt.first.mockResolvedValue(null);

    const res = await GET(healthRequest());

    expect(res.status).toBe(503);
    expect(logsOf(consoleError)[0]).toMatchObject({
      event: "health.schema_drift",
      schemaState: "missing",
      actual: null,
    });
  });

  it("D1 예외는 withErrorHandler가 500 + api.unhandled로 낸다(예외 원문은 본문에 없다)", async () => {
    db._stmt.first.mockRejectedValue(new Error("D1_ERROR: no such table: d1_migrations: SQLITE_ERROR"));

    const res = await GET(healthRequest());
    const text = await res.text();

    expect(res.status).toBe(500);
    expect(JSON.parse(text).error.code).toBe("INTERNAL_ERROR");
    expect(text).not.toContain("d1_migrations");

    const errors = logsOf(consoleError);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      event: "api.unhandled",
      requestId: REQUEST_ID,
      path: "/api/health",
      kind: "schema_drift",
    });
  });
});
