import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { parseJson } from "@/__tests__/helpers";
import { generateId, nowISO, withErrorHandler } from "@/lib/db";

describe("generateId", () => {
  it("32자 hex 문자열을 반환한다", () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("매번 다른 ID를 생성한다", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe("nowISO", () => {
  it("유효한 ISO 8601 문자열을 반환한다", () => {
    const iso = nowISO();
    const date = new Date(iso);
    expect(date.toISOString()).toBe(iso);
  });
});

describe("withErrorHandler", () => {
  let consoleError: MockInstance<typeof console.error>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  function loggedEntries() {
    return consoleError.mock.calls.map((c) => JSON.parse(String(c[0])));
  }

  it("정상 핸들러 → 정상 응답 전달", async () => {
    const handler = withErrorHandler(async () => {
      return NextResponse.json({ data: "ok" }, { status: 200 });
    });
    const res = await handler();
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.data).toBe("ok");
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("핸들러 throw → 500 + INTERNAL_ERROR 반환", async () => {
    const handler = withErrorHandler(async () => {
      throw new Error("DB connection failed");
    });
    const res = await handler();
    expect(res.status).toBe(500);
    const body = await parseJson(res);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    // 요청 인자가 없어도 로그는 한 번 남는다
    expect(loggedEntries()).toHaveLength(1);
    expect(loggedEntries()[0]).toMatchObject({ event: "api.unhandled", error: "DB connection failed" });
  });

  it("요청의 requestId·method·path(쿼리스트링 제외)와 오류 분류를 api.unhandled로 남긴다", async () => {
    const handler = withErrorHandler(async (_req: NextRequest) => {
      throw new Error("D1_ERROR: no such table: timers: SQLITE_ERROR");
    });
    const req = new NextRequest("http://localhost:3000/api/timers/abc?code=secret-code", {
      method: "GET",
      headers: { "x-request-id": "req-123" },
    });

    const res = await handler(req);

    expect(res.status).toBe(500);
    const entries = loggedEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: "error",
      event: "api.unhandled",
      requestId: "req-123",
      method: "GET",
      path: "/api/timers/abc",
      kind: "schema_drift",
    });
    expect(JSON.stringify(entries[0])).not.toContain("secret-code");
  });

  it("에러 메시지에 내부 정보 노출 안 됨", async () => {
    const handler = withErrorHandler(async () => {
      throw new Error("SELECT * FROM users WHERE password = 'secret'");
    });
    const res = await handler();
    const body = await parseJson(res);
    expect(body.error.message).not.toContain("SELECT");
    expect(body.error.message).not.toContain("secret");
    expect(body.error.message).toBe("서버 오류가 발생했습니다");
    expect(loggedEntries()).toHaveLength(1);
  });

  it("인자를 핸들러에 전달한다", async () => {
    const handler = withErrorHandler(async (a: string, b: number) => {
      return NextResponse.json({ data: `${a}-${b}` });
    });
    const res = await handler("hello", 42);
    const body = await parseJson(res);
    expect(body.data).toBe("hello-42");
  });
});
