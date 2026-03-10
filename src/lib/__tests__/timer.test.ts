import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateRemaining, detectExpiry, modifyTimer } from "@/lib/timer";
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
      batch: vi.fn().mockResolvedValue([]),
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
      batch: vi.fn().mockResolvedValue([]),
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

  it("이미 EXPIRED 상태에서 SUBTRACT → SUBTRACT 로그만 기록, 중복 EXPIRE 없음", async () => {
    const db = createMockDB();
    const timer = makeTimer({ status: "EXPIRED", baseRemainingSeconds: 0 });
    const result = await modifyTimer(db, timer, "SUBTRACT", 100, "tester", "user-1");

    expect(result.timer.status).toBe("EXPIRED");
    expect(result.timer.baseRemainingSeconds).toBe(0);
    const subtractLogs = result.logs.filter((l) => l.actionType === "SUBTRACT");
    const expireLogs = result.logs.filter((l) => l.actionType === "EXPIRE");
    expect(subtractLogs).toHaveLength(1);
    expect(subtractLogs[0].beforeSeconds).toBe(0);
    expect(subtractLogs[0].afterSeconds).toBe(0);
    expect(expireLogs).toHaveLength(0); // 이미 EXPIRED이므로 중복 EXPIRE 로그 없음
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
