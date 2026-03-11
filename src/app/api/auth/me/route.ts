import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDB, withErrorHandler } from "@/lib/db";
import type { MeResponse } from "@/types";

export const GET = withErrorHandler(async (request: NextRequest) => {
  const jwtUser = await getCurrentUser(request);
  if (!jwtUser) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "인증이 필요합니다" } },
      { status: 401 }
    );
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

  return NextResponse.json({ data });
});
