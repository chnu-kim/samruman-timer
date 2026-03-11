import { NextRequest, NextResponse } from "next/server";
import { getDB, generateId, nowISO, withErrorHandler } from "@/lib/db";
import { calculateRemaining, detectExpiry, detectScheduledActivation } from "@/lib/timer";
import type { Timer } from "@/types";

export const GET = withErrorHandler(async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const db = await getDB();

  const row = await db
    .prepare(
      `SELECT t.id, t.project_id, t.title, t.description,
              t.base_remaining_seconds, t.last_calculated_at, t.status,
              t.scheduled_start_at,
              t.created_by, t.created_at, t.updated_at,
              u.id AS creator_id, u.nickname AS creator_nickname,
              p.owner_user_id
       FROM timers t
       JOIN users u ON u.id = t.created_by
       JOIN projects p ON p.id = t.project_id
       WHERE t.id = ?`
    )
    .bind(id)
    .first<{
      id: string;
      project_id: string;
      title: string;
      description: string | null;
      base_remaining_seconds: number;
      last_calculated_at: string;
      status: string;
      scheduled_start_at: string | null;
      created_by: string;
      created_at: string;
      updated_at: string;
      creator_id: string;
      creator_nickname: string;
      owner_user_id: string;
    }>();

  if (!row || row.status === "DELETED") {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "타이머를 찾을 수 없습니다" } },
      { status: 404 }
    );
  }

  const timer: Timer = {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    baseRemainingSeconds: row.base_remaining_seconds,
    lastCalculatedAt: row.last_calculated_at,
    status: row.status as Timer["status"],
    scheduledStartAt: row.scheduled_start_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  // 예약 활성화 감지 → 만료 감지 (SCHEDULED→RUNNING→EXPIRED 체이닝)
  const activated = await detectScheduledActivation(db, timer);
  const checked = await detectExpiry(db, activated);

  const remainingSeconds =
    checked.status === "RUNNING"
      ? calculateRemaining(checked.baseRemainingSeconds, checked.lastCalculatedAt)
      : checked.status === "SCHEDULED"
      ? checked.baseRemainingSeconds
      : 0;

  return NextResponse.json({
    data: {
      id: checked.id,
      projectId: checked.projectId,
      title: checked.title,
      description: checked.description,
      remainingSeconds,
      status: checked.status,
      scheduledStartAt: checked.scheduledStartAt,
      createdBy: {
        id: row.creator_id,
        nickname: row.creator_nickname,
      },
      projectOwnerId: row.owner_user_id,
      createdAt: checked.createdAt,
      updatedAt: checked.updatedAt,
    },
  });
});

