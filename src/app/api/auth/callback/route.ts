import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, getUserInfo } from "@/lib/chzzk";
import {
  signJwt,
  generateRefreshToken,
  hashToken,
  createRefreshTokenInDB,
  ACCESS_TOKEN_MAX_AGE,
  REFRESH_TOKEN_MAX_AGE,
  REFRESH_COOKIE_NAME,
} from "@/lib/auth";
import { getDB, generateId, nowISO, withErrorHandler } from "@/lib/db";
import { logger } from "@/lib/logger";
import { NEXT_COOKIE_NAME, sanitizeNextPath } from "@/lib/safe-redirect";

/** 로그인 시작 때 저장한 next로 돌아갈 주소를 만든다. 쿠키 값도 다시 검증하고, 출처가 BASE_URL과 같을 때만 쓴다 */
function resolveRedirect(baseUrl: string, rawNext: string | undefined): string {
  const next = sanitizeNextPath(rawNext);
  if (!next) return `${baseUrl}/`;
  const target = new URL(next, baseUrl);
  return target.origin === new URL(baseUrl).origin ? target.toString() : `${baseUrl}/`;
}

function failureRedirect(baseUrl: string): NextResponse {
  const response = NextResponse.redirect(`${baseUrl}/login?error=auth_failed`);
  response.cookies.delete(NEXT_COOKIE_NAME);
  return response;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const baseUrl = process.env.BASE_URL!;
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const savedState = request.cookies.get("oauth_state")?.value;

  // state 검증
  if (!code || !state || state !== savedState) {
    return failureRedirect(baseUrl);
  }

  try {
    // 토큰 교환
    const tokenRes = await exchangeCode(code, state);

    // 사용자 정보 조회
    const chzzkUser = await getUserInfo(tokenRes.accessToken);

    // DB upsert
    const db = await getDB();
    const now = nowISO();

    let user = await db
      .prepare("SELECT id, nickname, profile_image_url FROM users WHERE chzzk_user_id = ?")
      .bind(chzzkUser.id)
      .first<{ id: string; nickname: string; profile_image_url: string | null }>();

    if (user) {
      await db
        .prepare(
          "UPDATE users SET nickname = ?, profile_image_url = ?, updated_at = ? WHERE id = ?"
        )
        .bind(chzzkUser.nickname, chzzkUser.profileImageUrl, now, user.id)
        .run();
    } else {
      const id = generateId();
      await db
        .prepare(
          "INSERT INTO users (id, chzzk_user_id, nickname, profile_image_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(id, chzzkUser.id, chzzkUser.nickname, chzzkUser.profileImageUrl, now, now)
        .run();
      user = { id, nickname: chzzkUser.nickname, profile_image_url: chzzkUser.profileImageUrl };
    }

    // JWT 생성 (access token)
    const accessToken = await signJwt({
      userId: user.id,
      chzzkUserId: chzzkUser.id,
      nickname: chzzkUser.nickname,
    });

    // Refresh token 생성
    const rawRefreshToken = generateRefreshToken();
    const refreshTokenHash = await hashToken(rawRefreshToken);
    const familyId = generateId();
    await createRefreshTokenInDB(db, user.id, refreshTokenHash, familyId);

    // 리다이렉트 + 두 쿠키 설정. 세션 만료로 다시 로그인한 경우 보던 화면(next)으로 돌려보낸다
    const response = NextResponse.redirect(
      resolveRedirect(baseUrl, request.cookies.get(NEXT_COOKIE_NAME)?.value),
    );
    response.cookies.set("session", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV !== "development",
      sameSite: "lax",
      path: "/",
      maxAge: ACCESS_TOKEN_MAX_AGE,
    });
    response.cookies.set(REFRESH_COOKIE_NAME, rawRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV !== "development",
      sameSite: "lax",
      path: "/",
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });
    response.cookies.delete("oauth_state");
    response.cookies.delete(NEXT_COOKIE_NAME);

    return response;
  } catch (error) {
    logger.error("Auth callback failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return failureRedirect(baseUrl);
  }
});
