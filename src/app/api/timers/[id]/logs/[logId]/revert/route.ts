import { NextRequest, NextResponse } from "next/server";
import { getDB, withErrorHandler } from "@/lib/db";
import { calculateRemaining, detectExpiry, detectScheduledActivation, revertTimerLog, TimerStateError } from "@/lib/timer";
import type { Timer } from "@/types";

const LOG_ID_PATTERN = /^[0-9a-f]{32}$/;

/**
 * 시간 변경 기록 하나를 되돌린다(로그 취소 처리).
 * 반대 방향 modify가 아니라 그 기록의 변경량만 현재 잔여에서 되돌리고 기록에 reverted_at을 남긴다.
 * 응답 모양은 modify와 같아 클라이언트가 같은 경로로 화면에 반영한다.
 */
export const POST = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string; logId: string }> }
) => {
  const { id, logId } = await params;
  const userId = request.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "인증이 필요합니다" } },
      { status: 401 }
    );
  }
  if (!LOG_ID_PATTERN.test(logId)) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "유효하지 않은 기록 ID입니다" } },
      { status: 400 }
    );
  }

  const db = await getDB();

  const row = await db
    .prepare(
      `SELECT t.id, t.project_id, t.title, t.description,
              t.base_remaining_seconds, t.last_calculated_at, t.status,
              t.scheduled_start_at,
              t.created_by, t.created_at, t.updated_at,
              p.owner_user_id
       FROM timers t
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
      { error: { code: "FORBIDDEN", message: "프로젝트 소유자만 시간을 변경할 수 있습니다" } },
      { status: 403 }
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

  // 조회 시점 전이를 먼저 기록한다. 이미 0초가 된 RUNNING 타이머를 그대로 되돌리면 만료 기록이 빠진다
  const checked = await detectExpiry(db, await detectScheduledActivation(db, timer));

  let result: Awaited<ReturnType<typeof revertTimerLog>>;
  try {
    result = await revertTimerLog(db, checked, logId);
  } catch (err) {
    // 없는 기록·추가/차감이 아닌 기록·이미 되돌린 기록·삭제된 타이머
    if (err instanceof TimerStateError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: err.status }
      );
    }
    throw err;
  }

  const remainingSeconds =
    result.timer.status === "RUNNING"
      ? calculateRemaining(result.timer.baseRemainingSeconds, result.timer.lastCalculatedAt)
      : 0;

  return NextResponse.json({
    data: {
      id: result.timer.id,
      remainingSeconds,
      status: result.timer.status,
      log: result.log,
    },
  });
});
