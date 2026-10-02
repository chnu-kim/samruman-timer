import { NextRequest, NextResponse } from "next/server";
import { getDB, generateId, nowISO, withErrorHandler } from "@/lib/db";
import { computeProgress, loadProgressSnapshot, type GoalRow, type ProgressSnapshot } from "@/lib/goal";
import type { CreateGoalRequest, GoalProgress } from "@/types";

// 공개 목록 GET이 목표마다 진행률을 계산하므로 진행 중인 목표 수를 묶어 둔다
const MAX_ACTIVE_GOALS = 20;
// 취소·완료된 목표는 계속 쌓이므로 공개 목록이 반환하는 개수를 따로 묶어 둔다.
// 진행 중인 목표(최대 MAX_ACTIVE_GOALS개)는 항상 포함된다.
const MAX_LISTED_GOALS = 50;

/**
 * 목표 상태는 조회 시점에 lazy하게 전이된다. 진행률을 계산하고, 달성·실패 조건을 만족한
 * ACTIVE 목표는 DB에도 반영한다. 동시에 들어온 취소를 덮어쓰지 않도록 ACTIVE일 때만 전이한다.
 */
async function settleGoal(
  db: D1Database,
  goal: GoalRow,
  projectId: string,
  snapshot: ProgressSnapshot,
  now: string,
): Promise<GoalProgress> {
  const { progress, newStatus } = await computeProgress(db, goal, projectId, snapshot);
  if (newStatus && goal.status === "ACTIVE") {
    await db
      .prepare("UPDATE goals SET status = ?, completed_at = ?, updated_at = ? WHERE id = ? AND status = 'ACTIVE'")
      .bind(newStatus, now, now, goal.id)
      .run();
    goal.status = newStatus;
    goal.completed_at = now;
  }
  return progress;
}

/**
 * 진행 중인 목표 수. 상한에 걸리면 이미 달성·실패했지만 아직 전이되지 않은 목표가
 * 섞여 있을 수 있으므로, 전이를 먼저 반영하고 다시 센다.
 */
async function countActiveGoals(db: D1Database, projectId: string): Promise<number> {
  const active = await db
    .prepare("SELECT COUNT(*) AS cnt FROM goals WHERE project_id = ? AND status = 'ACTIVE'")
    .bind(projectId)
    .first<{ cnt: number }>();
  const count = active?.cnt ?? 0;
  if (count < MAX_ACTIVE_GOALS) return count;

  const goals = await db
    .prepare(
      `SELECT id, project_id, type, title, target_seconds, target_datetime,
              status, created_at, completed_at, updated_at
       FROM goals
       WHERE project_id = ? AND status = 'ACTIVE'`,
    )
    .bind(projectId)
    .all<GoalRow>();
  const snapshot = await loadProgressSnapshot(db, projectId);
  const now = nowISO();
  let stillActive = 0;
  for (const goal of goals.results) {
    await settleGoal(db, goal, projectId, snapshot, now);
    if (goal.status === "ACTIVE") stillActive++;
  }
  return stillActive;
}

export const GET = withErrorHandler(async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id: projectId } = await params;
  const db = await getDB();

  const project = await db
    .prepare("SELECT id FROM projects WHERE id = ? AND status != 'DELETED'")
    .bind(projectId)
    .first<{ id: string }>();

  if (!project) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "프로젝트를 찾을 수 없습니다" } },
      { status: 404 },
    );
  }

  const goals = await db
    .prepare(
      `SELECT id, project_id, type, title, target_seconds, target_datetime,
              status, created_at, completed_at, updated_at
       FROM goals
       WHERE project_id = ?
       ORDER BY (status = 'ACTIVE') DESC, created_at DESC
       LIMIT ${MAX_LISTED_GOALS}`,
    )
    .bind(projectId)
    .all<GoalRow>();
  // 진행 중인 목표를 먼저 뽑았으므로 응답 순서는 다시 생성일 역순으로 맞춘다
  const rows = goals.results.sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (rows.length === 0) return NextResponse.json({ data: [] });

  const now = nowISO();
  const data = [];
  // 비인증 공개 GET이라 목표 수만큼 집계 쿼리를 반복하지 않도록 타이머 상태는 한 번만 읽는다
  const snapshot = await loadProgressSnapshot(db, projectId);

  for (const goal of rows) {
    const progress = await settleGoal(db, goal, projectId, snapshot, now);

    data.push({
      id: goal.id,
      type: goal.type,
      title: goal.title,
      targetSeconds: goal.target_seconds,
      targetDatetime: goal.target_datetime,
      status: goal.status,
      progress,
      createdAt: goal.created_at,
      completedAt: goal.completed_at,
    });
  }

  return NextResponse.json({ data });
});

