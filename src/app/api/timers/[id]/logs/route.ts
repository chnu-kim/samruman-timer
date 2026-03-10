import { NextRequest, NextResponse } from "next/server";
import { getDB, withErrorHandler } from "@/lib/db";

export const GET = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id: timerId } = await params;
  const { searchParams } = request.nextUrl;

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(250, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  const actionTypeFilter = searchParams.get("actionType");

  const db = await getDB();

  // 타이머 존재 확인
  const timer = await db
    .prepare("SELECT id FROM timers WHERE id = ?")
    .bind(timerId)
    .first();

  if (!timer) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "타이머를 찾을 수 없습니다" } },
      { status: 404 }
    );
  }

  // 필터 조건 빌드
  let whereClause = "WHERE timer_id = ?";
  const binds: (string | number)[] = [timerId];

  const VALID_ACTIONS = new Set(["CREATE", "ADD", "SUBTRACT", "EXPIRE", "REOPEN"]);
  if (actionTypeFilter) {
    const types = actionTypeFilter.split(",").map((t) => t.trim());
    if (types.some((t) => !VALID_ACTIONS.has(t))) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "유효하지 않은 actionType입니다. 허용: CREATE, ADD, SUBTRACT, EXPIRE, REOPEN" } },
        { status: 400 }
      );
    }
    const placeholders = types.map(() => "?").join(", ");
    whereClause += ` AND action_type IN (${placeholders})`;
    binds.push(...types);
  }

  // 총 개수
  const countRow = await db
    .prepare(`SELECT COUNT(*) AS cnt FROM timer_logs ${whereClause}`)
    .bind(...binds)
    .first<{ cnt: number }>();
  const total = countRow?.cnt ?? 0;

  // 로그 조회
  const offset = (page - 1) * limit;
  const rows = await db
    .prepare(
      `SELECT id, action_type, actor_name, actor_user_id, delta_seconds, before_seconds, after_seconds, created_at
       FROM timer_logs
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(...binds, limit, offset)
    .all<{
      id: string;
      action_type: string;
      actor_name: string;
      actor_user_id: string | null;
      delta_seconds: number;
      before_seconds: number;
      after_seconds: number;
      created_at: string;
    }>();

  const logs = rows.results.map((r) => ({
    id: r.id,
    actionType: r.action_type,
    actorName: r.actor_name,
    actorUserId: r.actor_user_id,
    deltaSeconds: r.delta_seconds,
    beforeSeconds: r.before_seconds,
    afterSeconds: r.after_seconds,
    createdAt: r.created_at,
  }));

  return NextResponse.json({
    data: {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  });
});
