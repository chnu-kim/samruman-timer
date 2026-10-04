import { NextRequest, NextResponse } from "next/server";
import { getDB, withErrorHandler } from "@/lib/db";
import type { GraphMode } from "@/types";

// SQL에 그대로 보간하므로 반드시 정수 상수로 둔다
const MAX_POINTS = 1000;

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

  // 타이머 존재 확인 — 삭제된 타이머의 이력(후원자 닉네임 포함)은 공개하지 않는다
  const timer = await db
    .prepare("SELECT id FROM timers WHERE id = ? AND status != 'DELETED'")
    .bind(timerId)
    .first();

  if (!timer) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "타이머를 찾을 수 없습니다" } },
      { status: 404 }
    );
  }

  // 되돌린 기록(reverted_at)은 세 모드 모두에서 뺀다. 잔여 모드에서 그 기록과 되돌리기 사이의 다른 기록은
  // 당시 실제 잔여(되돌린 변경량 포함)를 그대로 그린다.
  // 로그가 많은 타이머도 응답 크기가 일정하도록 MAX_POINTS개 안팎으로 균등 추출한다.
  // step = ceil(전체 / MAX_POINTS), 마지막 점은 항상 포함한다.
  if (mode === "remaining") {
    const rows = await db
      .prepare(
        `WITH ordered AS (
           SELECT created_at, after_seconds,
                  ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn,
                  COUNT(*) OVER () AS total
           FROM timer_logs
           WHERE timer_id = ? AND reverted_at IS NULL
         )
         SELECT created_at, after_seconds
         FROM ordered
         WHERE (rn - 1) % ((total + ${MAX_POINTS} - 1) / ${MAX_POINTS}) = 0 OR rn = total
         ORDER BY rn`
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
    // 누적합은 추출 전에 전체 로그로 계산해야 하므로 창 함수로 SQL에서 구한다
    const rows = await db
      .prepare(
        `WITH ordered AS (
           SELECT created_at,
                  SUM(CASE WHEN action_type = 'ADD' THEN delta_seconds ELSE 0 END) OVER w AS total_added,
                  SUM(CASE WHEN action_type = 'SUBTRACT' THEN delta_seconds ELSE 0 END) OVER w AS total_subtracted,
                  ROW_NUMBER() OVER w AS rn,
                  COUNT(*) OVER () AS total
           FROM timer_logs
           WHERE timer_id = ? AND action_type IN ('ADD', 'SUBTRACT') AND reverted_at IS NULL
           WINDOW w AS (ORDER BY created_at, id ROWS UNBOUNDED PRECEDING)
         )
         SELECT created_at, total_added, total_subtracted
         FROM ordered
         WHERE (rn - 1) % ((total + ${MAX_POINTS} - 1) / ${MAX_POINTS}) = 0 OR rn = total
         ORDER BY rn`
      )
      .bind(timerId)
      .all<{ created_at: string; total_added: number; total_subtracted: number }>();

    const points = rows.results.map((r) => ({
      timestamp: r.created_at,
      totalAdded: r.total_added,
      totalSubtracted: r.total_subtracted,
    }));

    return NextResponse.json({ data: { mode: "cumulative", points } });
  }

  // frequency — 시간 단위 구간을 유지하고 최근 MAX_POINTS개 구간만 반환한다
  const rows = await db
    .prepare(
      `SELECT hour, count, adds, subtracts FROM (
         SELECT
           strftime('%Y-%m-%dT%H:00:00Z', created_at) AS hour,
           COUNT(*) AS count,
           SUM(CASE WHEN action_type = 'ADD' THEN 1 ELSE 0 END) AS adds,
           SUM(CASE WHEN action_type = 'SUBTRACT' THEN 1 ELSE 0 END) AS subtracts
         FROM timer_logs
         WHERE timer_id = ? AND action_type IN ('ADD', 'SUBTRACT') AND reverted_at IS NULL
         GROUP BY hour
         ORDER BY hour DESC
         LIMIT ${MAX_POINTS}
       )
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
