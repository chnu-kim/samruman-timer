import { NextRequest, NextResponse } from "next/server";
import { verifyJwt } from "@/lib/auth";

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
];

export async function middleware(request: NextRequest) {
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
  if (!token) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "인증이 필요합니다" } },
      { status: 401 }
    );
  }

  const payload = await verifyJwt(token);
  if (!payload) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "유효하지 않은 세션입니다" } },
      { status: 401 }
    );
  }

  // 검증된 JWT에서만 내부 헤더 설정
  headers.set("x-user-id", payload.userId);
  headers.set("x-user-chzzk-id", payload.chzzkUserId);
  headers.set("x-user-nickname", encodeURIComponent(payload.nickname));

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/api/:path*"],
};
