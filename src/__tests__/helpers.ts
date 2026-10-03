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
    // 첫 문장(타이머 상태 UPDATE)이 한 행을 바꾼 것으로 본다. CAS 실패는 테스트에서 따로 흉내 낸다
    batch: vi.fn().mockResolvedValue([{ meta: { changes: 1 } }]),
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

export function createPatchRequest(
  url: string,
  body: unknown,
  headers?: Record<string, string>
): NextRequest {
  const allHeaders = new Headers(headers);
  allHeaders.set("content-type", "application/json");
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: "PATCH",
    headers: allHeaders,
    body: JSON.stringify(body),
  });
}

export function createPutRequest(
  url: string,
  body: unknown,
  headers?: Record<string, string>
): NextRequest {
  const allHeaders = new Headers(headers);
  allHeaders.set("content-type", "application/json");
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: "PUT",
    headers: allHeaders,
    body: JSON.stringify(body),
  });
}

export function createPutRequestRaw(
  url: string,
  rawBody: string,
  headers?: Record<string, string>
): NextRequest {
  const allHeaders = new Headers(headers);
  allHeaders.set("content-type", "application/json");
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: "PUT",
    headers: allHeaders,
    body: rawBody,
  });
}

// ─── Response Parser ───

/**
 * 응답 본문을 JSON으로 읽는다. 테스트는 `body.data.x`·`body.error.code`처럼 바로 단언하므로
 * Response.json()의 unknown 대신 any로 돌려준다(테스트 파일도 tsc 대상)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function parseJson(response: Response): Promise<any> {
  return response.json();
}
