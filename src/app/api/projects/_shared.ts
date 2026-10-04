import type { ProjectListItem, Pagination, TimerStatus } from "@/types";
import { calculateRemaining } from "@/lib/timer";

const MAX_QUERY_LENGTH = 100;

interface ProjectListParams {
  searchQuery?: string;
  page: number;
  limit: number;
  sort: string;
}

interface OwnerFilter {
  userId: string;
  mode: "only" | "exclude";
}

export function parseProjectListParams(searchParams: URLSearchParams): ProjectListParams {
  // 이름 최대 길이(100자)보다 긴 검색어는 의미가 없고 LIKE 비용만 키우므로 자른다
  const q = searchParams.get("q")?.trim().slice(0, MAX_QUERY_LENGTH) || undefined;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const rawLimit = parseInt(searchParams.get("limit") ?? "12", 10) || 12;
  const limit = Math.min(50, Math.max(1, rawLimit));
  const sort = searchParams.get("sort") === "name" ? "name" : "latest";

  return { searchQuery: q, page, limit, sort };
}

interface TimerSnapshot {
  status: TimerStatus | null;
  baseRemainingSeconds: number | null;
  lastCalculatedAt: string | null;
  scheduledStartAt: string | null;
}

/**
 * 목록 카드에 보일 타이머 상태를 조회 시점 기준으로 계산한다.
 * 만료·예약 시작 전이는 타이머를 직접 조회할 때만 DB에 기록되므로(detectExpiry 등),
 * 저장된 status를 그대로 쓰면 이미 끝난 타이머가 '실행 중'으로 보인다. 목록 조회는 쓰지 않고 계산만 한다.
 */
export function summarizeTimer(t: TimerSnapshot): Pick<ProjectListItem, "timerStatus" | "remainingSeconds" | "scheduledStartAt"> {
  if (!t.status || t.status === "DELETED" || t.baseRemainingSeconds === null) {
    return { timerStatus: null, remainingSeconds: null, scheduledStartAt: null };
  }
  if (t.status === "SCHEDULED") {
    if (!t.scheduledStartAt || Date.now() < new Date(t.scheduledStartAt).getTime()) {
      return { timerStatus: "SCHEDULED", remainingSeconds: t.baseRemainingSeconds, scheduledStartAt: t.scheduledStartAt };
    }
    // 시작 시각이 지났으면 그 시각부터 흐른 것으로 본다(detectScheduledActivation과 같은 기준)
    const remaining = calculateRemaining(t.baseRemainingSeconds, t.scheduledStartAt);
    return { timerStatus: remaining > 0 ? "RUNNING" : "EXPIRED", remainingSeconds: remaining, scheduledStartAt: null };
  }
  if (t.status === "RUNNING" && t.lastCalculatedAt) {
    const remaining = calculateRemaining(t.baseRemainingSeconds, t.lastCalculatedAt);
    return { timerStatus: remaining > 0 ? "RUNNING" : "EXPIRED", remainingSeconds: remaining, scheduledStartAt: null };
  }
  return { timerStatus: "EXPIRED", remainingSeconds: 0, scheduledStartAt: null };
}

export async function queryProjects(
  db: D1Database,
  params: ProjectListParams,
  ownerFilter?: OwnerFilter,
): Promise<{ projects: ProjectListItem[]; pagination: Pagination }> {
  const { searchQuery, page, limit, sort } = params;

  const conditions: string[] = ["p.status != 'DELETED'"];
  const binds: unknown[] = [];

  if (ownerFilter) {
    conditions.push(
      ownerFilter.mode === "only"
        ? "p.owner_user_id = ?"
        : "p.owner_user_id != ?",
    );
    binds.push(ownerFilter.userId);
  }

  if (searchQuery) {
    conditions.push("(p.name LIKE ? OR p.description LIKE ? OR u.nickname LIKE ?)");
    const like = `%${searchQuery}%`;
    binds.push(like, like, like);
  }

  const whereClause = conditions.join(" AND ");
  const orderClause = sort === "name" ? "p.name ASC" : "p.created_at DESC";

  // Count query
  const countSql = `SELECT COUNT(*) AS cnt FROM projects p JOIN users u ON u.id = p.owner_user_id WHERE ${whereClause}`;
  const countResult = await db.prepare(countSql).bind(...binds).first<{ cnt: number }>();
  const total = countResult?.cnt ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const offset = (page - 1) * limit;

  // Data query
  const dataSql = `
    SELECT p.id, p.name, p.description, u.nickname AS owner_nickname,
           (SELECT COUNT(*) FROM timers t WHERE t.project_id = p.id AND t.status != 'DELETED') AS timer_count,
           p.created_at,
           tm.status AS timer_status, tm.base_remaining_seconds, tm.last_calculated_at, tm.scheduled_start_at
    FROM projects p
    JOIN users u ON u.id = p.owner_user_id
    -- 프로젝트당 비삭제 타이머는 1개(idx_timers_one_per_project)라 카드가 중복되지 않는다
    LEFT JOIN timers tm ON tm.project_id = p.id AND tm.status != 'DELETED'
    WHERE ${whereClause}
    ORDER BY ${orderClause}
    LIMIT ? OFFSET ?
  `;
  const rows = await db
    .prepare(dataSql)
    .bind(...binds, limit, offset)
    .all<{
      id: string;
      name: string;
      description: string | null;
      owner_nickname: string;
      timer_count: number;
      created_at: string;
      timer_status: TimerStatus | null;
      base_remaining_seconds: number | null;
      last_calculated_at: string | null;
      scheduled_start_at: string | null;
    }>();

  const projects: ProjectListItem[] = rows.results.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    ownerNickname: r.owner_nickname,
    timerCount: r.timer_count,
    ...summarizeTimer({
      status: r.timer_status ?? null,
      baseRemainingSeconds: r.base_remaining_seconds ?? null,
      lastCalculatedAt: r.last_calculated_at ?? null,
      scheduledStartAt: r.scheduled_start_at ?? null,
    }),
    createdAt: r.created_at,
  }));

  return {
    projects,
    pagination: { page, limit, total, totalPages },
  };
}
