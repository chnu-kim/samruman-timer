import { NextRequest, NextResponse } from "next/server";
import { getDB, generateId, nowISO, withErrorHandler } from "@/lib/db";
import { calculateRemaining, detectScheduledActivation, detectExpiry } from "@/lib/timer";
import type { CreateTimerRequest, Timer } from "@/types";

export const GET = withErrorHandler(async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id: projectId } = await params;
  const db = await getDB();

  // 프로젝트 존재 확인
  const project = await db
    .prepare("SELECT id FROM projects WHERE id = ?")
    .bind(projectId)
    .first();

  if (!project) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "프로젝트를 찾을 수 없습니다" } },
      { status: 404 }
    );
  }

  const rows = await db
    .prepare(
      `SELECT id, title, description, base_remaining_seconds, last_calculated_at, status, scheduled_start_at, created_at
       FROM timers
       WHERE project_id = ?
       ORDER BY created_at DESC`
    )
    .bind(projectId)
    .all<{
      id: string;
      title: string;
      description: string | null;
      base_remaining_seconds: number;
      last_calculated_at: string;
      status: string;
      scheduled_start_at: string | null;
      created_at: string;
    }>();

  // SCHEDULED/RUNNING 타이머에 대해 lazy 상태 전이 감지
  const data = [];
  for (const r of rows.results) {
    let timer: Timer = {
      id: r.id,
      projectId,
      title: r.title,
      description: r.description,
      baseRemainingSeconds: r.base_remaining_seconds,
      lastCalculatedAt: r.last_calculated_at,
      status: r.status as Timer["status"],
      scheduledStartAt: r.scheduled_start_at,
      createdAt: r.created_at,
      updatedAt: r.created_at,
      createdBy: "",
    };

    timer = await detectScheduledActivation(db, timer);
    timer = await detectExpiry(db, timer);

    data.push({
      id: timer.id,
      title: timer.title,
      description: timer.description,
      remainingSeconds:
        timer.status === "RUNNING"
          ? calculateRemaining(timer.baseRemainingSeconds, timer.lastCalculatedAt)
          : timer.status === "SCHEDULED"
          ? timer.baseRemainingSeconds
          : 0,
      status: timer.status,
      scheduledStartAt: timer.scheduledStartAt,
      createdAt: timer.createdAt,
    });
  }

  return NextResponse.json({ data });
});

export const POST = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id: projectId } = await params;
  const userId = request.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "인증이 필요합니다" } },
      { status: 401 }
    );
  }

  // 프로젝트 소유자 확인
  const db = await getDB();
  const project = await db
    .prepare("SELECT owner_user_id FROM projects WHERE id = ?")
    .bind(projectId)
    .first<{ owner_user_id: string }>();

  if (!project) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "프로젝트를 찾을 수 없습니다" } },
      { status: 404 }
    );
  }
  if (project.owner_user_id !== userId) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "프로젝트 소유자만 타이머를 생성할 수 있습니다" } },
      { status: 403 }
    );
  }

  // 프로젝트당 타이머 1개 제약
  const existing = await db
    .prepare("SELECT COUNT(*) as cnt FROM timers WHERE project_id = ?")
    .bind(projectId)
    .first<{ cnt: number }>();

  if (existing && existing.cnt > 0) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "프로젝트당 하나의 타이머만 생성할 수 있습니다" } },
      { status: 400 }
    );
  }

  let body: CreateTimerRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "유효한 JSON 본문이 필요합니다" } },
      { status: 400 }
    );
  }

  if (typeof body.title !== "string" || body.title.length < 1 || body.title.length > 100) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "title은 1~100자 문자열이어야 합니다" } },
      { status: 400 }
    );
  }
  if (body.description !== undefined && (typeof body.description !== "string" || body.description.length > 500)) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "description은 최대 500자 문자열이어야 합니다" } },
      { status: 400 }
    );
  }
  const MAX_SECONDS = 31_536_000; // 1년
  if (typeof body.initialSeconds !== "number" || body.initialSeconds <= 0 || !Number.isInteger(body.initialSeconds) || body.initialSeconds > MAX_SECONDS) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "initialSeconds는 1~31536000 범위의 양의 정수여야 합니다" } },
      { status: 400 }
    );
  }

  // 예약 시작 시각 유효성 검증
  let scheduledStartAt: string | null = null;
  if (body.scheduledStartAt !== undefined) {
    const parsed = new Date(body.scheduledStartAt);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "scheduledStartAt은 유효한 ISO 8601 날짜여야 합니다" } },
        { status: 400 }
      );
    }
    if (parsed.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "scheduledStartAt은 미래 시각이어야 합니다" } },
        { status: 400 }
      );
    }
    scheduledStartAt = parsed.toISOString();
  }

  const timerId = generateId();
  const logId = generateId();
  const now = nowISO();
  const rawNickname = request.headers.get("x-user-nickname") ?? "unknown";
  let nickname: string;
  try {
    nickname = decodeURIComponent(rawNickname);
  } catch {
    nickname = rawNickname;
  }

  const timerStatus = scheduledStartAt ? "SCHEDULED" : "RUNNING";

  await db.batch([
    db
      .prepare(
        "INSERT INTO timers (id, project_id, title, description, base_remaining_seconds, last_calculated_at, status, scheduled_start_at, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(timerId, projectId, body.title, body.description ?? null, body.initialSeconds, now, timerStatus, scheduledStartAt, userId, now, now),
    db
      .prepare(
        "INSERT INTO timer_logs (id, timer_id, action_type, actor_name, actor_user_id, delta_seconds, before_seconds, after_seconds, created_at) VALUES (?, ?, 'CREATE', ?, ?, ?, 0, ?, ?)"
      )
      .bind(logId, timerId, nickname, userId, body.initialSeconds, body.initialSeconds, now),
  ]);

  return NextResponse.json(
    {
      data: {
        id: timerId,
        title: body.title,
        remainingSeconds: body.initialSeconds,
        status: timerStatus,
        scheduledStartAt,
        createdAt: now,
      },
    },
    { status: 201 }
  );
});
