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
import { GET as getLogsRoute } from "@/app/api/timers/[id]/logs/route";
import { GET as getStatsRoute } from "@/app/api/timers/[id]/stats/route";
import { GET as getGraphRoute } from "@/app/api/timers/[id]/graph/route";
import { loadProgressSnapshot } from "@/lib/goal";
import { revertTimerLog, reloadTimerState } from "@/lib/timer";
import type { Timer } from "@/types";

// 되돌리기(로그 취소 처리)는 SQL 조건(reverted_at IS NULL, CAS)이 핵심이라 실제 SQLite에 마이그레이션을 적용해 검증한다

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
    createPostRequest(`/api/projects/${PROJECT}/timers`, { title: "되돌리기 테스트", initialSeconds }, AUTH) as never,
    { params: Promise.resolve({ id: PROJECT }) } as never,
  );
  expect(res.status).toBe(201);
  return (await parseJson(res)).data.id;
}

async function modify(timerId: string, action: "ADD" | "SUBTRACT", deltaSeconds: number, actorName: string) {
  const res = await modifyRoute(
    createPostRequest(`/api/timers/${timerId}/modify`, { action, deltaSeconds, actorName }, AUTH) as never,
    { params: Promise.resolve({ id: timerId }) } as never,
  );
  expect(res.status).toBe(200);
  return (await parseJson(res)).data;
}

async function revert(timerId: string, logId: string, headers: Record<string, string> = AUTH) {
  const res = await revertRoute(
    createPostRequest(`/api/timers/${timerId}/logs/${logId}/revert`, {}, headers) as never,
    { params: Promise.resolve({ id: timerId, logId }) } as never,
  );
  return { status: res.status, body: await parseJson(res) };
}

async function get(route: typeof getTimerRoute, url: string, timerId: string) {
  const res = await route(createGetRequest(url, AUTH) as never, { params: Promise.resolve({ id: timerId }) } as never);
  return (await parseJson(res)).data;
}

