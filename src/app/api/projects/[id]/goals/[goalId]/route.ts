import { NextRequest, NextResponse } from "next/server";
import { getDB, nowISO, withErrorHandler } from "@/lib/db";
import { computeProgress, type GoalRow } from "@/lib/goal";

export const DELETE = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string; goalId: string }> },
) => {
  const { id: projectId, goalId } = await params;
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

  // 진행 중인 목표는 먼저 취소한다(PATCH). 달성한 목표는 기록으로 남긴다.
  // 지울 수 있는 것은 실패·취소로 끝난 목표뿐이고, 행을 실제로 지운다.
  if (goal.status === "ACTIVE" || goal.status === "COMPLETED") {
    return NextResponse.json(
      {
        error: {
          code: "CONFLICT",
          message: goal.status === "ACTIVE"
            ? "진행 중인 목표는 삭제할 수 없습니다. 먼저 취소해 주세요"
            : "달성한 목표는 삭제할 수 없습니다",
        },
      },
      { status: 409 },
    );
  }

  // 조회와 삭제 사이에 상태가 바뀌었을 수 있으므로 같은 조건으로 지운다
  const deleted = await db
    .prepare("DELETE FROM goals WHERE id = ? AND project_id = ? AND status IN ('FAILED', 'CANCELLED')")
    .bind(goalId, projectId)
    .run();

  if (!deleted.meta?.changes) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "목표를 찾을 수 없습니다" } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: { id: goalId } });
});

export const PATCH = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string; goalId: string }> },
) => {
  const { id: projectId, goalId } = await params;
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
