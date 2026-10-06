import { NextRequest, NextResponse } from "next/server";
import {
  verifyJwt,
  signJwt,
  rotateRefreshToken,
  ACCESS_TOKEN_MAX_AGE,
  REFRESH_TOKEN_MAX_AGE,
  REFRESH_COOKIE_NAME,
} from "@/lib/auth";
import { getDB } from "@/lib/db";
import { EnvValidationError, validateEnv } from "@/lib/env";
import { errorFields, logger } from "@/lib/logger";

// 내부 전용 헤더 — 외부 요청에서 위조 방지를 위해 항상 삭제 후 재설정
const INTERNAL_HEADERS = ["x-user-id", "x-user-chzzk-id", "x-user-nickname"];

// POST /api/auth/logout은 일부러 제외한다. 보호하면 access 만료 상태의 로그아웃에서
// middleware가 rotation한 새 session 쿠키가 라우트의 삭제 쿠키를 덮어써 로그인이 유지된다.
// 로그아웃 라우트가 session·refresh 쿠키를 직접 확인한다.
const PROTECTED_ROUTES: { method: string; pattern: RegExp }[] = [
  { method: "POST", pattern: /^\/api\/projects$/ },
  { method: "POST", pattern: /^\/api\/projects\/[^/]+\/timers$/ },
  { method: "POST", pattern: /^\/api\/timers\/[^/]+\/modify$/ },
  { method: "POST", pattern: /^\/api\/timers\/[^/]+\/activate$/ },
  { method: "POST", pattern: /^\/api\/timers\/[^/]+\/logs\/[^/]+\/revert$/ },
  { method: "GET", pattern: /^\/api\/auth\/me$/ },
  { method: "DELETE", pattern: /^\/api\/projects\/[^/]+$/ },
  { method: "DELETE", pattern: /^\/api\/timers\/[^/]+$/ },
  { method: "PATCH", pattern: /^\/api\/projects\/[^/]+$/ },
  { method: "PATCH", pattern: /^\/api\/timers\/[^/]+$/ },
  { method: "GET", pattern: /^\/api\/projects\/mine$/ },
  { method: "PUT", pattern: /^\/api\/timers\/[^/]+\/overlay-settings$/ },
  { method: "GET", pattern: /^\/api\/timers\/[^/]+\/stats$/ },
  { method: "POST", pattern: /^\/api\/projects\/[^/]+\/goals$/ },
  { method: "PATCH", pattern: /^\/api\/projects\/[^/]+\/goals\/[^/]+$/ },
  { method: "DELETE", pattern: /^\/api\/projects\/[^/]+\/goals\/[^/]+$/ },
];

function withRequestId<T extends Response>(response: T, requestId: string): T {
  response.headers.set("x-request-id", requestId);
  return response;
}

function internalError(): NextResponse {
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "서버 오류가 발생했습니다" } },
    { status: 500 }
  );
}

/**
 * 모든 반환 응답에 x-request-id를 붙인다. NextResponse.next()의 응답 헤더는 라우트 응답에 합쳐지므로
 * withErrorHandler의 500을 포함한 라우트 응답 전체에서 사용자 신고와 운영 로그를 잇는 키가 된다.
 * 들어온 x-request-id는 신뢰하지 않고 항상 새로 만든다.
 */
export async function middleware(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const method = request.method;
  // 쿼리스트링(OAuth code 등)은 로그에 남기지 않는다
  const path = request.nextUrl.pathname;

  try {
    validateEnv();
  } catch (err) {
    // 검증 성공 시에만 결과를 캐시하므로, 설정이 고쳐질 때까지 요청마다 한 건씩 남는다
    logger.error("env.invalid", {
      requestId,
      method,
      path,
      invalid: err instanceof EnvValidationError ? err.invalid : undefined,
    });
    return withRequestId(internalError(), requestId);
  }

  return withRequestId(await handle(request, requestId, method, path), requestId);
}

async function handle(
  request: NextRequest,
  requestId: string,
  method: string,
  path: string
): Promise<NextResponse> {
  // [#1] 내부 헤더를 항상 삭제하여 외부 위조 방지
  const headers = new Headers(request.headers);
  for (const h of INTERNAL_HEADERS) {
    headers.delete(h);
  }
  headers.set("x-request-id", requestId);

  const isProtected = PROTECTED_ROUTES.some(
    (route) => route.method === method && route.pattern.test(path)
  );
  if (!isProtected) {
    return NextResponse.next({ request: { headers } });
  }

  const token = request.cookies.get("session")?.value;
  const payload = token ? await verifyJwt(token) : null;

  if (payload) {
    // 유효한 access token → 기존 로직
    headers.set("x-user-id", payload.userId);
    headers.set("x-user-chzzk-id", payload.chzzkUserId);
    headers.set("x-user-nickname", encodeURIComponent(payload.nickname));
    return NextResponse.next({ request: { headers } });
  }

  // Access token 없거나 만료 → refresh 시도
  const refreshToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value;
  if (!refreshToken) {
    // 로그아웃 상태의 정상 흐름이고 양이 많아 로그를 남기지 않는다
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "인증이 필요합니다" } },
      { status: 401 }
    );
  }

  // Refresh token rotation
  try {
    const db = await getDB();
    const result = await rotateRefreshToken(db, refreshToken);

    if (!result.ok) {
      if (result.reason === "reuse_detected") {
        // 탈취 의심: family 전체가 폐기됐다
        logger.warn("auth.refresh.reuse_detected", {
          requestId,
          method,
          path,
          userId: result.userId,
          familyId: result.familyId,
        });
      } else {
        logger.info("auth.refresh.rejected", { requestId, method, path, reason: result.reason });
      }
      // 갱신 실패 → 401 반환 (쿠키 삭제는 로그아웃에서만 수행).
      // refresh 쿠키가 없는 로그아웃 상태(UNAUTHORIZED)와 코드를 나눠, 화면이 '로그인 필요'와 '세션 만료'를 구분하게 한다
      return NextResponse.json(
        { error: { code: "SESSION_EXPIRED", message: "유효하지 않은 세션입니다" } },
        { status: 401 }
      );
    }

    // 새 access token 발급
    const newAccessToken = await signJwt({
      userId: result.userId,
      chzzkUserId: result.chzzkUserId,
      nickname: result.nickname,
    });

    // 헤더 주입
    headers.set("x-user-id", result.userId);
    headers.set("x-user-chzzk-id", result.chzzkUserId);
    headers.set("x-user-nickname", encodeURIComponent(result.nickname));

    const response = NextResponse.next({ request: { headers } });

    // 새 access token 쿠키 설정
    response.cookies.set("session", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV !== "development",
      sameSite: "lax",
      path: "/",
      maxAge: ACCESS_TOKEN_MAX_AGE,
    });

    // Race condition grace가 아닌 경우에만 refresh token 갱신
    if (result.newRawToken) {
      response.cookies.set(REFRESH_COOKIE_NAME, result.newRawToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV !== "development",
        sameSite: "lax",
        path: "/",
        maxAge: REFRESH_TOKEN_MAX_AGE,
      });
    }

    return response;
  } catch (err) {
    // D1 장애·서명 실패 같은 인프라 오류. 401로 내면 "세션 만료"로 가려지므로 500으로 드러낸다
    logger.error("auth.refresh.failed", { requestId, method, path, ...errorFields(err) });
    return internalError();
  }
}

export const config = {
  matcher: ["/api/:path*"],
};
