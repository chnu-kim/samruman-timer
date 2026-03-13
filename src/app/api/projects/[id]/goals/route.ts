import { NextRequest, NextResponse } from "next/server";
import { getDB, generateId, nowISO, withErrorHandler } from "@/lib/db";
import { computeProgress, type GoalRow } from "@/lib/goal";
import type { CreateGoalRequest } from "@/types";

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
       ORDER BY created_at DESC`,
    )
    .bind(projectId)
    .all<GoalRow>();

  const now = nowISO();
  const data = [];

  for (const goal of goals.results) {
    const { progress, newStatus } = await computeProgress(db, goal, projectId);

    if (newStatus && goal.status === "ACTIVE") {
      await db
        .prepare("UPDATE goals SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?")
        .bind(newStatus, now, now, goal.id)
        .run();
      goal.status = newStatus;
      goal.completed_at = now;
    }

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
    if (typeof targetSeconds !== "number" || targetSeconds <= 0 || targetSeconds > 8_760_000) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "목표 시간은 1초~8,760,000초(약 100일)여야 합니다" } },
        { status: 400 },
      );
    }
  }

  if (type === "DEADLINE") {
    if (!targetDatetime || typeof targetDatetime !== "string") {
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
      type === "DEADLINE" ? targetDatetime! : null,
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
    target_datetime: type === "DEADLINE" ? targetDatetime! : null,
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
