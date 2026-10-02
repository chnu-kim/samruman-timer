import { NextRequest, NextResponse } from "next/server";
import { buildAuthorizationUrl } from "@/lib/chzzk";
import { withErrorHandler } from "@/lib/db";
import { NEXT_COOKIE_NAME, sanitizeNextPath } from "@/lib/safe-redirect";

export const GET = withErrorHandler(async (request: NextRequest) => {
  const state = crypto.randomUUID();
  // 로그인 후 돌아갈 경로. 같은 출처의 상대 경로만 받아 콜백까지 쿠키로 들고 간다
  const next = sanitizeNextPath(request.nextUrl.searchParams.get("next"));

  const response = NextResponse.redirect(buildAuthorizationUrl(state));
  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });
  if (next) {
    response.cookies.set(NEXT_COOKIE_NAME, next, {
      httpOnly: true,
      secure: process.env.NODE_ENV !== "development",
      sameSite: "lax",
      path: "/",
      maxAge: 600, // oauth_state와 같은 수명
    });
  } else {
    // 중단된 이전 로그인 시도의 next가 다음 로그인을 엉뚱한 곳으로 보내지 않게 지운다
    response.cookies.delete(NEXT_COOKIE_NAME);
  }

  return response;
});
