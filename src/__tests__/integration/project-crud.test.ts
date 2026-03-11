import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockDB,
  createPostRequest,
  createGetRequest,
  createPatchRequest,
  createDeleteRequest,
  parseJson,
} from "../helpers";

vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

import { getDB } from "@/lib/db";
import { POST as createProject, GET as listProjects } from "@/app/api/projects/route";
import { GET as getProject, PATCH as patchProject, DELETE as deleteProject } from "@/app/api/projects/[id]/route";

const AUTH_HEADERS = {
  "x-user-id": "user-1",
  "x-user-nickname": encodeURIComponent("테스터"),
};

describe("프로젝트 CRUD 통합 테스트", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
  });

  it("1. 프로젝트 생성 → 201", async () => {
    const req = createPostRequest("/api/projects", {
      name: "통합테스트 프로젝트",
      description: "설명입니다",
    }, AUTH_HEADERS);
    const res = await createProject(req as never);
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.data.name).toBe("통합테스트 프로젝트");
    expect(body.data.description).toBe("설명입니다");
    expect(body.data.ownerUserId).toBe("user-1");
    expect(body.data.id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("2. 프로젝트 목록에서 확인", async () => {
    db._stmt.first.mockResolvedValue({ cnt: 1 });
    db._stmt.all.mockResolvedValue({
      results: [
        {
          id: "proj-1",
          name: "통합테스트 프로젝트",
          description: "설명입니다",
          owner_nickname: "테스터",
          timer_count: 0,
          created_at: "2025-01-01T00:00:00Z",
        },
      ],
    });

    const req = createGetRequest("/api/projects");
    const res = await listProjects(req as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.projects).toHaveLength(1);
    expect(body.data.projects[0].name).toBe("통합테스트 프로젝트");
  });

  it("3. 프로젝트 상세 조회", async () => {
    db._stmt.first.mockResolvedValue({
      id: "proj-1",
      name: "통합테스트 프로젝트",
      description: "설명입니다",
      status: "ACTIVE",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
      owner_id: "user-1",
      owner_nickname: "테스터",
      owner_profile_image_url: null,
    });

    const req = createGetRequest("/api/projects/proj-1");
    const res = await getProject(req as never, { params: Promise.resolve({ id: "proj-1" }) } as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.name).toBe("통합테스트 프로젝트");
    expect(body.data.owner.nickname).toBe("테스터");
  });

  it("4. 프로젝트 수정 (name, description)", async () => {
    db._stmt.first
      .mockResolvedValueOnce({ id: "proj-1", owner_user_id: "user-1", status: "ACTIVE" })
      .mockResolvedValueOnce({
        id: "proj-1",
        name: "수정된 이름",
        description: "수정된 설명",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-06-01T00:00:00Z",
        owner_id: "user-1",
        owner_nickname: "테스터",
        owner_profile_image_url: null,
      });

    const req = createPatchRequest("/api/projects/proj-1", {
      name: "수정된 이름",
      description: "수정된 설명",
    }, AUTH_HEADERS);
    const res = await patchProject(req as never, { params: Promise.resolve({ id: "proj-1" }) } as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.name).toBe("수정된 이름");
    expect(body.data.description).toBe("수정된 설명");
  });

  it("5. 프로젝트 삭제 → 하위 타이머도 삭제", async () => {
    db._stmt.first.mockResolvedValue({
      id: "proj-1",
      owner_user_id: "user-1",
      status: "ACTIVE",
    });
    db._stmt.all.mockResolvedValue({
      results: [
        {
          id: "timer-1",
          base_remaining_seconds: 3600,
          last_calculated_at: new Date().toISOString(),
          status: "RUNNING",
        },
      ],
    });

    const req = createDeleteRequest("/api/projects/proj-1", AUTH_HEADERS);
    const res = await deleteProject(req as never, { params: Promise.resolve({ id: "proj-1" }) } as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.id).toBe("proj-1");
    // batch 호출: 프로젝트 삭제 + 타이머 일괄 삭제 + DELETE 로그
    expect(db.batch).toHaveBeenCalledTimes(1);
  });
});
