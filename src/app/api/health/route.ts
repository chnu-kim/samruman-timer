import { NextRequest, NextResponse } from "next/server";
import { getDB, withErrorHandler } from "@/lib/db";
import { compareSchema, EXPECTED_LATEST_MIGRATION } from "@/lib/health";
import { logger } from "@/lib/logger";
import type { ApiErrorResponse } from "@/types";

// 프로브가 매번 실제 Worker·D1에 닿아야 하므로 응답을 어디에도 캐시하지 않는다
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * 공개 헬스체크. 외부 프로브(.github/workflows/health.yml)가 매시 부른다.
 * 인증 없는 공개 경로라 D1 조회는 한 번, 응답은 ok 여부만 담는다(마이그레이션 이름 같은 내부 정보는 로그에만 남긴다).
 * D1 예외는 withErrorHandler가 500 + api.unhandled로 낸다(`d1_migrations`가 없으면 kind=schema_drift)
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const requestId = request.headers.get("x-request-id") ?? undefined;

  const db = await getDB();
  const row = await db
    .prepare("SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1")
    .first<{ name: string }>();
  const actual = row?.name ?? null;
  const schema = compareSchema(actual);

  if (!schema.ok) {
    // 성공 이벤트(health.check)와 이름을 나눈다. verify --expect-event health.check가 실패를 "살아 있다"는 근거로 세지 않게 하려는 것이다
    logger.error("health.schema_drift", {
      requestId,
      method: request.method,
      path: request.nextUrl.pathname,
      ok: false,
      kind: "schema_drift",
      schemaState: schema.state,
      expected: EXPECTED_LATEST_MIGRATION,
      actual,
    });
    return NextResponse.json(
      { error: { code: "SERVICE_UNAVAILABLE", message: "서비스를 사용할 수 없습니다" } } satisfies ApiErrorResponse,
      { status: 503, headers: NO_STORE }
    );
  }

  if (schema.state === "ahead") {
    // "원격 마이그레이션 먼저, 배포 나중" 롤아웃 사이에도 생기는 상태라 응답은 200으로 두어 프로브 알림을 피한다.
    // 배포 뒤에도 이어지면(상수 갱신 누락·머지 안 된 브랜치 마이그레이션 적용) 알림 없이 묻히므로 warn으로 따로 남긴다
    logger.warn("health.schema_ahead", {
      requestId,
      schemaState: schema.state,
      expected: EXPECTED_LATEST_MIGRATION,
      actual,
    });
  }

  // ahead여도 health.check를 남긴다. verify --expect-event health.check의 근거는 "이 버전이 요청을 받았다"이고
  // 그것은 스키마가 앞서 있어도 참이다. 스키마 상태는 위 warn 이벤트가 맡으므로 여기에는 섞지 않는다
  logger.info("health.check", { requestId, ok: true });
  return NextResponse.json({ data: { ok: true } }, { headers: NO_STORE });
});
