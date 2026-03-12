import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockDB,
  createPostRequest,
  createGetRequest,
  createPutRequest,
  parseJson,
} from "../helpers";

vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

import { getDB } from "@/lib/db";
import { POST as createTimer } from "@/app/api/projects/[id]/timers/route";
import { GET as getOverlaySettings, PUT as putOverlaySettings } from "@/app/api/timers/[id]/overlay-settings/route";
import { GET as getTimer } from "@/app/api/timers/[id]/route";

const AUTH_HEADERS = {
  "x-user-id": "user-1",
  "x-user-nickname": encodeURIComponent("테스터"),
};

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("오버레이 설정 통합 흐름", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    vi.mocked(getDB).mockResolvedValue(db as unknown as D1Database);
  });

  it("1. 타이머 생성 → 오버레이 설정 기본값 반환", async () => {
    // 타이머 생성
    db._stmt.first
      .mockResolvedValueOnce({ owner_user_id: "user-1", status: "ACTIVE" })
      .mockResolvedValueOnce({ cnt: 0 });

    const createReq = createPostRequest("/api/projects/proj-1/timers", {
      title: "오버레이 테스트 타이머",
      initialSeconds: 3600,
    }, AUTH_HEADERS);
    const createRes = await createTimer(createReq as never, makeParams("proj-1") as never);
    const createBody = await parseJson(createRes);
    expect(createRes.status).toBe(201);

    // 오버레이 설정 조회 → 기본값
    db._stmt.first
      .mockResolvedValueOnce({ id: createBody.data.id, status: "RUNNING" })
      .mockResolvedValueOnce(null); // 저장된 설정 없음

    const getReq = createGetRequest(`/api/timers/${createBody.data.id}/overlay-settings`);
    const getRes = await getOverlaySettings(getReq as never, makeParams(createBody.data.id) as never);
    const getBody = await parseJson(getRes);

    expect(getRes.status).toBe(200);
    expect(getBody.data).toEqual({
      fontSize: 72,
      color: "#ffffff",
      bg: "transparent",
      showTitle: false,
      shadow: true,
      position: "center",
    });
  });

  it("2. 오버레이 설정 저장 → 조회 시 반영 확인", async () => {
    const timerId = "timer-overlay-1";

    // PUT 설정 저장
    db._stmt.first.mockResolvedValueOnce({
      id: timerId,
      status: "RUNNING",
      owner_user_id: "user-1",
    });

    const putReq = createPutRequest(`/api/timers/${timerId}/overlay-settings`, {
      fontSize: 96,
      color: "#00ff88",
      bg: "#000000",
      showTitle: true,
      shadow: false,
      position: "top-left",
    }, AUTH_HEADERS);
    const putRes = await putOverlaySettings(putReq as never, makeParams(timerId) as never);
    const putBody = await parseJson(putRes);

    expect(putRes.status).toBe(200);
    expect(putBody.data.fontSize).toBe(96);
    expect(putBody.data.color).toBe("#00ff88");
    expect(putBody.data.position).toBe("top-left");

    // GET 조회 시 저장된 값 반환
    db._stmt.first
      .mockResolvedValueOnce({ id: timerId, status: "RUNNING" })
      .mockResolvedValueOnce({
        font_size: 96,
        text_color: "#00ff88",
        background: "#000000",
        show_title: 1,
        text_shadow: 0,
        position: "top-left",
      });

    const getReq = createGetRequest(`/api/timers/${timerId}/overlay-settings`);
    const getRes = await getOverlaySettings(getReq as never, makeParams(timerId) as never);
    const getBody = await parseJson(getRes);

    expect(getRes.status).toBe(200);
    expect(getBody.data).toEqual({
      fontSize: 96,
      color: "#00ff88",
      bg: "#000000",
      showTitle: true,
      shadow: false,
      position: "top-left",
    });
  });

  it("3. 비소유자가 오버레이 설정 변경 시도 → 403, 조회는 가능", async () => {
    const timerId = "timer-overlay-2";

    // 비소유자가 PUT 시도 → 403
    db._stmt.first.mockResolvedValueOnce({
      id: timerId,
      status: "RUNNING",
      owner_user_id: "user-1",
    });

    const putReq = createPutRequest(`/api/timers/${timerId}/overlay-settings`, {
      fontSize: 120,
    }, { "x-user-id": "other-user", "x-user-nickname": encodeURIComponent("다른유저") });
    const putRes = await putOverlaySettings(putReq as never, makeParams(timerId) as never);
    expect(putRes.status).toBe(403);

    // 비소유자도 GET 조회는 가능 (인증 불필요)
    db._stmt.first
      .mockResolvedValueOnce({ id: timerId, status: "RUNNING" })
      .mockResolvedValueOnce(null);

    const getReq = createGetRequest(`/api/timers/${timerId}/overlay-settings`);
    const getRes = await getOverlaySettings(getReq as never, makeParams(timerId) as never);
    expect(getRes.status).toBe(200);
  });

  it("4. 오버레이 설정 부분 업데이트 → 미지정 필드는 기본값 적용", async () => {
    const timerId = "timer-overlay-3";

    // fontSize만 변경, 나머지는 기본값
    db._stmt.first.mockResolvedValueOnce({
      id: timerId,
      status: "RUNNING",
      owner_user_id: "user-1",
    });

    const putReq = createPutRequest(`/api/timers/${timerId}/overlay-settings`, {
      fontSize: 120,
    }, AUTH_HEADERS);
    const putRes = await putOverlaySettings(putReq as never, makeParams(timerId) as never);
    const putBody = await parseJson(putRes);

    expect(putRes.status).toBe(200);
    expect(putBody.data.fontSize).toBe(120);
    // 나머지는 기본값
    expect(putBody.data.color).toBe("#ffffff");
    expect(putBody.data.bg).toBe("transparent");
    expect(putBody.data.showTitle).toBe(false);
    expect(putBody.data.shadow).toBe(true);
    expect(putBody.data.position).toBe("center");
  });
});
