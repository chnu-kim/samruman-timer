import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";
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
  it("정상 핸들러 → 정상 응답 전달", async () => {
    const handler = withErrorHandler(async () => {
      return NextResponse.json({ data: "ok" }, { status: 200 });
    });
    const res = await handler();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBe("ok");
  });

  it("핸들러 throw → 500 + INTERNAL_ERROR 반환", async () => {
    const handler = withErrorHandler(async () => {
      throw new Error("DB connection failed");
    });
    const res = await handler();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });

  it("에러 메시지에 내부 정보 노출 안 됨", async () => {
    const handler = withErrorHandler(async () => {
      throw new Error("SELECT * FROM users WHERE password = 'secret'");
    });
    const res = await handler();
    const body = await res.json();
    expect(body.error.message).not.toContain("SELECT");
    expect(body.error.message).not.toContain("secret");
    expect(body.error.message).toBe("서버 오류가 발생했습니다");
  });

  it("인자를 핸들러에 전달한다", async () => {
    const handler = withErrorHandler(async (a: string, b: number) => {
      return NextResponse.json({ data: `${a}-${b}` });
    });
    const res = await handler("hello", 42);
    const body = await res.json();
    expect(body.data).toBe("hello-42");
  });
});