export const PATCH = withErrorHandler(async (
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
    .prepare(
      `SELECT t.id, t.status, p.owner_user_id
       FROM timers t
       JOIN projects p ON p.id = t.project_id
       WHERE t.id = ?`
    )
    .bind(id)
    .first<{ id: string; status: string; owner_user_id: string }>();

  if (!row || row.status === "DELETED") {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "타이머를 찾을 수 없습니다" } },
      { status: 404 }
    );
  }
  if (row.owner_user_id !== userId) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "프로젝트 소유자만 타이머를 수정할 수 있습니다" } },
      { status: 403 }
    );
  }

  let body: { title?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "유효한 JSON 본문이 필요합니다" } },
      { status: 400 }
    );
  }
  const updates: string[] = [];
  const binds: (string | null)[] = [];

  if (body.title !== undefined) {
    const title = body.title.trim();
    if (!title) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "타이머 제목은 비어있을 수 없습니다" } },
        { status: 400 }
      );
    }
    updates.push("title = ?");
    binds.push(title);
  }
  if (body.description !== undefined) {
    updates.push("description = ?");
    binds.push(body.description.trim() || null);
  }

  if (updates.length === 0) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "변경할 필드가 없습니다" } },
      { status: 400 }
    );
  }

  const now = nowISO();
  updates.push("updated_at = ?");
  binds.push(now);
  binds.push(id);

  await db
    .prepare(`UPDATE timers SET ${updates.join(", ")} WHERE id = ?`)
    .bind(...binds)
    .run();

  const updated = await db
    .prepare(
      `SELECT t.id, t.project_id, t.title, t.description,
              t.base_remaining_seconds, t.last_calculated_at, t.status,
              t.scheduled_start_at, t.created_at, t.updated_at,
              u.id AS creator_id, u.nickname AS creator_nickname,
              p.owner_user_id
       FROM timers t
       JOIN users u ON u.id = t.created_by
       JOIN projects p ON p.id = t.project_id
       WHERE t.id = ?`
    )
    .bind(id)
    .first<{
      id: string;
      project_id: string;
      title: string;
      description: string | null;
      base_remaining_seconds: number;
      last_calculated_at: string;
      status: string;
      scheduled_start_at: string | null;
      created_at: string;
      updated_at: string;
      creator_id: string;
      creator_nickname: string;
      owner_user_id: string;
    }>();

  const timer: Timer = {
    id: updated!.id,
    projectId: updated!.project_id,
    title: updated!.title,
    description: updated!.description,
    baseRemainingSeconds: updated!.base_remaining_seconds,
    lastCalculatedAt: updated!.last_calculated_at,
    status: updated!.status as Timer["status"],
    scheduledStartAt: updated!.scheduled_start_at,
    createdBy: userId,
    createdAt: updated!.created_at,
    updatedAt: updated!.updated_at,
  };

  const remainingSeconds =
    timer.status === "RUNNING"
      ? calculateRemaining(timer.baseRemainingSeconds, timer.lastCalculatedAt)
      : timer.status === "SCHEDULED"
      ? timer.baseRemainingSeconds
      : 0;

  return NextResponse.json({
    data: {
      id: timer.id,
      projectId: timer.projectId,
      title: timer.title,
      description: timer.description,
      remainingSeconds,
      status: timer.status,
      scheduledStartAt: timer.scheduledStartAt,
      createdBy: {
        id: updated!.creator_id,
        nickname: updated!.creator_nickname,
      },
      projectOwnerId: updated!.owner_user_id,
      createdAt: timer.createdAt,
      updatedAt: timer.updatedAt,
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
    .prepare(
      `SELECT t.id, t.base_remaining_seconds, t.last_calculated_at, t.status,
              p.owner_user_id
       FROM timers t
       JOIN projects p ON p.id = t.project_id
       WHERE t.id = ?`
    )
    .bind(id)
    .first<{
      id: string;
      base_remaining_seconds: number;
      last_calculated_at: string;
      status: string;
      owner_user_id: string;
    }>();

  if (!row || row.status === "DELETED") {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "타이머를 찾을 수 없습니다" } },
      { status: 404 }
    );
  }
  if (row.owner_user_id !== userId) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "프로젝트 소유자만 타이머를 삭제할 수 있습니다" } },
      { status: 403 }
    );
  }

  const logId = generateId();
  const now = nowISO();
  const rawNickname = request.headers.get("x-user-nickname") ?? "unknown";
  let nickname: string;
  try {
    nickname = decodeURIComponent(rawNickname);
  } catch {
    nickname = rawNickname;
  }

  const beforeSeconds = row.status === "RUNNING"
    ? calculateRemaining(row.base_remaining_seconds, row.last_calculated_at)
    : row.status === "SCHEDULED"
    ? row.base_remaining_seconds
    : 0;

  await db.batch([
    db
      .prepare(
        "UPDATE timers SET status = 'DELETED', updated_at = ? WHERE id = ?"
      )
      .bind(now, id),
    db
      .prepare(
        "INSERT INTO timer_logs (id, timer_id, action_type, actor_name, actor_user_id, delta_seconds, before_seconds, after_seconds, created_at) VALUES (?, ?, 'DELETE', ?, ?, 0, ?, 0, ?)"
      )
      .bind(logId, id, nickname, userId, beforeSeconds, now),
  ]);

  return NextResponse.json({
    data: { id },
  });
});
