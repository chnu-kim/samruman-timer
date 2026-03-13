import { NextRequest, NextResponse } from "next/server";
import {
  verifyJwt,
  signJwt,
  rotateRefreshToken,
  ACCESS_TOKEN_MAX_AGE,
  REFRESH_TOKEN_MAX_AGE,
  REFRESH_COOKIE_NAME,
  deleteSessionCookie,
  deleteRefreshCookie,
} from "@/lib/auth";
import { getDB } from "@/lib/db";
import { validateEnv } from "@/lib/env";

// 내부 전용 헤더 — 외부 요청에서 위조 방지를 위해 항상 삭제 후 재설정
const INTERNAL_HEADERS = ["x-user-id", "x-user-chzzk-id", "x-user-nickname"];

const PROTECTED_ROUTES: { method: string; pattern: RegExp }[] = [
  { method: "POST", pattern: /^\/api\/projects$/ },
  { method: "POST", pattern: /^\/api\/projects\/[^/]+\/timers$/ },
  { method: "POST", pattern: /^\/api\/timers\/[^/]+\/modify$/ },
  { method: "POST", pattern: /^\/api\/auth\/logout$/ },
  { method: "DELETE", pattern: /^\/api\/projects\/[^/]+$/ },
  { method: "DELETE", pattern: /^\/api\/timers\/[^/]+$/ },
  { method: "PATCH", pattern: /^\/api\/projects\/[^/]+$/ },
  { method: "PATCH", pattern: /^\/api\/timers\/[^/]+$/ },
  { method: "GET", pattern: /^\/api\/projects\/mine$/ },
  { method: "GET", pattern: /^\/api\/projects\/others$/ },
  { method: "GET", pattern: /^\/api\/projects\/[^/]+\/stats$/ },
  { method: "PUT", pattern: /^\/api\/timers\/[^/]+\/overlay-settings$/ },
  { method: "GET", pattern: /^\/api\/timers\/[^/]+\/stats$/ },
  { method: "POST", pattern: /^\/api\/projects\/[^/]+\/goals$/ },
  { method: "PATCH", pattern: /^\/api\/projects\/[^/]+\/goals\/[^/]+$/ },
];

export async function middleware(request: NextRequest) {
  validateEnv();

  const method = request.method;
  const { pathname } = request.nextUrl;

  // [#1] 내부 헤더를 항상 삭제하여 외부 위조 방지
  const headers = new Headers(request.headers);
  for (const h of INTERNAL_HEADERS) {
    headers.delete(h);
  }

  // 요청 추적용 requestId 생성
  const requestId = crypto.randomUUID();
  headers.set("x-request-id", requestId);

  const isProtected = PROTECTED_ROUTES.some(
    (route) => route.method === method && route.pattern.test(pathname)
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
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "인증이 필요합니다" } },
      { status: 401 }
    );
  }

  // Refresh token rotation
  try {
    const db = await getDB();
    const result = await rotateRefreshToken(db, refreshToken);

    if (!result) {
      // 갱신 실패 → 401 + 두 쿠키 삭제
      const response = NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "유효하지 않은 세션입니다" } },
        { status: 401 }
      );
      response.headers.append("Set-Cookie", deleteSessionCookie());
      response.headers.append("Set-Cookie", deleteRefreshCookie());
      return response;
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
    console.error("[middleware] refresh token rotation failed:", err);
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "유효하지 않은 세션입니다" } },
      { status: 401 }
    );
  }
}

export const config = {
  matcher: ["/api/:path*"],
};
