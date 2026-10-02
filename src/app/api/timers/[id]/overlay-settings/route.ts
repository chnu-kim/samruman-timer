import { NextRequest, NextResponse } from "next/server";
import { getDB, nowISO, withErrorHandler } from "@/lib/db";
import type { OverlayPosition, OverlaySettingsResponse } from "@/types";
import { isOverlayBackground, isOverlayColor } from "@/lib/overlay-style";

const DEFAULT_SETTINGS: OverlaySettingsResponse = {
  fontSize: 72,
  color: "#ffffff",
  bg: "transparent",
  showTitle: false,
  shadow: true,
  position: "center",
  animation: true,
};

const VALID_POSITIONS: OverlayPosition[] = [
  "center",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

export const GET = withErrorHandler(
  async (
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    const { id } = await params;
    const db = await getDB();

    const timer = await db
      .prepare("SELECT id, status FROM timers WHERE id = ?")
      .bind(id)
      .first<{ id: string; status: string }>();

    if (!timer || timer.status === "DELETED") {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "타이머를 찾을 수 없습니다",
          },
        },
        { status: 404 }
      );
    }

    const row = await db
      .prepare(
        "SELECT font_size, text_color, background, show_title, text_shadow, position, animation FROM overlay_settings WHERE timer_id = ?"
      )
      .bind(id)
      .first<{
        font_size: number;
        text_color: string;
        background: string;
        show_title: number;
        text_shadow: number;
        position: string;
        animation: number;
      }>();

    if (!row) {
      return NextResponse.json({ data: DEFAULT_SETTINGS });
    }

    const data: OverlaySettingsResponse = {
      fontSize: row.font_size,
      color: row.text_color,
      bg: row.background,
      showTitle: row.show_title === 1,
      shadow: row.text_shadow === 1,
      position: row.position as OverlayPosition,
      animation: row.animation === 1,
    };

    return NextResponse.json({ data });
  }
);

export const PUT = withErrorHandler(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    const { id } = await params;
    const userId = request.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json(
        {
          error: { code: "UNAUTHORIZED", message: "인증이 필요합니다" },
        },
        { status: 401 }
      );
    }

    const db = await getDB();

    const row = await db
      .prepare(
        `SELECT t.id, t.status, p.owner_user_id
       FROM timers t
       JOIN projects p ON p.id = t.project_id
       WHERE t.id = ?`
      )
      .bind(id)
      .first<{ id: string; status: string; owner_user_id: string }>();

    if (!row || row.status === "DELETED") {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "타이머를 찾을 수 없습니다",
          },
        },
        { status: 404 }
      );
    }

    if (row.owner_user_id !== userId) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "프로젝트 소유자만 오버레이 설정을 변경할 수 있습니다",
          },
        },
        { status: 403 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "유효한 JSON 본문이 필요합니다",
          },
        },
        { status: 400 }
      );
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "요청 본문은 JSON 객체여야 합니다" } },
        { status: 400 }
      );
    }

    // Validate fields
    const fontSize =
      body.fontSize !== undefined ? Number(body.fontSize) : DEFAULT_SETTINGS.fontSize;
    if (!Number.isInteger(fontSize) || fontSize < 24 || fontSize > 200) {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "fontSize는 24~200 사이의 정수여야 합니다",
          },
        },
        { status: 400 }
      );
    }

    const color = body.color !== undefined ? body.color : DEFAULT_SETTINGS.color;
    if (typeof color !== "string" || !isOverlayColor(color)) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "color는 #rrggbb 형식이어야 합니다" } },
        { status: 400 }
      );
    }
    const bg = body.bg !== undefined ? body.bg : DEFAULT_SETTINGS.bg;
    if (typeof bg !== "string" || !isOverlayBackground(bg)) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "bg는 transparent 또는 #rrggbb 형식이어야 합니다" } },
        { status: 400 }
      );
    }

    for (const key of ["showTitle", "shadow", "animation"] as const) {
      if (body[key] !== undefined && typeof body[key] !== "boolean") {
        return NextResponse.json(
          { error: { code: "BAD_REQUEST", message: `${key}는 boolean이어야 합니다` } },
          { status: 400 }
        );
      }
    }
    const showTitle = (body.showTitle as boolean | undefined) ?? DEFAULT_SETTINGS.showTitle;
    const shadow = (body.shadow as boolean | undefined) ?? DEFAULT_SETTINGS.shadow;
    const animation = (body.animation as boolean | undefined) ?? DEFAULT_SETTINGS.animation;

    const position =
      body.position !== undefined
        ? String(body.position)
        : DEFAULT_SETTINGS.position;
    if (!VALID_POSITIONS.includes(position as OverlayPosition)) {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "유효하지 않은 position 값입니다",
          },
        },
        { status: 400 }
      );
    }

    const now = nowISO();

    await db
      .prepare(
        `INSERT INTO overlay_settings (timer_id, font_size, text_color, background, show_title, text_shadow, position, animation, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(timer_id) DO UPDATE SET
         font_size = excluded.font_size,
         text_color = excluded.text_color,
         background = excluded.background,
         show_title = excluded.show_title,
         text_shadow = excluded.text_shadow,
         position = excluded.position,
         animation = excluded.animation,
         updated_at = excluded.updated_at`
      )
      .bind(
        id,
        fontSize,
        color,
        bg,
        showTitle ? 1 : 0,
        shadow ? 1 : 0,
        position,
        animation ? 1 : 0,
        now
      )
      .run();

    const data: OverlaySettingsResponse = {
      fontSize,
      color,
      bg,
      showTitle,
      shadow,
      position: position as OverlayPosition,
      animation,
    };

    return NextResponse.json({ data });
  }
);
