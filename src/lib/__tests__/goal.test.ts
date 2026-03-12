import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateRunningSeconds, computeProgress, type GoalRow, type TimerRow } from "@/lib/goal";
import { createMockDB } from "@/__tests__/helpers";

// ─── calculateRunningSeconds ───

describe("calculateRunningSeconds", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
  });

  it("타이머 없으면 0 반환", async () => {
    db._stmt.first.mockResolvedValueOnce(null);
    const result = await calculateRunningSeconds(db as unknown as D1Database, "proj-1");
    expect(result).toBe(0);
  });

  it("RUNNING 타이머: 소비 시간 = initial + added - subtracted - remaining", async () => {
    const now = new Date();
    const lastCalc = new Date(now.getTime() - 100_000); // 100초 전

    db._stmt.first
      .mockResolvedValueOnce({
        id: "timer-1",
        base_remaining_seconds: 3500,
        last_calculated_at: lastCalc.toISOString(),
        status: "RUNNING",
        scheduled_start_at: null,
        created_at: "2025-01-01T00:00:00Z",
      } satisfies TimerRow)
      .mockResolvedValueOnce({
        initial_seconds: 3600,
        total_added: 0,
        total_subtracted: 0,
      });

    const result = await calculateRunningSeconds(db as unknown as D1Database, "proj-1");
    // remaining = 3500 - 100 = 3400
    // consumed = 3600 + 0 - 0 - 3400 = 200
    expect(result).toBe(200);
  });

  it("EXPIRED 타이머: remaining = 0이므로 consumed = initial + added - subtracted", async () => {
    db._stmt.first
      .mockResolvedValueOnce({
        id: "timer-1",
        base_remaining_seconds: 0,
        last_calculated_at: new Date().toISOString(),
        status: "EXPIRED",
        scheduled_start_at: null,
        created_at: "2025-01-01T00:00:00Z",
      } satisfies TimerRow)
      .mockResolvedValueOnce({
        initial_seconds: 3600,
        total_added: 600,
        total_subtracted: 200,
      });

    const result = await calculateRunningSeconds(db as unknown as D1Database, "proj-1");
    // consumed = 3600 + 600 - 200 - 0 = 4000
    expect(result).toBe(4000);
  });

  it("SCHEDULED 타이머: remaining = base_remaining_seconds", async () => {
    db._stmt.first
      .mockResolvedValueOnce({
        id: "timer-1",
        base_remaining_seconds: 3600,
        last_calculated_at: new Date().toISOString(),
        status: "SCHEDULED",
        scheduled_start_at: new Date(Date.now() + 60000).toISOString(),
        created_at: "2025-01-01T00:00:00Z",
      } satisfies TimerRow)
      .mockResolvedValueOnce({
        initial_seconds: 3600,
        total_added: 0,
        total_subtracted: 0,
      });

    const result = await calculateRunningSeconds(db as unknown as D1Database, "proj-1");
    // consumed = 3600 + 0 - 0 - 3600 = 0
    expect(result).toBe(0);
  });

  it("CREATE 로그 없으면 initial_seconds = null → 0으로 폴백", async () => {
    db._stmt.first
      .mockResolvedValueOnce({
        id: "timer-1",
        base_remaining_seconds: 100,
        last_calculated_at: new Date().toISOString(),
        status: "EXPIRED",
        scheduled_start_at: null,
        created_at: "2025-01-01T00:00:00Z",
      } satisfies TimerRow)
      .mockResolvedValueOnce({
        initial_seconds: null,
        total_added: null,
        total_subtracted: null,
      });

    const result = await calculateRunningSeconds(db as unknown as D1Database, "proj-1");
    // consumed = 0 + 0 - 0 - 0 = 0, clamped to 0
    expect(result).toBe(0);
  });

  it("consumed가 음수이면 0으로 클램프", async () => {
    // 시간이 추가된 직후에는 consumed가 음수가 될 수 있음
    db._stmt.first
      .mockResolvedValueOnce({
        id: "timer-1",
        base_remaining_seconds: 5000,
        last_calculated_at: new Date().toISOString(),
        status: "RUNNING",
        scheduled_start_at: null,
        created_at: "2025-01-01T00:00:00Z",
      } satisfies TimerRow)
      .mockResolvedValueOnce({
        initial_seconds: 3600,
        total_added: 1000,
        total_subtracted: 0,
      });

    const result = await calculateRunningSeconds(db as unknown as D1Database, "proj-1");
    // consumed = 3600 + 1000 - 0 - 5000 = -400 → clamped to 0
    expect(result).toBe(0);
  });
});

// ─── computeProgress ───