export const POST = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id: projectId } = await params;
  const userId = request.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "인증이 필요합니다" } },
      { status: 401 },
    );
  }
  const db = await getDB();

  const project = await db
    .prepare("SELECT id, owner_user_id FROM projects WHERE id = ? AND status != 'DELETED'")
    .bind(projectId)
    .first<{ id: string; owner_user_id: string }>();

  if (!project) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "프로젝트를 찾을 수 없습니다" } },
      { status: 404 },
    );
  }

  if (project.owner_user_id !== userId) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "프로젝트 소유자만 목표를 생성할 수 있습니다" } },
      { status: 403 },
    );
  }

  let body: CreateGoalRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "잘못된 요청 본문입니다" } },
      { status: 400 },
    );
  }

  const { type, title, targetSeconds, targetDatetime } = body;

  if (!title || typeof title !== "string" || title.trim().length === 0 || title.length > 100) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "제목은 1~100자여야 합니다" } },
      { status: 400 },
    );
  }

  if (type !== "DURATION" && type !== "DEADLINE") {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "유효하지 않은 목표 타입입니다" } },
      { status: 400 },
    );
  }

  if (type === "DURATION") {
    if (typeof targetSeconds !== "number" || !Number.isInteger(targetSeconds) || targetSeconds <= 0 || targetSeconds > 8_760_000) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "목표 시간은 1초~8,760,000초(약 100일)여야 합니다" } },
        { status: 400 },
      );
    }
  }

  if (type === "DEADLINE") {
    // Date 파서는 괄호 안을 주석으로 무시해 아주 긴 문자열도 통과시키므로 길이를 먼저 묶는다
    if (!targetDatetime || typeof targetDatetime !== "string" || targetDatetime.length > 64) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "목표 날짜/시간이 필요합니다" } },
        { status: 400 },
      );
    }
    const dt = new Date(targetDatetime);
    if (isNaN(dt.getTime()) || dt.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "목표 날짜/시간은 미래여야 합니다" } },
        { status: 400 },
      );
    }
  }

  if ((await countActiveGoals(db, projectId)) >= MAX_ACTIVE_GOALS) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: `진행 중인 목표는 최대 ${MAX_ACTIVE_GOALS}개까지 만들 수 있습니다` } },
      { status: 400 },
    );
  }

  // 저장·응답은 ISO 8601 UTC로 정규화한다(입력 원문을 그대로 저장하지 않는다)
  const deadline = type === "DEADLINE" ? new Date(targetDatetime!).toISOString() : null;
  const id = generateId();
  const now = nowISO();

  await db
    .prepare(
      `INSERT INTO goals (id, project_id, type, title, target_seconds, target_datetime, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`,
    )
    .bind(
      id,
      projectId,
      type,
      title.trim(),
      type === "DURATION" ? targetSeconds! : null,
      deadline,
      now,
      now,
    )
    .run();

  const goal: GoalRow = {
    id,
    project_id: projectId,
    type,
    title: title.trim(),
    target_seconds: type === "DURATION" ? targetSeconds! : null,
    target_datetime: deadline,
    status: "ACTIVE",
    created_at: now,
    completed_at: null,
    updated_at: now,
  };

  const { progress } = await computeProgress(db, goal, projectId);

  return NextResponse.json(
    {
      data: {
        id: goal.id,
        type: goal.type,
        title: goal.title,
        targetSeconds: goal.target_seconds,
        targetDatetime: goal.target_datetime,
        status: goal.status,
        progress,
        createdAt: goal.created_at,
        completedAt: goal.completed_at,
      },
    },
    { status: 201 },
  );
});
