import { NextRequest, NextResponse } from "next/server";
import { getDB, generateId, nowISO, withErrorHandler } from "@/lib/db";
import { calculateRemaining } from "@/lib/timer";

export const GET = withErrorHandler(async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const db = await getDB();

  const row = await db
    .prepare(
      `SELECT p.id, p.name, p.description, p.status, p.created_at, p.updated_at,
              u.id AS owner_id, u.nickname AS owner_nickname, u.profile_image_url AS owner_profile_image_url
       FROM projects p
       JOIN users u ON u.id = p.owner_user_id
       WHERE p.id = ?`
    )
    .bind(id)
    .first<{
      id: string;
      name: string;
      description: string | null;
      status: string;
      created_at: string;
      updated_at: string;
      owner_id: string;
      owner_nickname: string;
      owner_profile_image_url: string | null;
    }>();

  if (!row || row.status === "DELETED") {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "프로젝트를 찾을 수 없습니다" } },
      { status: 404 }
    );
  }

  return NextResponse.json({
    data: {
      id: row.id,
      name: row.name,
      description: row.description,
      owner: {
        id: row.owner_id,
        nickname: row.owner_nickname,
        profileImageUrl: row.owner_profile_image_url,
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
});

export const DELETE = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const userId = request.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "인증이 필요합니다" } },
      { status: 401 }
    );
  }

  const db = await getDB();

  const row = await db
    .prepare("SELECT id, owner_user_id, status FROM projects WHERE id = ?")
    .bind(id)
    .first<{ id: string; owner_user_id: string; status: string }>();

  if (!row || row.status === "DELETED") {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "프로젝트를 찾을 수 없습니다" } },
      { status: 404 }
    );
  }
  if (row.owner_user_id !== userId) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "프로젝트 소유자만 삭제할 수 있습니다" } },
      { status: 403 }
    );
  }

  const now = nowISO();
  const rawNickname = request.headers.get("x-user-nickname") ?? "unknown";
  let nickname: string;
  try {
    nickname = decodeURIComponent(rawNickname);
  } catch {
    nickname = rawNickname;
  }

  // 하위 비삭제 타이머 조회
  const timers = await db
    .prepare(
      "SELECT id, base_remaining_seconds, last_calculated_at, status FROM timers WHERE project_id = ? AND status != 'DELETED'"
    )
    .bind(id)
    .all<{
      id: string;
      base_remaining_seconds: number;
      last_calculated_at: string;
      status: string;
    }>();

  // 배치 쿼리 구성
  const statements = [
    // 프로젝트 소프트 삭제
    db.prepare("UPDATE projects SET status = 'DELETED', updated_at = ? WHERE id = ?").bind(now, id),
    // 하위 타이머 일괄 소프트 삭제
    db.prepare("UPDATE timers SET status = 'DELETED', updated_at = ? WHERE project_id = ? AND status != 'DELETED'").bind(now, id),
  ];

  // 각 타이머에 대한 DELETE 로그 기록
  for (const timer of timers.results) {
    const logId = generateId();
    const beforeSeconds = timer.status === "RUNNING"
      ? calculateRemaining(timer.base_remaining_seconds, timer.last_calculated_at)
      : timer.status === "SCHEDULED"
      ? timer.base_remaining_seconds
      : 0;

    statements.push(
      db.prepare(
        "INSERT INTO timer_logs (id, timer_id, action_type, actor_name, actor_user_id, delta_seconds, before_seconds, after_seconds, created_at) VALUES (?, ?, 'DELETE', ?, ?, 0, ?, 0, ?)"
      ).bind(logId, timer.id, nickname, userId, beforeSeconds, now)
    );
  }

  await db.batch(statements);

  return NextResponse.json({
    data: { id },
  });
});
