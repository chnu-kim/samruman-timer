import type { ProjectListItem, Pagination } from "@/types";

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
  const q = searchParams.get("q")?.trim() || undefined;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const rawLimit = parseInt(searchParams.get("limit") ?? "12", 10) || 12;
  const limit = Math.min(50, Math.max(1, rawLimit));
  const sort = searchParams.get("sort") === "name" ? "name" : "latest";

  return { searchQuery: q, page, limit, sort };
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
           p.created_at
    FROM projects p
    JOIN users u ON u.id = p.owner_user_id
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
    }>();

  const projects: ProjectListItem[] = rows.results.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    ownerNickname: r.owner_nickname,
    timerCount: r.timer_count,
    createdAt: r.created_at,
  }));

  return {
    projects,
    pagination: { page, limit, total, totalPages },
  };
}
