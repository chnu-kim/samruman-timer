import { NextRequest, NextResponse } from "next/server";
import { getDB, generateId, nowISO, withErrorHandler } from "@/lib/db";
import type { CreateProjectRequest } from "@/types";

export const GET = withErrorHandler(async () => {
  const db = await getDB();

  const rows = await db
    .prepare(
      `SELECT p.id, p.name, p.description, u.nickname AS owner_nickname,
              (SELECT COUNT(*) FROM timers t WHERE t.project_id = p.id AND t.status != 'DELETED') AS timer_count,
              p.created_at
       FROM projects p
       JOIN users u ON u.id = p.owner_user_id
       WHERE p.status != 'DELETED'
       ORDER BY p.created_at DESC`
    )
    .all<{
      id: string;
      name: string;
      description: string | null;
      owner_nickname: string;
      timer_count: number;
      created_at: string;
    }>();

  const data = rows.results.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    ownerNickname: r.owner_nickname,
    timerCount: r.timer_count,
    createdAt: r.created_at,
  }));

  return NextResponse.json({ data });
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
