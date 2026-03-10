import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, deleteSessionCookie } from "@/lib/auth";
import { withErrorHandler } from "@/lib/db";

export const POST = withErrorHandler(async (request: NextRequest) => {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "인증이 필요합니다" } },
      { status: 401 }
    );
  }

  const response = NextResponse.json({ data: null });
  response.headers.set("Set-Cookie", deleteSessionCookie());
  return response;
});
