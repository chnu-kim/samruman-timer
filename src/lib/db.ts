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
 * 에러 모니터링 외부 전송 훅.
 * Sentry 등 외부 서비스 연동 시 이 배열에 핸들러를 등록한다.
 *
 * @example
 * // Sentry 연동 시:
 * import * as Sentry from "@sentry/nextjs";
 * errorReporters.push((error, context) => {
 *   Sentry.captureException(error, { extra: context });
 * });
 */
export const errorReporters: Array<
  (error: unknown, context: { requestId?: string; url?: string; method?: string }) => void
> = [];

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
      const requestId = request instanceof NextRequest ? request.headers.get("x-request-id") ?? undefined : undefined;
      const url = request instanceof NextRequest ? request.nextUrl.pathname : undefined;
      const method = request instanceof NextRequest ? request.method : undefined;

      logger.error("Unhandled API error", {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      for (const report of errorReporters) {
        try {
          report(error, { requestId, url, method });
        } catch {
          // 리포터 자체 에러는 무시
        }
      }

      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "서버 오류가 발생했습니다" } },
        { status: 500 }
      );
    }
  };
}
