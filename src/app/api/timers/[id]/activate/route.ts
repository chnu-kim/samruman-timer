import { NextRequest, NextResponse } from "next/server";
import { getDB, withErrorHandler } from "@/lib/db";
import { activateTimerNow, calculateRemaining, detectScheduledActivation, ALREADY_STARTED_MESSAGE, TimerStateError } from "@/lib/timer";
import type { Timer, TimerModifyResponse } from "@/types";

const ID_PATTERN = /^[0-9a-f]{32}$/;

/** 예약 타이머를 예약 시각 전에 지금 시작한다. 응답은 시간 변경(modify)과 같은 형태다 */
export const POST = withErrorHandler(async (
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
  if (!ID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "유효하지 않은 타이머 ID입니다" } },
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
      { error: { code: "FORBIDDEN", message: "프로젝트 소유자만 타이머를 시작할 수 있습니다" } },
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

  // 예약 시각이 이미 지났다면 그 시각 기준의 자동 활성화가 맞다. 지금 시각으로 다시 시작하지 않는다
  const checked = await detectScheduledActivation(db, timer);
  if (checked.status !== "SCHEDULED") {
    const status = checked.status === "DELETED" ? 404 : 409;
    return NextResponse.json(
      {
        error: status === 404
          ? { code: "NOT_FOUND", message: "타이머를 찾을 수 없습니다" }
          : { code: "CONFLICT", message: ALREADY_STARTED_MESSAGE },
      },
      { status }
    );
  }

  const rawNickname = request.headers.get("x-user-nickname") ?? "unknown";
  let nickname: string;
  try {
    nickname = decodeURIComponent(rawNickname);
  } catch {
    nickname = rawNickname;
  }

  let result: Awaited<ReturnType<typeof activateTimerNow>>;
  try {
    result = await activateTimerNow(db, checked, nickname, userId);
  } catch (err) {
    if (err instanceof TimerStateError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: err.status }
      );
    }
    throw err;
  }

  const { timer: activated, log } = result;
  const data: TimerModifyResponse = {
    id: activated.id,
    remainingSeconds: calculateRemaining(activated.baseRemainingSeconds, activated.lastCalculatedAt),
    status: activated.status,
    log: {
      id: log.id,
      actionType: log.actionType,
      actorName: log.actorName,
      actorUserId: log.actorUserId,
      deltaSeconds: log.deltaSeconds,
      beforeSeconds: log.beforeSeconds,
      afterSeconds: log.afterSeconds,
      createdAt: log.createdAt,
    },
  };

  return NextResponse.json({ data });
});
