import { NextResponse } from "next/server";
import { buildAuthorizationUrl } from "@/lib/chzzk";
import { withErrorHandler } from "@/lib/db";

export const GET = withErrorHandler(async () => {
  const state = crypto.randomUUID();

  const response = NextResponse.redirect(buildAuthorizationUrl(state));
  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  return response;
});
