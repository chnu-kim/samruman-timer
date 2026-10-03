import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { errorFields, logger } from "@/lib/logger";

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

/** 첫 인자가 Request처럼 생겼을 때만 로그용 요청 정보를 꺼낸다. 쿼리스트링은 남기지 않는다 */
function requestContext(arg: unknown): { requestId?: string; method?: string; path?: string } {
  if (typeof arg !== "object" || arg === null || !("headers" in arg)) return {};
  const req = arg as Partial<Request>;
  let path: string | undefined;
  try {
    path = typeof req.url === "string" ? new URL(req.url).pathname : undefined;
  } catch {
    path = undefined;
  }
  return {
    requestId: req.headers instanceof Headers ? (req.headers.get("x-request-id") ?? undefined) : undefined,
    method: typeof req.method === "string" ? req.method : undefined,
    path,
  };
}

/**
 * API 라우트 핸들러를 감싸서 예상치 못한 에러 시
 * 내부 정보(쿼리, 스택트레이스)가 클라이언트에 노출되지 않도록 한다.
 * invocation log를 끈 상태라 method·path를 이 로그에 직접 남긴다.
 */
export function withErrorHandler<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      logger.error("api.unhandled", {
        ...requestContext(args[0]),
        ...errorFields(error),
      });

      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "서버 오류가 발생했습니다" } },
        { status: 500 }
      );
    }
  };
}