describe("computeProgress", () => {
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
  });

  // ── DURATION ──

  describe("DURATION 목표", () => {
    it("진행률 계산: currentSeconds / targetSeconds * 100", async () => {
      // calculateRunningSeconds 용 mock
      db._stmt.first
        .mockResolvedValueOnce({
          id: "timer-1",
          base_remaining_seconds: 0,
          last_calculated_at: new Date().toISOString(),
          status: "EXPIRED",
          scheduled_start_at: null,
          created_at: "2025-01-01T00:00:00Z",
        })
        .mockResolvedValueOnce({
          initial_seconds: 3600,
          total_added: 0,
          total_subtracted: 0,
        });

      const goal: GoalRow = {
        id: "goal-1",
        project_id: "proj-1",
        type: "DURATION",
        title: "1시간 방송하기",
        target_seconds: 3600,
        target_datetime: null,
        status: "ACTIVE",
        created_at: "2025-01-01T00:00:00Z",
        completed_at: null,
        updated_at: "2025-01-01T00:00:00Z",
      };

      const { progress, newStatus } = await computeProgress(db as unknown as D1Database, goal, "proj-1");
      expect(progress.percentage).toBe(100);
      expect(progress.currentSeconds).toBe(3600);
      expect(progress.remainingToTarget).toBe(0);
      expect(newStatus).toBe("COMPLETED");
    });

    it("target_seconds = 0이면 percentage = 0", async () => {
      db._stmt.first
        .mockResolvedValueOnce({
          id: "timer-1",
          base_remaining_seconds: 100,
          last_calculated_at: new Date().toISOString(),
          status: "RUNNING",
          scheduled_start_at: null,
          created_at: "2025-01-01T00:00:00Z",
        })
        .mockResolvedValueOnce({
          initial_seconds: 100,
          total_added: 0,
          total_subtracted: 0,
        });

      const goal: GoalRow = {
        id: "goal-1",
        project_id: "proj-1",
        type: "DURATION",
        title: "테스트",
        target_seconds: 0,
        target_datetime: null,
        status: "ACTIVE",
        created_at: "2025-01-01T00:00:00Z",
        completed_at: null,
        updated_at: "2025-01-01T00:00:00Z",
      };

      const { progress, newStatus } = await computeProgress(db as unknown as D1Database, goal, "proj-1");
      expect(progress.percentage).toBe(0);
      expect(newStatus).toBeNull();
    });

    it("target_seconds가 null이면 percentage = 0", async () => {
      db._stmt.first
        .mockResolvedValueOnce({
          id: "timer-1",
          base_remaining_seconds: 100,
          last_calculated_at: new Date().toISOString(),
          status: "RUNNING",
          scheduled_start_at: null,
          created_at: "2025-01-01T00:00:00Z",
        })
        .mockResolvedValueOnce({
          initial_seconds: 100,
          total_added: 0,
          total_subtracted: 0,
        });

      const goal: GoalRow = {
        id: "goal-1",
        project_id: "proj-1",
        type: "DURATION",
        title: "테스트",
        target_seconds: null,
        target_datetime: null,
        status: "ACTIVE",
        created_at: "2025-01-01T00:00:00Z",
        completed_at: null,
        updated_at: "2025-01-01T00:00:00Z",
      };

      const { progress, newStatus } = await computeProgress(db as unknown as D1Database, goal, "proj-1");
      expect(progress.percentage).toBe(0);
      expect(newStatus).toBeNull();
    });

    it("이미 COMPLETED 상태이면 newStatus = null (중복 상태 전이 방지)", async () => {
      db._stmt.first
        .mockResolvedValueOnce({
          id: "timer-1",
          base_remaining_seconds: 0,
          last_calculated_at: new Date().toISOString(),
          status: "EXPIRED",
          scheduled_start_at: null,
          created_at: "2025-01-01T00:00:00Z",
        })
        .mockResolvedValueOnce({
          initial_seconds: 3600,
          total_added: 0,
          total_subtracted: 0,
        });

      const goal: GoalRow = {
        id: "goal-1",
        project_id: "proj-1",
        type: "DURATION",
        title: "1시간 방송하기",
        target_seconds: 3600,
        target_datetime: null,
        status: "COMPLETED",
        created_at: "2025-01-01T00:00:00Z",
        completed_at: "2025-01-01T01:00:00Z",
        updated_at: "2025-01-01T01:00:00Z",
      };

      const { newStatus } = await computeProgress(db as unknown as D1Database, goal, "proj-1");
      expect(newStatus).toBeNull();
    });
  });

  // ── DEADLINE ──

  describe("DEADLINE 목표", () => {
    it("target_datetime이 null이면 에러 없이 안전하게 처리", async () => {
      // 타이머 mock (calculateRunningSeconds + computeProgress 내부 쿼리)
      db._stmt.first
        // calculateRunningSeconds 용 timer
        .mockResolvedValueOnce({
          id: "timer-1",
          base_remaining_seconds: 3000,
          last_calculated_at: new Date().toISOString(),
          status: "RUNNING",
          scheduled_start_at: null,
          created_at: "2025-01-01T00:00:00Z",
        })
        // calculateRunningSeconds 용 deltaSum
        .mockResolvedValueOnce({
          initial_seconds: 3600,
          total_added: 0,
          total_subtracted: 0,
        })
        // computeProgress 내부 timer 쿼리
        .mockResolvedValueOnce({
          id: "timer-1",
          base_remaining_seconds: 3000,
          last_calculated_at: new Date().toISOString(),
          status: "RUNNING",
          scheduled_start_at: null,
          created_at: "2025-01-01T00:00:00Z",
        });

      const goal: GoalRow = {
        id: "goal-1",
        project_id: "proj-1",
        type: "DEADLINE",
        title: "데드라인 목표",
        target_seconds: null,
        target_datetime: null, // 데이터 불일치: DEADLINE인데 target_datetime이 null
        status: "ACTIVE",
        created_at: "2025-01-01T00:00:00Z",
        completed_at: null,
        updated_at: "2025-01-01T00:00:00Z",
      };

      // 현재 코드는 target_datetime!로 non-null assertion 사용하므로 NaN 전파됨
      // 수정 후에는 안전하게 fallback 처리되어야 함
      const { progress, newStatus } = await computeProgress(db as unknown as D1Database, goal, "proj-1");

      // NaN이 아닌 유효한 숫자여야 함
      expect(Number.isNaN(progress.percentage)).toBe(false);
      expect(Number.isNaN(progress.deadlineIn)).toBe(false);
      // target_datetime이 없으므로 FAILED 처리
      expect(newStatus).toBe("FAILED");
    });

    it("데드라인이 지나고 타이머가 살아있으면 COMPLETED", async () => {
      const pastDeadline = new Date(Date.now() - 60_000).toISOString(); // 1분 전

      db._stmt.first
        // calculateRunningSeconds 용 timer
        .mockResolvedValueOnce({
          id: "timer-1",
          base_remaining_seconds: 3000,
          last_calculated_at: new Date().toISOString(),
          status: "RUNNING",
          scheduled_start_at: null,
          created_at: "2025-01-01T00:00:00Z",
        })
        // calculateRunningSeconds 용 deltaSum
        .mockResolvedValueOnce({
          initial_seconds: 3600,
          total_added: 0,
          total_subtracted: 0,
        })
        // computeProgress 내부 timer 쿼리
        .mockResolvedValueOnce({
          id: "timer-1",
          base_remaining_seconds: 3000,
          last_calculated_at: new Date().toISOString(),
          status: "RUNNING",
          scheduled_start_at: null,
          created_at: "2025-01-01T00:00:00Z",
        });

      const goal: GoalRow = {
        id: "goal-1",
        project_id: "proj-1",
        type: "DEADLINE",
        title: "데드라인 목표",
        target_seconds: null,
        target_datetime: pastDeadline,
        status: "ACTIVE",
        created_at: "2025-01-01T00:00:00Z",
        completed_at: null,
        updated_at: "2025-01-01T00:00:00Z",
      };

      const { newStatus } = await computeProgress(db as unknown as D1Database, goal, "proj-1");
      expect(newStatus).toBe("COMPLETED");
    });

    it("데드라인이 지나고 타이머가 EXPIRED이면 FAILED", async () => {
      const pastDeadline = new Date(Date.now() - 60_000).toISOString();

      db._stmt.first
        // calculateRunningSeconds 용 timer
        .mockResolvedValueOnce({
          id: "timer-1",
          base_remaining_seconds: 0,
          last_calculated_at: new Date().toISOString(),
          status: "EXPIRED",
          scheduled_start_at: null,
          created_at: "2025-01-01T00:00:00Z",
        })
        // calculateRunningSeconds 용 deltaSum
        .mockResolvedValueOnce({
          initial_seconds: 3600,
          total_added: 0,
          total_subtracted: 0,
        })
        // computeProgress 내부 timer 쿼리
        .mockResolvedValueOnce({
          id: "timer-1",
          base_remaining_seconds: 0,
          last_calculated_at: new Date().toISOString(),
          status: "EXPIRED",
          scheduled_start_at: null,
          created_at: "2025-01-01T00:00:00Z",
        });

      const goal: GoalRow = {
        id: "goal-1",
        project_id: "proj-1",
        type: "DEADLINE",
        title: "데드라인 목표",
        target_seconds: null,
        target_datetime: pastDeadline,
        status: "ACTIVE",
        created_at: "2025-01-01T00:00:00Z",
        completed_at: null,
        updated_at: "2025-01-01T00:00:00Z",
      };

      const { newStatus } = await computeProgress(db as unknown as D1Database, goal, "proj-1");
      expect(newStatus).toBe("FAILED");
    });
  });
});
