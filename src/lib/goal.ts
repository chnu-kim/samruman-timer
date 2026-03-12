import { calculateRemaining } from "@/lib/timer";
import type { GoalStatus, GoalType, GoalProgress } from "@/types";

export interface GoalRow {
  id: string;
  project_id: string;
  type: GoalType;
  title: string;
  target_seconds: number | null;
  target_datetime: string | null;
  status: GoalStatus;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
}

export interface TimerRow {
  id: string;
  base_remaining_seconds: number;
  last_calculated_at: string;
  status: string;
  scheduled_start_at: string | null;
  created_at: string;
}

interface DeltaSumRow {
  initial_seconds: number | null;
  total_added: number | null;
  total_subtracted: number | null;
}

/**
 * 타이머가 실제로 소비한 시간을 계산한다.
 *
 * 소비 시간 = 초기값(CREATE.after_seconds)
 *           + Σ(ADD.delta_seconds)
 *           - Σ(SUBTRACT.delta_seconds)
 *           - 현재 잔여 시간
 *
 * 프로젝트당 타이머 1개(1:1 관계)이므로 단일 타이머 기준.
 */
export async function calculateRunningSeconds(
  db: D1Database,
  projectId: string,
): Promise<number> {
  const timer = await db
    .prepare(
      `SELECT id, base_remaining_seconds, last_calculated_at, status, scheduled_start_at, created_at
       FROM timers WHERE project_id = ? AND status != 'DELETED' LIMIT 1`,
    )
    .bind(projectId)
    .first<TimerRow>();

  if (!timer) return 0;

  const deltaSum = await db
    .prepare(
      `SELECT
         (SELECT after_seconds FROM timer_logs WHERE timer_id = ? AND action_type = 'CREATE' LIMIT 1) AS initial_seconds,
         (SELECT COALESCE(SUM(delta_seconds), 0) FROM timer_logs WHERE timer_id = ? AND action_type = 'ADD') AS total_added,
         (SELECT COALESCE(SUM(delta_seconds), 0) FROM timer_logs WHERE timer_id = ? AND action_type = 'SUBTRACT') AS total_subtracted`,
    )
    .bind(timer.id, timer.id, timer.id)
    .first<DeltaSumRow>();

  const initialSeconds = deltaSum?.initial_seconds ?? 0;
  const totalAdded = deltaSum?.total_added ?? 0;
  const totalSubtracted = deltaSum?.total_subtracted ?? 0;

  // 현재 잔여 시간: RUNNING이면 실시간 계산, EXPIRED면 0, SCHEDULED면 base값
  let currentRemaining: number;
  if (timer.status === "RUNNING") {
    currentRemaining = calculateRemaining(timer.base_remaining_seconds, timer.last_calculated_at);
  } else if (timer.status === "EXPIRED") {
    currentRemaining = 0;
  } else {
    currentRemaining = timer.base_remaining_seconds;
  }

  const consumed = initialSeconds + totalAdded - totalSubtracted - currentRemaining;
  return Math.max(0, consumed);
}

export async function computeProgress(
  db: D1Database,
  goal: GoalRow,
  projectId: string,
): Promise<{ progress: GoalProgress; newStatus: GoalStatus | null }> {
  if (goal.type === "DURATION") {
    const currentSeconds = await calculateRunningSeconds(db, projectId);
    const targetSeconds = goal.target_seconds ?? 0;
    const percentage = targetSeconds > 0 ? Math.round((currentSeconds / targetSeconds) * 100) : 0;

    let newStatus: GoalStatus | null = null;
    if (goal.status === "ACTIVE" && currentSeconds >= targetSeconds && targetSeconds > 0) {
      newStatus = "COMPLETED";
    }

    return {
      progress: {
        percentage: Math.min(percentage, 999),
        currentSeconds,
        remainingToTarget: Math.max(0, targetSeconds - currentSeconds),
      },
      newStatus,
    };
  }

  // DEADLINE
  const nowMs = Date.now();
  const deadlineMs = goal.target_datetime
    ? new Date(goal.target_datetime).getTime()
    : NaN;

  // target_datetime이 없거나 파싱 불가한 경우 안전하게 FAILED 처리
  if (Number.isNaN(deadlineMs)) {
    return {
      progress: {
        percentage: 0,
        timerSurvivesDeadline: false,
        deadlineIn: 0,
      },
      newStatus: goal.status === "ACTIVE" ? "FAILED" : null,
    };
  }

  const deadlineIn = Math.round((deadlineMs - nowMs) / 1000);

  const timer = await db
    .prepare(
      `SELECT id, base_remaining_seconds, last_calculated_at, status, scheduled_start_at, created_at
       FROM timers WHERE project_id = ? AND status != 'DELETED' LIMIT 1`,
    )
    .bind(projectId)
    .first<TimerRow>();

  const timerIsAlive = timer
    ? timer.status === "RUNNING" && calculateRemaining(timer.base_remaining_seconds, timer.last_calculated_at) > 0
    : false;

  // DEADLINE: 타이머 생성~데드라인 구간에서 RUNNING 누적 시간 비율
  const runningSeconds = await calculateRunningSeconds(db, projectId);
  const timerCreatedMs = timer ? new Date(timer.created_at).getTime() : nowMs;
  const totalSpanSeconds = Math.max(1, Math.floor((deadlineMs - timerCreatedMs) / 1000));
  const percentage = Math.round((runningSeconds / totalSpanSeconds) * 100);

  let newStatus: GoalStatus | null = null;
  if (goal.status === "ACTIVE") {
    if (nowMs >= deadlineMs) {
      newStatus = timerIsAlive ? "COMPLETED" : "FAILED";
    } else if (timer && timer.status === "EXPIRED") {
      newStatus = "FAILED";
    }
  }

  return {
    progress: {
      percentage: Math.min(percentage, 100),
      timerSurvivesDeadline: timerIsAlive,
      deadlineIn: Math.max(0, deadlineIn),
    },
    newStatus,
  };
}
