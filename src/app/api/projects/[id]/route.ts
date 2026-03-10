import { NextRequest, NextResponse } from "next/server";
import { getDB, withErrorHandler } from "@/lib/db";

export const GET = withErrorHandler(async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const db = await getDB();

  const row = await db
    .prepare(
      `SELECT p.id, p.name, p.description, p.created_at, p.updated_at,
              u.id AS owner_id, u.nickname AS owner_nickname, u.profile_image_url AS owner_profile_image_url
       FROM projects p
       JOIN users u ON u.id = p.owner_user_id
       WHERE p.id = ?`
    )
    .bind(id)
    .first<{
      id: string;
      name: string;
      description: string | null;
      created_at: string;
      updated_at: string;
      owner_id: string;
      owner_nickname: string;
      owner_profile_image_url: string | null;
    }>();

  if (!row) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "프로젝트를 찾을 수 없습니다" } },
      { status: 404 }
    );
  }

  return NextResponse.json({
    data: {
      id: row.id,
      name: row.name,
      description: row.description,
      owner: {
        id: row.owner_id,
        nickname: row.owner_nickname,
        profileImageUrl: row.owner_profile_image_url,
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
});
