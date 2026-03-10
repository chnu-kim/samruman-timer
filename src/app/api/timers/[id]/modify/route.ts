import { NextRequest, NextResponse } from "next/server";
import { getDB, withErrorHandler } from "@/lib/db";
import { calculateRemaining, modifyTimer, detectScheduledActivation } from "@/lib/timer";
import type { Timer, ModifyTimerRequest } from "@/types";

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

  const db = await getDB();

  // 타이머 + 프로젝트 소유자 확인
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

  if (!row) {
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

  let body: ModifyTimerRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "유효한 JSON 본문이 필요합니다" } },
      { status: 400 }
    );
  }

  if (body.action !== "ADD" && body.action !== "SUBTRACT") {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "action은 ADD 또는 SUBTRACT여야 합니다" } },
      { status: 400 }
    );
  }
  const MAX_SECONDS = 31_536_000; // 1년
  if (typeof body.deltaSeconds !== "number" || body.deltaSeconds <= 0 || !Number.isInteger(body.deltaSeconds) || body.deltaSeconds > MAX_SECONDS) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "deltaSeconds는 1~31536000 범위의 양의 정수여야 합니다" } },
      { status: 400 }
    );
  }
  if (typeof body.actorName !== "string" || body.actorName.length < 1 || body.actorName.length > 50) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "actorName은 1~50자 문자열이어야 합니다" } },
      { status: 400 }
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

  // 예약 활성화 감지
  const activated = await detectScheduledActivation(db, timer);

  if (activated.status === "SCHEDULED") {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "예약된 타이머는 시간을 변경할 수 없습니다" } },
      { status: 400 }
    );
  }

  const result = await modifyTimer(
    db,
    activated,
    body.action,
    body.deltaSeconds,
    body.actorName,
    userId
  );

  const remainingSeconds =
    result.timer.status === "RUNNING"
      ? calculateRemaining(result.timer.baseRemainingSeconds, result.timer.lastCalculatedAt)
      : 0;

  const lastLog = result.logs[result.logs.length - 1];

  return NextResponse.json({
    data: {
      id: result.timer.id,
      remainingSeconds,
      status: result.timer.status,
      log: {
        id: lastLog.id,
        actionType: lastLog.actionType,
        actorName: lastLog.actorName,
        actorUserId: lastLog.actorUserId,
        deltaSeconds: lastLog.deltaSeconds,
        beforeSeconds: lastLog.beforeSeconds,
        afterSeconds: lastLog.afterSeconds,
        createdAt: lastLog.createdAt,
      },
    },
  });
});
