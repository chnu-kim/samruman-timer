import { NextRequest, NextResponse } from "next/server";
import { getDB, generateId, nowISO, withErrorHandler } from "@/lib/db";
import { calculateRemaining, detectExpiry, detectScheduledActivation } from "@/lib/timer";
import type { Timer } from "@/types";

export const GET = withErrorHandler(async (
  request: NextRequest,
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
              p.owner_user_id, p.name AS project_name
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
      project_name: string;
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

  // since(직전에 본 updatedAt)를 주면 그 뒤 지금 상태까지 들어온 시간 추가·차감의 실제 변경량 합계를 내려 준다.
  // 오버레이가 '+N'을 폴링 시각으로 추정하지 않고 이 값으로 그린다(추정은 1~2초 어긋나 '+60초'가 '+1:01'로 보인다)
  // 계산할 수 없으면(since 없음·잘못된 값·지금 updatedAt보다 늦음) 필드를 빼서 클라이언트가 추정으로 돌아가게 하고,
  // 계산했는데 그사이 추가·차감이 없으면 null(제목 수정·만료 기록 등 연출할 변경이 아님)
  const sinceParam = request.nextUrl.searchParams.get("since");
  const sinceMs = sinceParam ? Date.parse(sinceParam) : NaN;
  // 로그·updatedAt은 toISOString() 형식 문자열로 비교하므로 다른 ISO 표기(오프셋, 밀리초 생략)도 같은 형식으로 맞춘다
  const since = Number.isNaN(sinceMs) ? null : new Date(sinceMs).toISOString();
  let deltaSince: { deltaSinceSeconds: number | null } | Record<string, never> = {};
  if (since && sinceMs < Date.parse(checked.updatedAt)) {
    // 되돌리기는 ADD·SUBTRACT 행을 새로 쓰지 않고 원래 행에 reverted_at만 채운다. 그사이 되돌린 기록이 있으면
    // 합계가 실제 변경과 어긋나므로(추가 후 바로 되돌리면 '+N', 되돌리기만 있으면 '변경 없음') 필드를 빼서 추정으로 넘긴다.
    // 되돌린 양을 빼는 방식은 0에서 잘리는 되돌리기에서 다시 어긋난다
    const sum = await db
      .prepare(
        `SELECT
           (SELECT SUM(after_seconds - before_seconds)
              FROM timer_logs
             WHERE timer_id = ? AND action_type IN ('ADD', 'SUBTRACT')
               AND created_at > ? AND created_at <= ?) AS d,
           EXISTS (SELECT 1 FROM timer_logs
                    WHERE timer_id = ? AND reverted_at > ? AND reverted_at <= ?) AS reverted`
      )
      .bind(checked.id, since, checked.updatedAt, checked.id, since, checked.updatedAt)
      .first<{ d: number | null; reverted: number }>();
    if (sum && !sum.reverted) deltaSince = { deltaSinceSeconds: sum.d ?? null };
  }

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
      projectName: row.project_name,
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
      ...deltaSince,
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "유효한 JSON 본문이 필요합니다" } },
      { status: 400 }
    );
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "요청 본문은 JSON 객체여야 합니다" } },
      { status: 400 }
    );
  }
  const { title, description } = body as { title?: unknown; description?: unknown };
  const updates: string[] = [];
  const binds: (string | null)[] = [];

  // POST와 같은 길이 제한 — 공개 목록 응답에 그대로 실리므로 크기를 묶어 둔다
  if (title !== undefined) {
    if (typeof title !== "string" || !title.trim() || title.trim().length > 100) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "title은 1~100자 문자열이어야 합니다" } },
        { status: 400 }
      );
    }
    updates.push("title = ?");
    binds.push(title.trim());
  }
  if (description !== undefined) {
    if (description !== null && (typeof description !== "string" || description.length > 500)) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "description은 최대 500자 문자열이어야 합니다" } },
        { status: 400 }
      );
    }
    updates.push("description = ?");
    binds.push(description?.trim() || null);
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
              p.owner_user_id, p.name AS project_name
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
      project_name: string;
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
      projectName: updated!.project_name,
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