function logRows(timerId: string) {
  return db.raw
    .prepare("SELECT action_type, actor_name, delta_seconds, before_seconds, after_seconds, reverted_at FROM timer_logs WHERE timer_id = ? ORDER BY created_at, rowid")
    .all(timerId) as { action_type: string; actor_name: string; delta_seconds: number; before_seconds: number; after_seconds: number; reverted_at: string | null }[];
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at(0);
  db = createSqliteD1();
  db.raw.exec(`INSERT INTO users (id, chzzk_user_id, nickname) VALUES ('${OWNER}', 'chzzk-1', '삼루먼'), ('user-2', 'chzzk-2', '남')`);
  db.raw.exec(`INSERT INTO projects (id, name, owner_user_id) VALUES ('${PROJECT}', '프로젝트', '${OWNER}')`);
  vi.mocked(getDB).mockResolvedValue(db);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("되돌리기: 다른 기기 변경이 끼어든 뒤", () => {
  it("그 기록의 변경량만 되돌리고, 기록은 남기되 통계·그래프·목표 집계에서 뺀다", async () => {
    const timerId = await createTimer(3600);

    at(10);
    const a = await modify(timerId, "ADD", 36000, "삼루먼"); // 잘못 누른 +10시간
    at(20);
    await modify(timerId, "ADD", 600, "다른기기"); // 다른 기기의 +10분

    at(25);
    const { status, body } = await revert(timerId, a.log.id);
    expect(status).toBe(200);
    // 3600 + 36000 + 600 - 25초 경과 - 36000
    expect(body.data.remainingSeconds).toBe(4175);
    expect(body.data.status).toBe("RUNNING");
    // modify와 같이 변경 뒤 updatedAt을 준다(콘솔의 외부 변경 판정)
    expect(body.data.updatedAt).toEqual(expect.any(String));
    expect(body.data.log.id).toBe(a.log.id);
    expect(body.data.log.revertedAt).toBe(new Date(T0 + 25_000).toISOString());

    // 상쇄 행 없음: CREATE, ADD(되돌림), ADD
    const rows = logRows(timerId);
    expect(rows.map((r) => r.action_type)).toEqual(["CREATE", "ADD", "ADD"]);
    expect(rows[1].reverted_at).not.toBeNull();
    expect(rows[2].reverted_at).toBeNull();

    // 기록 목록은 되돌린 행을 그대로 보여 주고 revertedAt을 싣는다
    const logs = await get(getLogsRoute, `/api/timers/${timerId}/logs`, timerId);
    expect(logs.pagination.total).toBe(3);
    const revertedLog = logs.logs.find((l: { id: string }) => l.id === a.log.id);
    expect(revertedLog.revertedAt).not.toBeNull();

    // 통계: 되돌린 +10시간은 총합·순위·횟수에서 빠진다
    const stats = await get(getStatsRoute, `/api/timers/${timerId}/stats`, timerId);
    expect(stats.summary.totalAddedSeconds).toBe(600);
    expect(stats.summary.totalEvents).toBe(1);
    expect(stats.summary.uniqueDonors).toBe(1);
    expect(stats.topDonors.map((d: { actorName: string }) => d.actorName)).toEqual(["다른기기"]);
    expect(stats.dailyActivity[0].addedSeconds).toBe(600);
    expect(stats.hourlyDistribution[0].eventCount).toBe(1);

    // 그래프: 누적·빈도·잔여 모두 되돌린 행 제외
    const cumulative = await get(getGraphRoute, `/api/timers/${timerId}/graph?mode=cumulative`, timerId);
    expect(cumulative.points).toHaveLength(1);
    expect(cumulative.points[0].totalAdded).toBe(600);
    const frequency = await get(getGraphRoute, `/api/timers/${timerId}/graph?mode=frequency`, timerId);
    expect(frequency.buckets[0].adds).toBe(1);
    const remaining = await get(getGraphRoute, `/api/timers/${timerId}/graph?mode=remaining`, timerId);
    expect(remaining.points).toHaveLength(2);

    // 목표 진행(소비 시간)은 실제 경과 25초 그대로. 되돌린 +10시간이 소비로 잡히지 않는다
    expect((await loadProgressSnapshot(db, PROJECT)).runningSeconds).toBe(25);
  });

  it("이미 되돌린 기록은 409이고 잔여 시간이 다시 바뀌지 않는다", async () => {
    const timerId = await createTimer(3600);
    const a = await modify(timerId, "ADD", 600, "삼루먼");
    expect((await revert(timerId, a.log.id)).status).toBe(200);

    const again = await revert(timerId, a.log.id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("CONFLICT");
    const timer = await get(getTimerRoute, `/api/timers/${timerId}`, timerId);
    expect(timer.remainingSeconds).toBe(3600);
  });

  it("두 요청이 같은 기록을 동시에 되돌려도(둘 다 미취소로 읽음) 한 번만 적용된다", async () => {
    const timerId = await createTimer(3600);
    const a = await modify(timerId, "ADD", 600, "삼루먼");
    const before = await reloadTimerState(db, { id: timerId } as Timer);
    await revertTimerLog(db, before, a.log.id);

    // 두 번째 요청은 되돌리기 전 상태를 읽었다고 가정한다(기록 조회가 늘 미취소를 돌려주게 가로챈다)
    const stale = {
      ...db,
      prepare(sql: string) {
        const stmt = db.prepare(sql);
        if (!sql.includes("FROM timer_logs WHERE id = ? AND timer_id = ?")) return stmt;
        return {
          bind: (...args: unknown[]) => {
            const bound = stmt.bind(...args);
            const first = bound.first.bind(bound);
            return Object.assign(bound, {
              first: async () => ({ ...(await first<Record<string, unknown>>()), reverted_at: null }),
            });
          },
        };
      },
      batch: db.batch,
    } as unknown as D1Database;

    await expect(revertTimerLog(stale, await reloadTimerState(db, before), a.log.id)).rejects.toMatchObject({ status: 409 });
    const after = await reloadTimerState(db, before);
    expect(after.baseRemainingSeconds).toBe(3600);
  });
});

describe("되돌리기: 만료와 경계", () => {
  it("차감으로 만료된 타이머를 되돌리면 실제로 줄인 양만큼 다시 시작한다(REOPEN)", async () => {
    const timerId = await createTimer(300);
    at(10);
    const sub = await modify(timerId, "SUBTRACT", 3600, "삼루먼");
    // 만료돼도 응답의 log는 EXPIRE가 아니라 되돌릴 SUBTRACT 기록이다
    expect(sub.status).toBe("EXPIRED");
    expect(sub.log.actionType).toBe("SUBTRACT");

    at(15);
    const { status, body } = await revert(timerId, sub.log.id);
    expect(status).toBe(200);
    expect(body.data.status).toBe("RUNNING");
    expect(body.data.remainingSeconds).toBe(290); // 요청량 3600이 아니라 실제로 줄인 290

    const rows = logRows(timerId);
    expect(rows.map((r) => r.action_type)).toEqual(["CREATE", "SUBTRACT", "EXPIRE", "REOPEN"]);
    expect(rows[3]).toMatchObject({ actor_name: "system", delta_seconds: 0, before_seconds: 0, after_seconds: 290 });
  });

  it("만료 뒤 추가(재시작)를 되돌리면 경과분이 있어 0 이하가 되고 다시 만료된다(EXPIRE)", async () => {
    const timerId = await createTimer(60);
    at(100);
    await get(getTimerRoute, `/api/timers/${timerId}`, timerId); // 조회 시 만료 기록
    at(110);
    const add = await modify(timerId, "ADD", 600, "삼루먼");
    expect(add.log.actionType).toBe("ADD");

    at(113);
    const { status, body } = await revert(timerId, add.log.id);
    expect(status).toBe(200);
    expect(body.data.status).toBe("EXPIRED");
    expect(body.data.remainingSeconds).toBe(0);
    const rows = logRows(timerId);
    expect(rows.map((r) => r.action_type)).toEqual(["CREATE", "EXPIRE", "REOPEN", "ADD", "EXPIRE"]);
    expect(rows[4]).toMatchObject({ before_seconds: 597, after_seconds: 0 });
  });

  it("되돌린 뒤 잔여가 정확히 0이면 만료하고, 1초 남으면 계속 실행된다", async () => {
    const zero = await createTimer(100);
    at(10);
    const addZero = await modify(zero, "ADD", 90, "삼루먼"); // 90 + 90 = 180
    at(100); // 잔여 90 - 되돌릴 90 = 0
    const { body } = await revert(zero, addZero.log.id);
    expect(body.data.status).toBe("EXPIRED");
    expect(logRows(zero).at(-1)).toMatchObject({ action_type: "EXPIRE", before_seconds: 90, after_seconds: 0 });

    at(0);
    db.raw.exec("DELETE FROM timer_logs; DELETE FROM timers;");
    const one = await createTimer(100);
    at(10);
    const addOne = await modify(one, "ADD", 90, "삼루먼");
    at(99); // 잔여 91 - 90 = 1
    const second = await revert(one, addOne.log.id);
    expect(second.body.data.status).toBe("RUNNING");
    expect(second.body.data.remainingSeconds).toBe(1);
  });

  it("잔여 0인 만료 타이머의 추가 기록을 되돌리면 잔여는 0 그대로, 기록만 취소 처리된다", async () => {
    const timerId = await createTimer(60);
    at(10);
    const add = await modify(timerId, "ADD", 30, "삼루먼");
    at(500);
    await get(getTimerRoute, `/api/timers/${timerId}`, timerId);

    const { status, body } = await revert(timerId, add.log.id);
    expect(status).toBe(200);
    expect(body.data.status).toBe("EXPIRED");
    expect(body.data.remainingSeconds).toBe(0);
    const rows = logRows(timerId);
    expect(rows.map((r) => r.action_type)).toEqual(["CREATE", "ADD", "EXPIRE"]);
    expect(rows[1].reverted_at).not.toBeNull();
  });

  it("DB는 RUNNING이지만 이미 0초인 타이머는 만료를 먼저 기록한 뒤 되돌린다", async () => {
    const timerId = await createTimer(100);
    at(10);
    const sub = await modify(timerId, "SUBTRACT", 50, "삼루먼"); // 잔여 40, T+50에 만료
    at(100);
    const { body } = await revert(timerId, sub.log.id);
    expect(body.data.status).toBe("RUNNING");
    expect(body.data.remainingSeconds).toBe(50);
    expect(logRows(timerId).map((r) => r.action_type)).toEqual(["CREATE", "SUBTRACT", "EXPIRE", "REOPEN"]);
  });
});

describe("되돌리기: 권한과 입력", () => {
  it("401·403·400·404를 구분한다", async () => {
    const timerId = await createTimer(3600);
    const a = await modify(timerId, "ADD", 600, "삼루먼");
    const createLogId = (db.raw.prepare("SELECT id FROM timer_logs WHERE action_type = 'CREATE'").get() as { id: string }).id;

    expect((await revert(timerId, a.log.id, {})).status).toBe(401);
    expect((await revert(timerId, a.log.id, { "x-user-id": "user-2" })).status).toBe(403);
    expect((await revert(timerId, "not-a-hex-id")).status).toBe(400);
    expect((await revert(timerId, createLogId)).status).toBe(400);
    expect((await revert(timerId, "f".repeat(32))).status).toBe(404);
    expect((await revert("b".repeat(32), a.log.id)).status).toBe(404);

    // 아무 것도 바뀌지 않았다
    expect(logRows(timerId).every((r) => r.reverted_at === null)).toBe(true);
  });
});
