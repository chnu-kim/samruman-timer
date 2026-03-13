import { NextRequest, NextResponse } from "next/server";
import { getDB, nowISO, withErrorHandler } from "@/lib/db";
import { computeProgress, type GoalRow } from "@/lib/goal";

export const DELETE = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string; goalId: string }> },
) => {
  const { id: projectId, goalId } = await params;
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
      { error: { code: "FORBIDDEN", message: "프로젝트 소유자만 목표를 삭제할 수 있습니다" } },
      { status: 403 },
    );
  }

  const goal = await db
    .prepare("SELECT id, status FROM goals WHERE id = ? AND project_id = ?")
    .bind(goalId, projectId)
    .first<{ id: string; status: string }>();

  if (!goal) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "목표를 찾을 수 없습니다" } },
      { status: 404 },
    );
  }

  if (goal.status === "CANCELLED") {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "이미 취소된 목표입니다" } },
      { status: 400 },
    );
  }

  const now = nowISO();
  await db
    .prepare("UPDATE goals SET status = 'CANCELLED', completed_at = ?, updated_at = ? WHERE id = ?")
    .bind(now, now, goalId)
    .run();

  return NextResponse.json({ data: { id: goalId } });
});

export const PATCH = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string; goalId: string }> },
) => {
  const { id: projectId, goalId } = await params;
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
      { error: { code: "FORBIDDEN", message: "프로젝트 소유자만 목표를 수정할 수 있습니다" } },
      { status: 403 },
    );
  }

  const goal = await db
    .prepare(
      `SELECT id, project_id, type, title, target_seconds, target_datetime,
              status, created_at, completed_at, updated_at
       FROM goals WHERE id = ? AND project_id = ?`,
    )
    .bind(goalId, projectId)
    .first<GoalRow>();

  if (!goal) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "목표를 찾을 수 없습니다" } },
      { status: 404 },
    );
  }

  if (goal.status !== "ACTIVE") {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "진행 중인 목표만 취소할 수 있습니다" } },
      { status: 400 },
    );
  }

  const now = nowISO();
  await db
    .prepare("UPDATE goals SET status = 'CANCELLED', completed_at = ?, updated_at = ? WHERE id = ?")
    .bind(now, now, goal.id)
    .run();

  goal.status = "CANCELLED";
  goal.completed_at = now;

  const { progress } = await computeProgress(db, goal, projectId);

  return NextResponse.json({
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
  });
});
