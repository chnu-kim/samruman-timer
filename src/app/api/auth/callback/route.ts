import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, getUserInfo } from "@/lib/chzzk";
import { signJwt } from "@/lib/auth";
import { getDB, generateId, nowISO, withErrorHandler } from "@/lib/db";

export const GET = withErrorHandler(async (request: NextRequest) => {
  const baseUrl = process.env.BASE_URL!;
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const savedState = request.cookies.get("oauth_state")?.value;

  // state 검증
  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(`${baseUrl}/login?error=auth_failed`);
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

    // JWT 생성
    const token = await signJwt({
      userId: user.id,
      chzzkUserId: chzzkUser.id,
      nickname: chzzkUser.nickname,
    });

    // 리다이렉트 + 세션 쿠키 설정
    const response = NextResponse.redirect(`${baseUrl}/`);
    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV !== "development",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });
    response.cookies.delete("oauth_state");

    return response;
  } catch (error) {
    console.error("[Auth Callback Error]", error);
    return NextResponse.redirect(`${baseUrl}/login?error=auth_failed`);
  }
});
