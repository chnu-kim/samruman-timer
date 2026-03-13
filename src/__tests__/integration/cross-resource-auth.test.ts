import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockDB,
  createPostRequest,
  createPatchRequest,
  createDeleteRequest,
  createPutRequest,
  createGetRequest,
  parseJson,
} from "../helpers";

vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

import { getDB } from "@/lib/db";
import { PATCH as patchProject, DELETE as deleteProject } from "@/app/api/projects/[id]/route";
import { POST as createTimer } from "@/app/api/projects/[id]/timers/route";
import { PATCH as patchTimer, DELETE as deleteTimer } from "@/app/api/timers/[id]/route";
import { POST as modifyTimer } from "@/app/api/timers/[id]/modify/route";
import { PUT as putOverlaySettings } from "@/app/api/timers/[id]/overlay-settings/route";
import { GET as getTimerStats } from "@/app/api/timers/[id]/stats/route";

const OWNER_HEADERS = {
  "x-user-id": "owner-1",
  "x-user-nickname": encodeURIComponent("소유자"),
};

const OTHER_HEADERS = {
  "x-user-id": "other-user",
  "x-user-nickname": encodeURIComponent("다른유저"),
};

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("교차 리소스 인가 통합 테스트", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
  });

  describe("프로젝트 소유권 검증", () => {
    it("비소유자 프로젝트 수정 → 403", async () => {
      db._stmt.first.mockResolvedValueOnce({
        id: "proj-1",
        owner_user_id: "owner-1",
        status: "ACTIVE",
      });

      const req = createPatchRequest("/api/projects/proj-1", {
        name: "탈취 시도",
      }, OTHER_HEADERS);
      const res = await patchProject(req as never, makeParams("proj-1") as never);
      expect(res.status).toBe(403);
    });

    it("비소유자 프로젝트 삭제 → 403", async () => {
      db._stmt.first.mockResolvedValueOnce({
        id: "proj-1",
        owner_user_id: "owner-1",
        status: "ACTIVE",
      });

      const req = createDeleteRequest("/api/projects/proj-1", OTHER_HEADERS);
      const res = await deleteProject(req as never, makeParams("proj-1") as never);
      expect(res.status).toBe(403);
    });

    it("비소유자 타이머 생성 → 403", async () => {
      db._stmt.first.mockResolvedValueOnce({
        owner_user_id: "owner-1",
        status: "ACTIVE",
      });

      const req = createPostRequest("/api/projects/proj-1/timers", {
        title: "탈취 타이머",
        initialSeconds: 3600,
      }, OTHER_HEADERS);
      const res = await createTimer(req as never, makeParams("proj-1") as never);
      expect(res.status).toBe(403);
    });
  });

  describe("타이머 소유권 검증", () => {
    const timerRow = {
      id: "timer-1",
      project_id: "proj-1",
      title: "테스트 타이머",
      description: null,
      base_remaining_seconds: 3600,
      last_calculated_at: new Date().toISOString(),
      status: "RUNNING",
      scheduled_start_at: null,
      created_by: "owner-1",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
      owner_user_id: "owner-1",
    };

    it("비소유자 타이머 시간 변경 → 403", async () => {
      db._stmt.first.mockResolvedValueOnce(timerRow);

      const req = createPostRequest("/api/timers/timer-1/modify", {
        action: "ADD",
        deltaSeconds: 600,
        actorName: "해커",
      }, OTHER_HEADERS);
      const res = await modifyTimer(req as never, makeParams("timer-1") as never);
      expect(res.status).toBe(403);
    });

    it("비소유자 타이머 제목 수정 → 403", async () => {
      db._stmt.first.mockResolvedValueOnce({
        id: "timer-1",
        status: "RUNNING",
        owner_user_id: "owner-1",
      });

      const req = createPatchRequest("/api/timers/timer-1", {
        title: "탈취된 제목",
      }, OTHER_HEADERS);
      const res = await patchTimer(req as never, makeParams("timer-1") as never);
      expect(res.status).toBe(403);
    });

    it("비소유자 타이머 삭제 → 403", async () => {
      db._stmt.first.mockResolvedValueOnce({
        id: "timer-1",
        base_remaining_seconds: 3600,
        last_calculated_at: new Date().toISOString(),
        status: "RUNNING",
        owner_user_id: "owner-1",
      });

      const req = createDeleteRequest("/api/timers/timer-1", OTHER_HEADERS);
      const res = await deleteTimer(req as never, makeParams("timer-1") as never);
      expect(res.status).toBe(403);
    });

    it("비소유자 오버레이 설정 변경 → 403", async () => {
      db._stmt.first.mockResolvedValueOnce({
        id: "timer-1",
        status: "RUNNING",
        owner_user_id: "owner-1",
      });

      const req = createPutRequest("/api/timers/timer-1/overlay-settings", {
        fontSize: 120,
      }, OTHER_HEADERS);
      const res = await putOverlaySettings(req as never, makeParams("timer-1") as never);
      expect(res.status).toBe(403);
    });

    it("비소유자 타이머 통계 조회 → 403", async () => {
      db._stmt.first.mockResolvedValueOnce({ id: "timer-1", owner_user_id: "owner-1" });

      const req = createGetRequest("/api/timers/timer-1/stats", OTHER_HEADERS);
      const res = await getTimerStats(req as never, makeParams("timer-1") as never);
      expect(res.status).toBe(403);
    });

  });

  describe("미인증 요청 검증", () => {
    it("미인증 타이머 시간 변경 → 401", async () => {
      const req = createPostRequest("/api/timers/timer-1/modify", {
        action: "ADD",
        deltaSeconds: 600,
        actorName: "익명",
      });
      const res = await modifyTimer(req as never, makeParams("timer-1") as never);
      expect(res.status).toBe(401);
    });

    it("미인증 타이머 수정 → 401", async () => {
      const req = createPatchRequest("/api/timers/timer-1", {
        title: "수정 시도",
      });
      const res = await patchTimer(req as never, makeParams("timer-1") as never);
      expect(res.status).toBe(401);
    });

    it("미인증 타이머 삭제 → 401", async () => {
      const req = createDeleteRequest("/api/timers/timer-1");
      const res = await deleteTimer(req as never, makeParams("timer-1") as never);
      expect(res.status).toBe(401);
    });

    it("미인증 오버레이 설정 변경 → 401", async () => {
      const req = createPutRequest("/api/timers/timer-1/overlay-settings", {
        fontSize: 120,
      });
      const res = await putOverlaySettings(req as never, makeParams("timer-1") as never);
      expect(res.status).toBe(401);
    });
  });

  describe("소유자 정상 접근 검증", () => {
    it("소유자 타이머 시간 변경 → 200", async () => {
      db._stmt.first.mockResolvedValue({
        id: "timer-1",
        project_id: "proj-1",
        title: "테스트",
        description: null,
        base_remaining_seconds: 3600,
        last_calculated_at: new Date().toISOString(),
        status: "RUNNING",
        scheduled_start_at: null,
        created_by: "owner-1",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        owner_user_id: "owner-1",
      });

      const req = createPostRequest("/api/timers/timer-1/modify", {
        action: "ADD",
        deltaSeconds: 600,
        actorName: "시청자",
      }, OWNER_HEADERS);
      const res = await modifyTimer(req as never, makeParams("timer-1") as never);
      expect(res.status).toBe(200);
    });

    it("소유자 오버레이 설정 변경 → 200", async () => {
      db._stmt.first.mockResolvedValueOnce({
        id: "timer-1",
        status: "RUNNING",
        owner_user_id: "owner-1",
      });

      const req = createPutRequest("/api/timers/timer-1/overlay-settings", {
        fontSize: 96,
        position: "bottom-right",
      }, OWNER_HEADERS);
      const res = await putOverlaySettings(req as never, makeParams("timer-1") as never);
      const body = await parseJson(res);

      expect(res.status).toBe(200);
      expect(body.data.fontSize).toBe(96);
      expect(body.data.position).toBe("bottom-right");
    });
  });
});
