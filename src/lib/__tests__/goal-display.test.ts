import { describe, it, expect } from "vitest";
import { computeProgress, type GoalRow, type TimerRow } from "@/lib/goal";
import { createMockDB } from "@/__tests__/helpers";

// 목표 카드에 보이는 값 (C048 달성 퍼센트, C159 마감 대비 종료 예정)
describe("computeProgress 표시 값", () => {
  const db = createMockDB() as unknown as D1Database;
  const timer = (over: Partial<TimerRow> = {}): TimerRow => ({
    id: "timer-1",
    base_remaining_seconds: 3600,
    last_calculated_at: new Date().toISOString(),
    status: "RUNNING",
    scheduled_start_at: null,
    created_at: "2025-01-01T00:00:00Z",
    ...over,
  });
  const goal = (over: Partial<GoalRow>): GoalRow => ({
    id: "goal-1",
    project_id: "proj-1",
    type: "DURATION",
    title: "목표",
    target_seconds: 60,
    target_datetime: null,
    status: "ACTIVE",
    created_at: "2025-01-01T00:00:00Z",
    completed_at: null,
    updated_at: "2025-01-01T00:00:00Z",
    ...over,
  });

  // C048: 달성 뒤에도 소비 시간이 늘어 '999%'가 되던 것을 막대와 같은 100%로 고정한다
  it("이미 달성한 DURATION 목표는 소비 시간이 목표를 넘어도 100%다", async () => {
    const { progress } = await computeProgress(db, goal({ status: "COMPLETED" }), "proj-1", {
      timer: timer(),
      runningSeconds: 6000,
    });
    expect(progress).toEqual({ percentage: 100, currentSeconds: 60, remainingToTarget: 0 });
  });

  it("이번 조회에서 달성으로 전이되는 DURATION 목표도 100%다", async () => {
    const { progress, newStatus } = await computeProgress(db, goal({}), "proj-1", {
      timer: timer(),
      runningSeconds: 150,
    });
    expect(newStatus).toBe("COMPLETED");
    expect(progress.percentage).toBe(100);
  });

  it("취소한 DURATION 목표는 지금처럼 계산한다", async () => {
    const { progress } = await computeProgress(db, goal({ status: "CANCELLED" }), "proj-1", {
      timer: timer(),
      runningSeconds: 120,
    });
    expect(progress.percentage).toBe(200);
  });

  it("달성한 DEADLINE 목표는 100%다", async () => {
    const { progress } = await computeProgress(
      db,
      goal({
        type: "DEADLINE",
        target_seconds: null,
        target_datetime: new Date(Date.now() - 60_000).toISOString(),
        status: "COMPLETED",
      }),
      "proj-1",
      { timer: timer(), runningSeconds: 10 },
    );
    expect(progress.percentage).toBe(100);
  });

  // C159: 마감이 타이머 종료 예정보다 늦으면 카드가 경고한다
  describe("deadlineAfterTimerEnd", () => {
    const deadlineIn = (sec: number) =>
      goal({
        type: "DEADLINE",
        target_seconds: null,
        target_datetime: new Date(Date.now() + sec * 1000).toISOString(),
      });
    const after = async (g: GoalRow, t: TimerRow | null) =>
      (await computeProgress(db, g, "proj-1", { timer: t, runningSeconds: 0 })).progress.deadlineAfterTimerEnd;

    it("RUNNING: 지금 + 잔여보다 마감이 늦으면 true", async () => {
      expect(await after(deadlineIn(7200), timer({ base_remaining_seconds: 3600 }))).toBe(true);
    });

    it("RUNNING: 잔여가 마감까지 남은 시간보다 길면 false", async () => {
      expect(await after(deadlineIn(1800), timer({ base_remaining_seconds: 3600 }))).toBe(false);
    });

    it("SCHEDULED: 시작 예정 + 잔여를 종료 예정으로 본다", async () => {
      const scheduled = timer({
        status: "SCHEDULED",
        scheduled_start_at: new Date(Date.now() + 3600_000).toISOString(),
        base_remaining_seconds: 3600,
      });
      // 종료 예정 = 지금 + 2시간
      expect(await after(deadlineIn(5400), scheduled)).toBe(false);
      expect(await after(deadlineIn(9000), scheduled)).toBe(true);
    });

    it("타이머가 없으면 종료 예정을 셀 수 없어 false", async () => {
      expect(await after(deadlineIn(7200), null)).toBe(false);
    });
  });
});
