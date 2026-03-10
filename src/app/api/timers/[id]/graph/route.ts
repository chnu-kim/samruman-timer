import { NextRequest, NextResponse } from "next/server";
import { getDB, withErrorHandler } from "@/lib/db";
import type { GraphMode } from "@/types";

export const GET = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id: timerId } = await params;
  const mode = request.nextUrl.searchParams.get("mode") as GraphMode | null;

  if (!mode || !["remaining", "cumulative", "frequency"].includes(mode)) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "mode는 remaining, cumulative, frequency 중 하나여야 합니다" } },
      { status: 400 }
    );
  }

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

  if (mode === "remaining") {
    const rows = await db
      .prepare(
        `SELECT created_at, after_seconds
         FROM timer_logs
         WHERE timer_id = ?
         ORDER BY created_at ASC`
      )
      .bind(timerId)
      .all<{ created_at: string; after_seconds: number }>();

    return NextResponse.json({
      data: {
        mode: "remaining",
        points: rows.results.map((r) => ({
          timestamp: r.created_at,
          remainingSeconds: r.after_seconds,
        })),
      },
    });
  }

  if (mode === "cumulative") {
    const rows = await db
      .prepare(
        `SELECT created_at, action_type, delta_seconds
         FROM timer_logs
         WHERE timer_id = ? AND action_type IN ('ADD', 'SUBTRACT')
         ORDER BY created_at ASC`
      )
      .bind(timerId)
      .all<{ created_at: string; action_type: string; delta_seconds: number }>();

    let totalAdded = 0;
    let totalSubtracted = 0;
    const points = rows.results.map((r) => {
      if (r.action_type === "ADD") totalAdded += r.delta_seconds;
      else totalSubtracted += r.delta_seconds;
      return {
        timestamp: r.created_at,
        totalAdded,
        totalSubtracted,
      };
    });

    return NextResponse.json({ data: { mode: "cumulative", points } });
  }

  // frequency
  const rows = await db
    .prepare(
      `SELECT
         strftime('%Y-%m-%dT%H:00:00Z', created_at) AS hour,
         COUNT(*) AS count,
         SUM(CASE WHEN action_type = 'ADD' THEN 1 ELSE 0 END) AS adds,
         SUM(CASE WHEN action_type = 'SUBTRACT' THEN 1 ELSE 0 END) AS subtracts
       FROM timer_logs
       WHERE timer_id = ? AND action_type IN ('ADD', 'SUBTRACT')
       GROUP BY hour
       ORDER BY hour ASC`
    )
    .bind(timerId)
    .all<{ hour: string; count: number; adds: number; subtracts: number }>();

  return NextResponse.json({
    data: {
      mode: "frequency",
      buckets: rows.results.map((r) => ({
        hour: r.hour,
        count: r.count,
        adds: r.adds,
        subtracts: r.subtracts,
      })),
    },
  });
});
