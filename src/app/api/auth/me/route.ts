import { NextRequest, NextResponse } from "next/server";
import {
  getCurrentUser,
  rotateRefreshToken,
  signJwt,
  ACCESS_TOKEN_MAX_AGE,
  REFRESH_TOKEN_MAX_AGE,
  REFRESH_COOKIE_NAME,
  deleteSessionCookie,
  deleteRefreshCookie,
} from "@/lib/auth";
import { getDB, withErrorHandler } from "@/lib/db";
import type { MeResponse } from "@/types";

export const GET = withErrorHandler(async (request: NextRequest) => {
  let jwtUser = await getCurrentUser(request);
  let refreshedResponse: NextResponse | null = null;

  // Access token 만료 시 refresh 시도
  if (!jwtUser) {
    const refreshRaw = request.cookies.get(REFRESH_COOKIE_NAME)?.value;
    if (!refreshRaw) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "인증이 필요합니다" } },
        { status: 401 }
      );
    }

    const db = await getDB();
    const result = await rotateRefreshToken(db, refreshRaw);
    if (!result) {
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

    jwtUser = {
      userId: result.userId,
      chzzkUserId: result.chzzkUserId,
      nickname: result.nickname,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_MAX_AGE,
    };

    // 쿠키 설정을 위해 미리 response 준비 (나중에 body 설정)
    refreshedResponse = new NextResponse(null);
    refreshedResponse.cookies.set("session", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV !== "development",
      sameSite: "lax",
      path: "/",
      maxAge: ACCESS_TOKEN_MAX_AGE,
    });
    if (result.newRawToken) {
      refreshedResponse.cookies.set(REFRESH_COOKIE_NAME, result.newRawToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV !== "development",
        sameSite: "lax",
        path: "/",
        maxAge: REFRESH_TOKEN_MAX_AGE,
      });
    }
  }

  const db = await getDB();
  const user = await db
    .prepare(
      "SELECT id, chzzk_user_id, nickname, profile_image_url FROM users WHERE id = ?"
    )
    .bind(jwtUser.userId)
    .first<{ id: string; chzzk_user_id: string; nickname: string; profile_image_url: string | null }>();

  if (!user) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "사용자를 찾을 수 없습니다" } },
      { status: 404 }
    );
  }

  const data: MeResponse = {
    id: user.id,
    chzzkUserId: user.chzzk_user_id,
    nickname: user.nickname,
    profileImageUrl: user.profile_image_url,
  };

  // 갱신된 경우 새 쿠키와 함께 응답
  if (refreshedResponse) {
    const response = NextResponse.json({ data });
    for (const cookie of refreshedResponse.headers.getSetCookie()) {
      response.headers.append("Set-Cookie", cookie);
    }
    return response;
  }

  return NextResponse.json({ data });
});
