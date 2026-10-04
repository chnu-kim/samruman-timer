import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateRemaining, detectScheduledActivation, detectExpiry, modifyTimer, revertAmount } from "@/lib/timer";
import type { Timer } from "@/types";

// ─── calculateRemaining ───

describe("calculateRemaining", () => {
  it("경과 시간만큼 잔여 시간이 줄어든다", () => {
    const now = Date.now();
    const lastCalc = new Date(now - 10_000).toISOString(); // 10초 전
    const result = calculateRemaining(100, lastCalc);
    expect(result).toBe(90);
  });

  it("잔여 시간이 0 미만이면 0을 반환한다", () => {
    const now = Date.now();
    const lastCalc = new Date(now - 200_000).toISOString(); // 200초 전
    const result = calculateRemaining(100, lastCalc);
    expect(result).toBe(0);
  });

  it("경과 시간이 0이면 baseRemainingSeconds를 그대로 반환한다", () => {
    const lastCalc = new Date().toISOString();
    const result = calculateRemaining(500, lastCalc);
    // 밀리초 차이로 0~1초 오차 가능
    expect(result).toBeGreaterThanOrEqual(499);
    expect(result).toBeLessThanOrEqual(500);
  });
});

// ─── detectScheduledActivation ───

describe("detectScheduledActivation", () => {
  function createMockDB() {
    const preparedStatement = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({}),
      first: vi.fn().mockResolvedValue(null),
      all: vi.fn().mockResolvedValue({ results: [] }),
    };
    return {
      prepare: vi.fn().mockReturnValue(preparedStatement),
      batch: vi.fn().mockResolvedValue([{ meta: { changes: 1 } }]),
      _stmt: preparedStatement,
    } as unknown as D1Database & { _stmt: typeof preparedStatement };
  }

  function makeTimer(overrides: Partial<Timer> = {}): Timer {
    return {
      id: "timer-1",
      projectId: "proj-1",
      title: "Test Timer",
      description: null,
      baseRemainingSeconds: 3600,
      lastCalculatedAt: new Date().toISOString(),
      status: "SCHEDULED",
      scheduledStartAt: new Date(Date.now() - 10_000).toISOString(),
      createdBy: "user-1",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
      ...overrides,
    };
  }

  it("SCHEDULED + scheduledStartAt 경과 → RUNNING 전환 + DB batch 호출", async () => {
    const db = createMockDB();
    const timer = makeTimer({
      scheduledStartAt: new Date(Date.now() - 10_000).toISOString(), // 10초 전
    });
    const result = await detectScheduledActivation(db, timer);
    expect(result.status).toBe("RUNNING");
    expect(result.lastCalculatedAt).toBe(timer.scheduledStartAt);
    expect(db.batch).toHaveBeenCalledTimes(1);
  });

  it("SCHEDULED + scheduledStartAt 미경과 → 상태 변경 없음", async () => {
    const db = createMockDB();
    const timer = makeTimer({
      scheduledStartAt: new Date(Date.now() + 60_000).toISOString(), // 미래
    });
    const result = await detectScheduledActivation(db, timer);
    expect(result.status).toBe("SCHEDULED");
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("RUNNING 타이머 → 아무 작업 없음", async () => {
    const db = createMockDB();
    const timer = makeTimer({ status: "RUNNING" });
    const result = await detectScheduledActivation(db, timer);
    expect(result.status).toBe("RUNNING");
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("scheduledStartAt null → 아무 작업 없음", async () => {
    const db = createMockDB();
    const timer = makeTimer({ scheduledStartAt: null });
    const result = await detectScheduledActivation(db, timer);
    expect(result.status).toBe("SCHEDULED");
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("EXPIRED 타이머 → 아무 작업 없음", async () => {
    const db = createMockDB();
    const timer = makeTimer({ status: "EXPIRED" });
    const result = await detectScheduledActivation(db, timer);
    expect(result.status).toBe("EXPIRED");
    expect(db.batch).not.toHaveBeenCalled();
  });
});

// ─── detectExpiry ───

describe("detectExpiry", () => {
  function createMockDB() {
    const preparedStatement = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({}),
      first: vi.fn().mockResolvedValue(null),
      all: vi.fn().mockResolvedValue({ results: [] }),
    };
    return {
      prepare: vi.fn().mockReturnValue(preparedStatement),
      batch: vi.fn().mockResolvedValue([{ meta: { changes: 1 } }]),
      _stmt: preparedStatement,
    } as unknown as D1Database & { _stmt: typeof preparedStatement };
  }

  function makeTimer(overrides: Partial<Timer> = {}): Timer {
    return {
      id: "timer-1",
      projectId: "proj-1",
      title: "Test Timer",
      description: null,
      baseRemainingSeconds: 100,
      lastCalculatedAt: new Date().toISOString(),
      status: "RUNNING",
      createdBy: "user-1",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
      ...overrides,
    };
  }

  it("RUNNING + remaining > 0 → 상태 변경 없음", async () => {
    const db = createMockDB();
    const timer = makeTimer({ baseRemainingSeconds: 9999 });
    const result = await detectExpiry(db, timer);
    expect(result.status).toBe("RUNNING");
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("RUNNING + remaining <= 0 → EXPIRED로 전환, DB 업데이트", async () => {
    const db = createMockDB();
    const timer = makeTimer({
      baseRemainingSeconds: 10,
      lastCalculatedAt: new Date(Date.now() - 20_000).toISOString(), // 20초 전
    });
    const result = await detectExpiry(db, timer);
    expect(result.status).toBe("EXPIRED");
    expect(result.baseRemainingSeconds).toBe(0);
    expect(db.batch).toHaveBeenCalledTimes(1);
  });

  it("이미 EXPIRED → 아무 작업 없이 그대로 반환", async () => {
    const db = createMockDB();
    const timer = makeTimer({ status: "EXPIRED", baseRemainingSeconds: 0 });
    const result = await detectExpiry(db, timer);
    expect(result.status).toBe("EXPIRED");
    expect(db.batch).not.toHaveBeenCalled();
  });
});

// ─── modifyTimer ───

describe("modifyTimer", () => {
  function createMockDB() {
    const preparedStatement = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({}),
    };
    return {
      prepare: vi.fn().mockReturnValue(preparedStatement),
      batch: vi.fn().mockResolvedValue([{ meta: { changes: 1 } }]),
    } as unknown as D1Database;
  }

  function makeTimer(overrides: Partial<Timer> = {}): Timer {
    return {
      id: "timer-1",
      projectId: "proj-1",
      title: "Test Timer",
      description: null,
      baseRemainingSeconds: 3600,
      lastCalculatedAt: new Date().toISOString(),
      status: "RUNNING",
      createdBy: "user-1",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
      ...overrides,
    };
  }

  it("ADD: 시간 추가 → remaining 증가", async () => {
    const db = createMockDB();
    const timer = makeTimer({ baseRemainingSeconds: 1000 });
    const result = await modifyTimer(db, timer, "ADD", 500, "tester", "user-1");

    expect(result.timer.baseRemainingSeconds).toBeGreaterThanOrEqual(1499);
    expect(result.timer.status).toBe("RUNNING");
    // ADD 로그 1개
    const addLogs = result.logs.filter((l) => l.actionType === "ADD");
    expect(addLogs).toHaveLength(1);
    expect(addLogs[0].deltaSeconds).toBe(500);
  });

  it("SUBTRACT: 시간 차감 → remaining 감소", async () => {
    const db = createMockDB();
    const timer = makeTimer({ baseRemainingSeconds: 1000 });
    const result = await modifyTimer(db, timer, "SUBTRACT", 200, "tester", "user-1");

    expect(result.timer.baseRemainingSeconds).toBeGreaterThanOrEqual(799);
    expect(result.timer.status).toBe("RUNNING");
    const subLogs = result.logs.filter((l) => l.actionType === "SUBTRACT");
    expect(subLogs).toHaveLength(1);
  });

  it("SUBTRACT로 0 이하 → EXPIRED + EXPIRE 로그 생성", async () => {
    const db = createMockDB();
    const timer = makeTimer({ baseRemainingSeconds: 100 });
    const result = await modifyTimer(db, timer, "SUBTRACT", 9999, "tester", "user-1");

    expect(result.timer.status).toBe("EXPIRED");
    expect(result.timer.baseRemainingSeconds).toBe(0);
    const expireLogs = result.logs.filter((l) => l.actionType === "EXPIRE");
    expect(expireLogs).toHaveLength(1);
  });

  it("SUBTRACT→EXPIRE 로그의 actor는 system/null이어야 한다", async () => {
    const db = createMockDB();
    const timer = makeTimer({ baseRemainingSeconds: 100 });
    const result = await modifyTimer(db, timer, "SUBTRACT", 9999, "tester", "user-1");

    const expireLog = result.logs.find((l) => l.actionType === "EXPIRE")!;
    expect(expireLog.actorName).toBe("system");
    expect(expireLog.actorUserId).toBeNull();
  });

  // UX-14: 만료 상태의 차감은 효과가 없으므로 0→0 로그를 남기지 않고 거절한다
  it("이미 EXPIRED 상태에서 SUBTRACT → 예외, DB 쓰기 없음", async () => {
    const db = createMockDB();
    const timer = makeTimer({ status: "EXPIRED", baseRemainingSeconds: 0 });
    await expect(modifyTimer(db, timer, "SUBTRACT", 100, "tester", "user-1")).rejects.toThrow(
      "만료된 타이머는 차감할 수 없습니다",
    );
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("RUNNING이지만 잔여가 정확히 0초일 때 SUBTRACT → 예외", async () => {
    const db = createMockDB();
    const timer = makeTimer({ baseRemainingSeconds: 0 });
    await expect(modifyTimer(db, timer, "SUBTRACT", 1, "tester", "user-1")).rejects.toThrow();
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("잔여 1초에서 SUBTRACT → EXPIRED + EXPIRE 로그 (경계)", async () => {
    const db = createMockDB();
    const timer = makeTimer({ baseRemainingSeconds: 1 });
    const result = await modifyTimer(db, timer, "SUBTRACT", 1, "tester", "user-1");
    expect(result.timer.status).toBe("EXPIRED");
    expect(result.logs.map((l) => l.actionType)).toEqual(["SUBTRACT", "EXPIRE"]);
  });

  it("EXPIRED 상태에서 ADD → REOPEN + ADD 로그 생성, RUNNING 전환", async () => {
    const db = createMockDB();
    const timer = makeTimer({ status: "EXPIRED", baseRemainingSeconds: 0 });
    const result = await modifyTimer(db, timer, "ADD", 500, "tester", "user-1");

    expect(result.timer.status).toBe("RUNNING");
    expect(result.timer.baseRemainingSeconds).toBe(500);
    const reopenLogs = result.logs.filter((l) => l.actionType === "REOPEN");
    const addLogs = result.logs.filter((l) => l.actionType === "ADD");
    expect(reopenLogs).toHaveLength(1);
    expect(addLogs).toHaveLength(1);
  });

  it("로그의 before/after가 올바르게 기록된다", async () => {
    const db = createMockDB();
    const timer = makeTimer({ baseRemainingSeconds: 1000 });
    const result = await modifyTimer(db, timer, "ADD", 200, "tester", "user-1");

    const addLog = result.logs.find((l) => l.actionType === "ADD")!;
    expect(addLog.afterSeconds).toBe(addLog.beforeSeconds + 200);
  });
});

// ─── 동시 쓰기(CAS) ───

describe("타이머 상태 쓰기 CAS (보안 감사 F02)", () => {
  function createCasDB(batchResults: number[], reloadRows: object[] = []) {
    const stmt = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({}),
      first: vi.fn(),
    };
    for (const row of reloadRows) stmt.first.mockResolvedValueOnce(row);
    const batch = vi.fn();
    for (const changes of batchResults) batch.mockResolvedValueOnce([{ meta: { changes } }]);
    return {
      db: { prepare: vi.fn().mockReturnValue(stmt), batch } as unknown as D1Database & {
        prepare: ReturnType<typeof vi.fn>;
      },
      stmt,
      batch,
    };
  }

  function makeTimer(overrides: Partial<Timer> = {}): Timer {
    return {
      id: "timer-1",
      projectId: "proj-1",
      title: "Test Timer",
      description: null,
      baseRemainingSeconds: 1000,
      lastCalculatedAt: new Date().toISOString(),
      status: "RUNNING",
      scheduledStartAt: null,
      createdBy: "user-1",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
      ...overrides,
    };
  }

  it("상태 UPDATE는 읽은 status·잔여·기준 시각이 그대로일 때만 적용하고, 로그는 UPDATE가 적용됐을 때만 넣는다", async () => {
    const { db, stmt } = createCasDB([1]);
    const timer = makeTimer();
    await modifyTimer(db, timer, "ADD", 60, "tester", "user-1");

    const sqls = db.prepare.mock.calls.map((c) => String(c[0]));
    expect(sqls[0]).toContain("WHERE id = ? AND status = ? AND base_remaining_seconds = ? AND last_calculated_at = ?");
    expect(sqls.slice(1).every((q) => q.includes("WHERE changes() = 1"))).toBe(true);
    expect(stmt.bind.mock.calls[0].slice(-4)).toEqual(["timer-1", "RUNNING", 1000, timer.lastCalculatedAt]);
  });

  it("다른 요청이 먼저 시간을 바꿨으면 다시 읽은 상태에 더해 변경을 잃지 않는다", async () => {
    const now = new Date().toISOString();
    const { db, batch } = createCasDB([0, 1], [
      { status: "RUNNING", base_remaining_seconds: 1600, last_calculated_at: now, updated_at: now },
    ]);
    const result = await modifyTimer(db, makeTimer(), "ADD", 300, "tester", "user-1");

    expect(batch).toHaveBeenCalledTimes(2);
    expect(result.timer.baseRemainingSeconds).toBeGreaterThanOrEqual(1899);
    expect(result.logs.find((l) => l.actionType === "ADD")?.beforeSeconds).toBeGreaterThanOrEqual(1599);
  });

  it("재시도가 모두 겹치면 409 TimerStateError", async () => {
    const now = new Date().toISOString();
    const row = { status: "RUNNING", base_remaining_seconds: 1000, last_calculated_at: now, updated_at: now };
    const { db } = createCasDB([0, 0, 0, 0, 0], [row, row, row, row, row]);

    await expect(modifyTimer(db, makeTimer(), "ADD", 60, "tester", "user-1")).rejects.toMatchObject({
      status: 409,
      code: "CONFLICT",
    });
  });

  it("그 사이 타이머가 삭제됐으면 404 TimerStateError (삭제된 타이머를 되살리지 않는다)", async () => {
    const now = new Date().toISOString();
    const { db, batch } = createCasDB([0], [
      { status: "DELETED", base_remaining_seconds: 1000, last_calculated_at: now, updated_at: now },
    ]);

    await expect(modifyTimer(db, makeTimer(), "ADD", 60, "tester", "user-1")).rejects.toMatchObject({
      status: 404,
    });
    expect(batch).toHaveBeenCalledTimes(1);
  });

  it("만료 감지가 겹치면 덮어쓰지 않고 다른 요청이 남긴 상태를 돌려준다", async () => {
    const past = new Date(Date.now() - 10_000).toISOString();
    const now = new Date().toISOString();
    const { db } = createCasDB([0], [
      { status: "RUNNING", base_remaining_seconds: 600, last_calculated_at: now, updated_at: now },
    ]);
    const result = await detectExpiry(db, makeTimer({ baseRemainingSeconds: 5, lastCalculatedAt: past }));

    expect(result.status).toBe("RUNNING");
    expect(result.baseRemainingSeconds).toBe(600);
  });
});

// ─── revertAmount ───
// 되돌리기는 요청량이 아니라 그 기록이 실제로 바꾼 양만 반대로 적용한다(상태 전이·집계는 integration/timer-revert.test.ts)

describe("revertAmount", () => {
  it("ADD는 추가한 만큼 뺀다", () => {
    expect(revertAmount({ actionType: "ADD", beforeSeconds: 3600, afterSeconds: 39600 })).toBe(-36000);
  });

  it("SUBTRACT는 실제로 줄인 만큼 더한다(0에서 잘린 차감은 요청량보다 작다)", () => {
    expect(revertAmount({ actionType: "SUBTRACT", beforeSeconds: 600, afterSeconds: 0 })).toBe(600);
    expect(revertAmount({ actionType: "SUBTRACT", beforeSeconds: 3600, afterSeconds: 3000 })).toBe(600);
  });
});
