import { NextRequest, NextResponse } from "next/server";
import {
  getCurrentUser,
  deleteSessionCookie,
  deleteRefreshCookie,
  hashToken,
  revokeRefreshTokenFamily,
  REFRESH_COOKIE_NAME,
} from "@/lib/auth";
import { getDB, withErrorHandler } from "@/lib/db";
import { errorFields, logger } from "@/lib/logger";
import type { RefreshTokenRow } from "@/types";

export const POST = withErrorHandler(async (request: NextRequest) => {
  // access token 만료 상태에서도 로그아웃 가능하도록 유연하게 처리
  const user = await getCurrentUser(request);
  const refreshRaw = request.cookies.get(REFRESH_COOKIE_NAME)?.value;

  // access token도 없고 refresh token도 없으면 인증 실패
  if (!user && !refreshRaw) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "인증이 필요합니다" } },
      { status: 401 }
    );
  }

  // Refresh token이 있으면 family 전체 폐기
  if (refreshRaw) {
    try {
      const db = await getDB();
      const tokenHash = await hashToken(refreshRaw);
      const row = await db
        .prepare("SELECT family_id FROM refresh_tokens WHERE token_hash = ?")
        .bind(tokenHash)
        .first<Pick<RefreshTokenRow, "family_id">>();

      if (row) {
        await revokeRefreshTokenFamily(db, row.family_id);
      }
    } catch (err) {
      // 폐기 실패해도 로그아웃은 진행한다. family가 살아남으므로 신호를 남긴다
      logger.error("auth.logout.revoke_failed", {
        requestId: request.headers.get("x-request-id") ?? undefined,
        method: request.method,
        path: request.nextUrl.pathname,
        ...errorFields(err),
      });
    }
  }

  const response = NextResponse.json({ data: null });
  response.headers.append("Set-Cookie", deleteSessionCookie());
  response.headers.append("Set-Cookie", deleteRefreshCookie());
  return response;
});
