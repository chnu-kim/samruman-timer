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

const ACTIVE_TIMER_SQL = `SELECT id, base_remaining_seconds, last_calculated_at, status, scheduled_start_at, created_at
       FROM timers WHERE project_id = ? AND status != 'DELETED' LIMIT 1`;

/**
 * 목표 진행률 계산에 필요한 타이머 상태. 목표 여러 개를 한 번에 계산할 때
 * 목표마다 같은 집계 쿼리를 반복하지 않도록 한 번만 읽어 넘긴다.
 */
export interface ProgressSnapshot {
  timer: TimerRow | null;
  runningSeconds: number;
}

export async function loadProgressSnapshot(
  db: D1Database,
  projectId: string,
): Promise<ProgressSnapshot> {
  const timer = await db.prepare(ACTIVE_TIMER_SQL).bind(projectId).first<TimerRow>();
  return { timer, runningSeconds: timer ? await runningSecondsOf(db, timer) : 0 };
}

/**
 * 타이머가 실제로 소비한 시간을 계산한다.
 *
 * 소비 시간 = 초기값(CREATE.after_seconds)
 *           + Σ(ADD.delta_seconds)
 *           - Σ(SUBTRACT.delta_seconds)
 *           - 현재 잔여 시간
 *
 * 되돌린 기록(reverted_at)은 합계에서 뺀다. 되돌리기가 잔여도 같은 양만큼 되돌리므로 소비 시간은 그대로다.
 * 빼지 않으면 잘못 누른 +10시간이 되돌린 뒤에도 소비 시간으로 잡혀 목표가 달성 처리된다.
 *
 * 프로젝트당 타이머 1개(1:1 관계)이므로 단일 타이머 기준.
 */
export async function calculateRunningSeconds(
  db: D1Database,
  projectId: string,
): Promise<number> {
  return (await loadProgressSnapshot(db, projectId)).runningSeconds;
}

async function runningSecondsOf(db: D1Database, timer: TimerRow): Promise<number> {
  const deltaSum = await db
    .prepare(
      `SELECT
         (SELECT after_seconds FROM timer_logs WHERE timer_id = ? AND action_type = 'CREATE' LIMIT 1) AS initial_seconds,
         (SELECT COALESCE(SUM(delta_seconds), 0) FROM timer_logs WHERE timer_id = ? AND action_type = 'ADD' AND reverted_at IS NULL) AS total_added,
         (SELECT COALESCE(SUM(delta_seconds), 0) FROM timer_logs WHERE timer_id = ? AND action_type = 'SUBTRACT' AND reverted_at IS NULL) AS total_subtracted`,
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
  snapshot?: ProgressSnapshot,
): Promise<{ progress: GoalProgress; newStatus: GoalStatus | null }> {
  if (goal.type === "DURATION") {
    const currentSeconds = snapshot
      ? snapshot.runningSeconds
      : await calculateRunningSeconds(db, projectId);
    const targetSeconds = goal.target_seconds ?? 0;
    const percentage = targetSeconds > 0 ? Math.round((currentSeconds / targetSeconds) * 100) : 0;

    let newStatus: GoalStatus | null = null;
    if (goal.status === "ACTIVE" && currentSeconds >= targetSeconds && targetSeconds > 0) {
      newStatus = "COMPLETED";
    }

    // 달성한 목표는 달성 시점의 값으로 보여 준다. 달성 뒤에도 소비 시간은 계속 늘어
    // '283%'처럼 막대(최대 100%)와 맞지 않는 숫자가 되기 때문이다
    if ((newStatus ?? goal.status) === "COMPLETED") {
      return {
        progress: { percentage: 100, currentSeconds: targetSeconds, remainingToTarget: 0 },
        newStatus,
      };
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

  const timer = snapshot
    ? snapshot.timer
    : await db.prepare(ACTIVE_TIMER_SQL).bind(projectId).first<TimerRow>();

  const timerIsAlive = timer
    ? timer.status === "RUNNING" && calculateRemaining(timer.base_remaining_seconds, timer.last_calculated_at) > 0
    : false;

  // DEADLINE: 타이머 생성~데드라인 구간에서 RUNNING 누적 시간 비율
  const runningSeconds = snapshot
    ? snapshot.runningSeconds
    : await calculateRunningSeconds(db, projectId);
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
      percentage: (newStatus ?? goal.status) === "COMPLETED" ? 100 : Math.min(percentage, 100),
      timerSurvivesDeadline: timerIsAlive,
      deadlineIn: Math.max(0, deadlineIn),
      deadlineAfterTimerEnd: deadlineAfterTimerEnd(timer, deadlineMs, nowMs),
    },
    newStatus,
  };
}

/**
 * 지금 남은 시간대로 흐르면 타이머가 마감보다 먼저 끝나는지.
 * RUNNING은 지금 + 잔여, SCHEDULED는 시작 예정 + 잔여를 종료 예정으로 본다.
 * 종료 예정을 셀 수 없으면(타이머 없음·만료) false다. 그때는 목표가 곧 실패로 전이된다.
 */
function deadlineAfterTimerEnd(timer: TimerRow | null, deadlineMs: number, nowMs: number): boolean {
  if (!timer) return false;
  let endMs: number;
  if (timer.status === "RUNNING") {
    endMs = nowMs + calculateRemaining(timer.base_remaining_seconds, timer.last_calculated_at) * 1000;
  } else if (timer.status === "SCHEDULED" && timer.scheduled_start_at) {
    endMs = new Date(timer.scheduled_start_at).getTime() + timer.base_remaining_seconds * 1000;
  } else {
    return false;
  }
  return Number.isFinite(endMs) && deadlineMs > endMs;
}
