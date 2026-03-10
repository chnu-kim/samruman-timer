import { NextRequest, NextResponse } from "next/server";
import { getDB, withErrorHandler } from "@/lib/db";
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
              u.id AS creator_id, u.nickname AS creator_nickname
       FROM timers t
       JOIN users u ON u.id = t.created_by
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
    }>();

  if (!row) {
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
      createdAt: checked.createdAt,
      updatedAt: checked.updatedAt,
    },
  });
});
