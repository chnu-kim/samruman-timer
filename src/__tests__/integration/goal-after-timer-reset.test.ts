import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDeleteRequest, createGetRequest, createPostRequest, parseJson } from "../helpers";
import { createSqliteD1 } from "../sqlite-d1";

vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, getDB: vi.fn() };
});

import { getDB } from "@/lib/db";
import { POST as createTimerRoute } from "@/app/api/projects/[id]/timers/route";
import { DELETE as deleteTimerRoute } from "@/app/api/timers/[id]/route";
import { GET as listGoalsRoute, POST as createGoalRoute } from "@/app/api/projects/[id]/goals/route";

// '타이머 초기화(목표 유지)'의 실제 범위를 고정한다.
// 목표 행은 남지만 진행률은 현재 타이머의 기록으로 계산하므로, 진행 중인 목표는 0부터 다시 쌓인다.
// 확인창 문구(src/app/projects/[id]/page.tsx)가 이 동작을 근거로 안내한다.

const OWNER = "user-1";
const PROJECT = "b".repeat(32);
const T0 = new Date("2026-10-04T12:00:00.000Z").getTime();
const AUTH = { "x-user-id": OWNER, "x-user-nickname": encodeURIComponent("삼루먼") };
const params = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

let db: ReturnType<typeof createSqliteD1>;

function at(seconds: number) {
  vi.setSystemTime(T0 + seconds * 1000);
}

async function createTimer(initialSeconds: number): Promise<string> {
  const res = await createTimerRoute(
    createPostRequest(`/api/projects/${PROJECT}/timers`, { title: "초기화 테스트", initialSeconds }, AUTH) as never,
    params(PROJECT),
  );
  expect(res.status).toBe(201);
  return (await parseJson(res)).data.id;
}

async function listGoals() {
  const res = await listGoalsRoute(createGetRequest(`/api/projects/${PROJECT}/goals`, AUTH) as never, params(PROJECT));
  expect(res.status).toBe(200);
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

describe("타이머 초기화 뒤 목표", () => {
  it("진행 중인 DURATION 목표는 행과 상태가 남고 진행률은 0부터 새 타이머 기준으로 다시 쌓인다", async () => {
    const timerId = await createTimer(43200);
    const created = await createGoalRoute(
      createPostRequest(`/api/projects/${PROJECT}/goals`, { type: "DURATION", title: "12시간 달성", targetSeconds: 43200 }, AUTH) as never,
      params(PROJECT),
    );
    expect(created.status).toBe(201);

    at(34560); // 12시간의 80% 소비
    expect((await listGoals())[0].progress.percentage).toBe(80);

    const del = await deleteTimerRoute(createDeleteRequest(`/api/timers/${timerId}`, AUTH) as never, params(timerId));
    expect(del.status).toBe(200);

    const [afterReset] = await listGoals();
    expect(afterReset.status).toBe("ACTIVE");
    expect(afterReset.progress.percentage).toBe(0);
    expect(afterReset.progress.currentSeconds).toBe(0);

    await createTimer(3600);
    at(34560 + 100);
    expect((await listGoals())[0].progress.currentSeconds).toBe(100);
  });
});
