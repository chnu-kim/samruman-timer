import { NextRequest, NextResponse } from "next/server";
import { getDB, withErrorHandler } from "@/lib/db";

export const GET = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id: projectId } = await params;
  const { searchParams } = request.nextUrl;

  const donorLimit = Math.min(50, Math.max(1, parseInt(searchParams.get("donorLimit") ?? "10", 10) || 10));

  const db = await getDB();

  const userId = request.headers.get("x-user-id");

  // 프로젝트 존재 확인
  const project = await db
    .prepare("SELECT id, owner_user_id FROM projects WHERE id = ? AND status != 'DELETED'")
    .bind(projectId)
    .first<{ id: string; owner_user_id: string }>();

  if (!project) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "프로젝트를 찾을 수 없습니다" } },
      { status: 404 }
    );
  }

  // 소유자만 통계 조회 가능
  if (project.owner_user_id !== userId) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "프로젝트 소유자만 통계를 볼 수 있습니다" } },
      { status: 403 }
    );
  }

  const timerSubquery = "SELECT id FROM timers WHERE project_id = ? AND status != 'DELETED'";

  // 1. Summary
  const summary = await db
    .prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN action_type = 'ADD' THEN delta_seconds ELSE 0 END), 0) AS total_added,
        COALESCE(SUM(CASE WHEN action_type = 'SUBTRACT' THEN delta_seconds ELSE 0 END), 0) AS total_subtracted,
        COUNT(CASE WHEN action_type IN ('ADD', 'SUBTRACT') THEN 1 END) AS total_events,
        COUNT(DISTINCT CASE WHEN action_type = 'ADD' THEN actor_name END) AS unique_donors
      FROM timer_logs
      WHERE timer_id IN (${timerSubquery})
    `)
    .bind(projectId)
    .first<{
      total_added: number;
      total_subtracted: number;
      total_events: number;
      unique_donors: number;
    }>();

  // 2. Top Donors
  const topDonorsResult = await db
    .prepare(`
      SELECT actor_name, SUM(delta_seconds) AS total_seconds, COUNT(*) AS event_count
      FROM timer_logs
      WHERE timer_id IN (${timerSubquery})
        AND action_type = 'ADD'
      GROUP BY actor_name
      ORDER BY total_seconds DESC
      LIMIT ?
    `)
    .bind(projectId, donorLimit)
    .all<{
      actor_name: string;
      total_seconds: number;
      event_count: number;
    }>();

  // 3. Hourly Distribution
  const hourlyResult = await db
    .prepare(`
      SELECT
        CAST(strftime('%H', created_at) AS INTEGER) AS hour_of_day,
        COUNT(*) AS event_count,
        SUM(CASE WHEN action_type = 'ADD' THEN 1 ELSE 0 END) AS adds,
        SUM(CASE WHEN action_type = 'SUBTRACT' THEN 1 ELSE 0 END) AS subtracts,
        SUM(CASE WHEN action_type = 'ADD' THEN delta_seconds ELSE 0 END) AS added_seconds
      FROM timer_logs
      WHERE timer_id IN (${timerSubquery})
        AND action_type IN ('ADD', 'SUBTRACT')
      GROUP BY hour_of_day
      ORDER BY hour_of_day ASC
    `)
    .bind(projectId)
    .all<{
      hour_of_day: number;
      event_count: number;
      adds: number;
      subtracts: number;
      added_seconds: number;
    }>();

  // 4. Daily Activity
  const dailyResult = await db
    .prepare(`
      SELECT
        DATE(created_at) AS date,
        COUNT(*) AS event_count,
        SUM(CASE WHEN action_type = 'ADD' THEN delta_seconds ELSE 0 END) AS added_seconds,
        SUM(CASE WHEN action_type = 'SUBTRACT' THEN delta_seconds ELSE 0 END) AS subtracted_seconds
      FROM timer_logs
      WHERE timer_id IN (${timerSubquery})
        AND action_type IN ('ADD', 'SUBTRACT')
      GROUP BY date
      ORDER BY date ASC
    `)
    .bind(projectId)
    .all<{
      date: string;
      event_count: number;
      added_seconds: number;
      subtracted_seconds: number;
    }>();

  // peakHour 계산
  let peakHour: number | null = null;
  if (hourlyResult.results.length > 0) {
    let maxCount = 0;
    for (const row of hourlyResult.results) {
      if (row.event_count > maxCount) {
        maxCount = row.event_count;
        peakHour = row.hour_of_day;
      }
    }
  }

  const totalAdded = summary?.total_added ?? 0;
  const totalSubtracted = summary?.total_subtracted ?? 0;

  return NextResponse.json({
    data: {
      summary: {
        totalAddedSeconds: totalAdded,
        totalSubtractedSeconds: totalSubtracted,
        netAddedSeconds: totalAdded - totalSubtracted,
        totalEvents: summary?.total_events ?? 0,
        uniqueDonors: summary?.unique_donors ?? 0,
        peakHour,
      },
      topDonors: topDonorsResult.results.map((r) => ({
        actorName: r.actor_name,
        totalSeconds: r.total_seconds,
        eventCount: r.event_count,
      })),
      hourlyDistribution: hourlyResult.results.map((r) => ({
        hour: r.hour_of_day,
        eventCount: r.event_count,
        adds: r.adds,
        subtracts: r.subtracts,
        addedSeconds: r.added_seconds,
      })),
      dailyActivity: dailyResult.results.map((r) => ({
        date: r.date,
        eventCount: r.event_count,
        addedSeconds: r.added_seconds,
        subtractedSeconds: r.subtracted_seconds,
      })),
    },
  });
});
