import { NextRequest, NextResponse } from "next/server";
import { getDB, generateId, nowISO, withErrorHandler } from "@/lib/db";
import { parseProjectListParams, queryProjects } from "./_shared";
import type { CreateProjectRequest } from "@/types";

export const GET = withErrorHandler(async (request: NextRequest) => {
  const db = await getDB();
  const params = parseProjectListParams(request.nextUrl.searchParams);
  const result = await queryProjects(db, params);
  return NextResponse.json({ data: result });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const userId = request.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "인증이 필요합니다" } },
      { status: 401 }
    );
  }

  let body: CreateProjectRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "유효한 JSON 본문이 필요합니다" } },
      { status: 400 }
    );
  }

  if (typeof body.name !== "string" || body.name.length < 1 || body.name.length > 100) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "name은 1~100자 문자열이어야 합니다" } },
      { status: 400 }
    );
  }
  if (body.description !== undefined && (typeof body.description !== "string" || body.description.length > 500)) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "description은 최대 500자 문자열이어야 합니다" } },
      { status: 400 }
    );
  }

  const db = await getDB();
  const id = generateId();
  const now = nowISO();

  await db
    .prepare(
      "INSERT INTO projects (id, name, description, owner_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(id, body.name, body.description ?? null, userId, now, now)
    .run();

  return NextResponse.json(
    {
      data: {
        id,
        name: body.name,
        description: body.description ?? null,
        ownerUserId: userId,
        createdAt: now,
      },
    },
    { status: 201 }
  );
});
