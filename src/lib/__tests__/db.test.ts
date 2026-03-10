import { describe, it, expect } from "vitest";
import { generateId, nowISO } from "@/lib/db";

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
