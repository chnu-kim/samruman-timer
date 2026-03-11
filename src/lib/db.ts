import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { logger } from "@/lib/logger";

export async function getDB(): Promise<D1Database> {
  const { env } = await getCloudflareContext();
  return env.DB;
}

export function generateId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * API 라우트 핸들러를 감싸서 예상치 못한 에러 시
 * 내부 정보(쿼리, 스택트레이스)가 클라이언트에 노출되지 않도록 한다.
 */
export function withErrorHandler<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      const request = args[0];
      logger.error("Unhandled API error", {
        requestId: request instanceof NextRequest ? request.headers.get("x-request-id") ?? undefined : undefined,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "서버 오류가 발생했습니다" } },
        { status: 500 }
      );
    }
  };
}
