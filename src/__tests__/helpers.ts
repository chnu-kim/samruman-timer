import { vi } from "vitest";
import { NextRequest } from "next/server";

// ─── Mock D1 Database ───

export function createMockDB() {
  const stmt = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue({ results: [] }),
    run: vi.fn().mockResolvedValue({}),
  };
  const db = {
    prepare: vi.fn().mockReturnValue(stmt),
    batch: vi.fn().mockResolvedValue([]),
    _stmt: stmt,
  };
  return db as unknown as D1Database & {
    _stmt: typeof stmt;
    prepare: ReturnType<typeof vi.fn>;
    batch: ReturnType<typeof vi.fn>;
  };
}

/**
 * getDB를 모킹하여 테스트용 DB를 반환한다.
 * 반드시 vi.mock 이후에 호출해야 한다.
 */
export function mockGetDB(db: ReturnType<typeof createMockDB>) {
  const dbModule = require("@/lib/db");
  dbModule.getDB = vi.fn().mockResolvedValue(db);
  return db;
}

// ─── Request Builders ───

export function createGetRequest(
  url: string,
  headers?: Record<string, string>
): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: "GET",
    headers: headers ? new Headers(headers) : undefined,
  });
}

export function createPostRequest(
  url: string,
  body: unknown,
  headers?: Record<string, string>
): NextRequest {
  const allHeaders = new Headers(headers);
  allHeaders.set("content-type", "application/json");
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: "POST",
    headers: allHeaders,
    body: JSON.stringify(body),
  });
}

export function createPostRequestRaw(
  url: string,
  rawBody: string,
  headers?: Record<string, string>
): NextRequest {
  const allHeaders = new Headers(headers);
  allHeaders.set("content-type", "application/json");
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: "POST",
    headers: allHeaders,
    body: rawBody,
  });
}

export function createDeleteRequest(
  url: string,
  headers?: Record<string, string>
): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: "DELETE",
    headers: headers ? new Headers(headers) : undefined,
  });
}

// ─── Response Parser ───

export async function parseJson(response: Response) {
  return response.json();
}
