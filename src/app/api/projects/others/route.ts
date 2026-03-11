import { NextRequest, NextResponse } from "next/server";
import { getDB, withErrorHandler } from "@/lib/db";
import { parseProjectListParams, queryProjects } from "../_shared";

export const GET = withErrorHandler(async (request: NextRequest) => {
  const userId = request.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "인증이 필요합니다" } },
      { status: 401 }
    );
  }

  const db = await getDB();
  const params = parseProjectListParams(request.nextUrl.searchParams);
  const result = await queryProjects(db, params, { userId, mode: "exclude" });
  return NextResponse.json({ data: result });
});
