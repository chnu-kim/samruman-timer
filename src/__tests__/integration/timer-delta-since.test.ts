import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createGetRequest, createPostRequest, parseJson } from "../helpers";
import { createSqliteD1 } from "../sqlite-d1";

vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

import { getDB } from "@/lib/db";
import { POST as createTimerRoute } from "@/app/api/projects/[id]/timers/route";
import { POST as modifyRoute } from "@/app/api/timers/[id]/modify/route";
import { POST as revertRoute } from "@/app/api/timers/[id]/logs/[logId]/revert/route";
import { GET as getTimerRoute } from "@/app/api/timers/[id]/route";

// GET ?since=의 deltaSinceSeconds는 created_at·reverted_at 구간 조건이 핵심이라 실제 SQLite로 검증한다

const OWNER = "user-1";
const PROJECT = "a".repeat(32);
const T0 = new Date("2026-10-04T12:00:00.000Z").getTime();
const AUTH = { "x-user-id": OWNER, "x-user-nickname": encodeURIComponent("삼루먼") };

let db: ReturnType<typeof createSqliteD1>;

function at(seconds: number) {
  vi.setSystemTime(T0 + seconds * 1000);
}

async function createTimer(initialSeconds: number): Promise<string> {
  const res = await createTimerRoute(
    createPostRequest(`/api/projects/${PROJECT}/timers`, { title: "변경량 테스트", initialSeconds }, AUTH) as never,
    { params: Promise.resolve({ id: PROJECT }) } as never,
  );
  expect(res.status).toBe(201);
  return (await parseJson(res)).data.id;
}

async function modify(timerId: string, action: "ADD" | "SUBTRACT", deltaSeconds: number) {
  const res = await modifyRoute(
    createPostRequest(`/api/timers/${timerId}/modify`, { action, deltaSeconds, actorName: "삼루먼" }, AUTH) as never,
    { params: Promise.resolve({ id: timerId }) } as never,
  );
  expect(res.status).toBe(200);
  return (await parseJson(res)).data;
}

async function revert(timerId: string, logId: string) {
  const res = await revertRoute(
    createPostRequest(`/api/timers/${timerId}/logs/${logId}/revert`, {}, AUTH) as never,
    { params: Promise.resolve({ id: timerId, logId }) } as never,
  );
  expect(res.status).toBe(200);
}

async function poll(timerId: string, since?: string) {
  const q = since ? `?since=${encodeURIComponent(since)}` : "";
  const res = await getTimerRoute(createGetRequest(`/api/timers/${timerId}${q}`) as never, {
    params: Promise.resolve({ id: timerId }),
  } as never);
  return (await parseJson(res)).data;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at(0);
  db = createSqliteD1();
  db.raw.exec(`INSERT INTO users (id, chzzk_user_id, nickname) VALUES ('${OWNER}', 'chzzk-1', '삼루먼')`);
  db.raw.exec(`INSERT INTO projects (id, name, owner_user_id) VALUES ('${PROJECT}', '프로젝트', '${OWNER}')`);
  vi.mocked(getDB).mockResolvedValue(db);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/timers/[id]?since= deltaSinceSeconds", () => {
  it("since 뒤의 추가·차감을 합하고, since와 같은 시각의 기록은 넣지 않는다", async () => {
    const timerId = await createTimer(3600);
    at(1);
    await modify(timerId, "ADD", 60);
    const seen = await poll(timerId); // 오버레이가 본 updatedAt = 첫 추가 시각

    at(3);
    await modify(timerId, "ADD", 60);
    at(4);
    await modify(timerId, "SUBTRACT", 30);
    at(5);
    expect((await poll(timerId, seen.updatedAt)).deltaSinceSeconds).toBe(30); // since 시각의 첫 +60은 빠지고 +60 - 30
  });

  it("만료 뒤 추가(REOPEN)는 실제로 늘어난 만큼, 0에서 멈춘 차감은 실제로 줄어든 만큼", async () => {
    const timerId = await createTimer(10);
    at(20); // 이미 0초
    const expired = await poll(timerId);
    expect(expired.status).toBe("EXPIRED");

    at(22);
    await modify(timerId, "ADD", 60);
    const reopened = await poll(timerId, expired.updatedAt);
    expect(reopened.status).toBe("RUNNING");
    expect(reopened.deltaSinceSeconds).toBe(60);

    at(30); // 52초 남음
    await modify(timerId, "SUBTRACT", 3600);
    expect((await poll(timerId, reopened.updatedAt)).deltaSinceSeconds).toBe(-52);
  });

  it("같은 폴링 구간에서 추가하고 바로 되돌리면 실제 변경량을 주지 않는다(가짜 '+N' 방지)", async () => {
    const timerId = await createTimer(3600);
    const seen = await poll(timerId);

    at(1);
    const a = await modify(timerId, "ADD", 600);
    at(2);
    await revert(timerId, a.log.id);
    at(3);
    const data = await poll(timerId, seen.updatedAt);
    expect(data.remainingSeconds).toBe(3597);
    // 필드를 빼서 클라이언트가 폴링 시각으로 추정하게 한다(잔여가 그대로라 연출 없음)
    expect(data).not.toHaveProperty("deltaSinceSeconds");
  });

  it("되돌리기만 있는 구간도 null('변경 없음')이 아니라 필드를 빼서 추정으로 '-N'을 보이게 한다", async () => {
    const timerId = await createTimer(3600);
    at(1);
    const a = await modify(timerId, "ADD", 600);
    const seen = await poll(timerId);

    at(10);
    await revert(timerId, a.log.id);
    at(11);
    const data = await poll(timerId, seen.updatedAt);
    expect(data.remainingSeconds).toBe(3589);
    expect(data).not.toHaveProperty("deltaSinceSeconds");
  });

  it("되돌리기가 since 이전이면 영향이 없다", async () => {
    const timerId = await createTimer(3600);
    at(1);
    const a = await modify(timerId, "ADD", 600);
    at(2);
    await revert(timerId, a.log.id);
    const seen = await poll(timerId);

    at(4);
    await modify(timerId, "ADD", 60);
    expect((await poll(timerId, seen.updatedAt)).deltaSinceSeconds).toBe(60);
  });
});
