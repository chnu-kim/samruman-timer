import { NextRequest, NextResponse } from "next/server";
import { getDB, withErrorHandler } from "@/lib/db";
import { activateTimerNow, calculateRemaining, TimerStateError } from "@/lib/timer";
import type { ActionType, Timer, TimerLog, TimerLogResponse, TimerModifyResponse } from "@/types";

const ID_PATTERN = /^[0-9a-f]{32}$/;

/**
 * 예약 타이머를 예약 시각 전에 지금 시작한다. 응답은 시간 변경(modify)과 같은 형태다.
 * 이미 시작된 타이머(예약 시각 경과로 자동 활성화, 다른 탭에서 먼저 시작)면 쓰지 않고 현재 상태와 마지막 로그로 200을 돌려준다.
 * 요청자의 목적(타이머가 돌고 있음)은 이미 이뤄졌고, 화면이 그 응답으로 곧바로 실행 중 상태로 바뀌게 하기 위해서다
 */
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

  const rawNickname = request.headers.get("x-user-nickname") ?? "unknown";
  let nickname: string;
  try {
    nickname = decodeURIComponent(rawNickname);
  } catch {
    nickname = rawNickname;
  }

  let result: Awaited<ReturnType<typeof activateTimerNow>>;
  try {
    result = await activateTimerNow(db, timer, nickname, userId);
  } catch (err) {
    if (err instanceof TimerStateError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: err.status }
      );
    }
    throw err;
  }

  const { timer: current } = result;
  const log: TimerLog | TimerLogResponse | null = result.log ?? (await latestLog(db, current.id));
  if (!log) {
    // 로그가 없는 타이머는 없다(생성 때 CREATE). 방어적으로만 둔다
    return NextResponse.json(
      { error: { code: "CONFLICT", message: "타이머 상태를 확인하지 못했습니다" } },
      { status: 409 }
    );
  }
  const data: TimerModifyResponse = {
    id: current.id,
    remainingSeconds: current.status === "RUNNING"
      ? calculateRemaining(current.baseRemainingSeconds, current.lastCalculatedAt)
      : 0,
    status: current.status,
    updatedAt: current.updatedAt,
    log: {
      id: log.id,
      actionType: log.actionType,
      actorName: log.actorName,
      actorUserId: log.actorUserId,
      deltaSeconds: log.deltaSeconds,
      beforeSeconds: log.beforeSeconds,
      afterSeconds: log.afterSeconds,
      createdAt: log.createdAt,
      revertedAt: log.revertedAt ?? null,
    },
  };

  return NextResponse.json({ data });
});

async function latestLog(db: D1Database, timerId: string): Promise<TimerLogResponse | null> {
  const row = await db
    .prepare(
      `SELECT id, action_type, actor_name, actor_user_id, delta_seconds, before_seconds, after_seconds, created_at, reverted_at
       FROM timer_logs WHERE timer_id = ? ORDER BY created_at DESC LIMIT 1`
    )
    .bind(timerId)
    .first<{
      id: string;
      action_type: string;
      actor_name: string;
      actor_user_id: string | null;
      delta_seconds: number;
      before_seconds: number;
      after_seconds: number;
      created_at: string;
      reverted_at: string | null;
    }>();
  if (!row) return null;
  return {
    id: row.id,
    actionType: row.action_type as ActionType,
    actorName: row.actor_name,
    actorUserId: row.actor_user_id,
    deltaSeconds: row.delta_seconds,
    beforeSeconds: row.before_seconds,
    afterSeconds: row.after_seconds,
    createdAt: row.created_at,
    revertedAt: row.reverted_at ?? null,
  };
}
