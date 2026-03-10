import type { Timer, TimerLog, ModifyAction, ActionType } from "@/types";
import { generateId, nowISO } from "@/lib/db";

export function calculateRemaining(
  baseRemainingSeconds: number,
  lastCalculatedAt: string
): number {
  const now = Date.now();
  const lastCalc = new Date(lastCalculatedAt).getTime();
  const elapsed = Math.floor((now - lastCalc) / 1000);
  return Math.max(0, baseRemainingSeconds - elapsed);
}

export async function detectScheduledActivation(
  db: D1Database,
  timer: Timer
): Promise<Timer> {
  if (timer.status !== "SCHEDULED") return timer;
  if (!timer.scheduledStartAt) return timer;

  const now = Date.now();
  const scheduledTime = new Date(timer.scheduledStartAt).getTime();
  if (now < scheduledTime) return timer;

  const nowStr = nowISO();
  const logId = generateId();

  await db.batch([
    db
      .prepare(
        `UPDATE timers SET status = 'RUNNING', last_calculated_at = ?, updated_at = ? WHERE id = ?`
      )
      .bind(timer.scheduledStartAt, nowStr, timer.id),
    db
      .prepare(
        `INSERT INTO timer_logs (id, timer_id, action_type, actor_name, actor_user_id, delta_seconds, before_seconds, after_seconds, created_at) VALUES (?, ?, 'ACTIVATE', 'system', NULL, 0, ?, ?, ?)`
      )
      .bind(logId, timer.id, timer.baseRemainingSeconds, timer.baseRemainingSeconds, nowStr),
  ]);

  return {
    ...timer,
    status: "RUNNING",
    lastCalculatedAt: timer.scheduledStartAt,
    updatedAt: nowStr,
  };
}

export async function detectExpiry(
  db: D1Database,
  timer: Timer
): Promise<Timer> {
  if (timer.status !== "RUNNING") return timer;

  const remaining = calculateRemaining(
    timer.baseRemainingSeconds,
    timer.lastCalculatedAt
  );
  if (remaining > 0) return timer;

  const now = nowISO();
  const logId = generateId();

  await db.batch([
    db
      .prepare(
        `UPDATE timers SET status = 'EXPIRED', base_remaining_seconds = 0, last_calculated_at = ?, updated_at = ? WHERE id = ?`
      )
      .bind(now, now, timer.id),
    db
      .prepare(
        `INSERT INTO timer_logs (id, timer_id, action_type, actor_name, actor_user_id, delta_seconds, before_seconds, after_seconds, created_at) VALUES (?, ?, 'EXPIRE', 'system', NULL, 0, ?, 0, ?)`
      )
      .bind(logId, timer.id, remaining, now),
  ]);

  return {
    ...timer,
    status: "EXPIRED",
    baseRemainingSeconds: 0,
    lastCalculatedAt: now,
    updatedAt: now,
  };
}

export async function modifyTimer(
  db: D1Database,
  timer: Timer,
  action: ModifyAction,
  deltaSeconds: number,
  actorName: string,
  actorUserId: string | null
): Promise<{ timer: Timer; logs: TimerLog[] }> {
  if (timer.status === "SCHEDULED") {
    throw new Error("예약된 타이머는 시간을 변경할 수 없습니다");
  }

  const now = nowISO();
  const currentRemaining = calculateRemaining(
    timer.baseRemainingSeconds,
    timer.lastCalculatedAt
  );

  let newRemaining: number;
  let newStatus = timer.status;
  const logs: TimerLog[] = [];

  if (action === "ADD") {
    newRemaining = currentRemaining + deltaSeconds;

    if (timer.status === "EXPIRED" && newRemaining > 0) {
      newStatus = "RUNNING";
      logs.push(
        createLog(timer.id, "REOPEN", actorName, actorUserId, 0, currentRemaining, currentRemaining, now)
      );
    }

    logs.push(
      createLog(timer.id, "ADD", actorName, actorUserId, deltaSeconds, currentRemaining, newRemaining, now)
    );
  } else {
    newRemaining = Math.max(0, currentRemaining - deltaSeconds);

    logs.push(
      createLog(timer.id, "SUBTRACT", actorName, actorUserId, deltaSeconds, currentRemaining, newRemaining, now)
    );

    if (newRemaining <= 0 && timer.status !== "EXPIRED") {
      newStatus = "EXPIRED";
      logs.push(
        createLog(timer.id, "EXPIRE", "system", null, 0, newRemaining, 0, now)
      );
      newRemaining = 0;
    }
  }

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE timers SET base_remaining_seconds = ?, last_calculated_at = ?, status = ?, updated_at = ? WHERE id = ?`
      )
      .bind(newRemaining, now, newStatus, now, timer.id),
    ...logs.map((log) =>
      db
        .prepare(
          `INSERT INTO timer_logs (id, timer_id, action_type, actor_name, actor_user_id, delta_seconds, before_seconds, after_seconds, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          log.id,
          log.timerId,
          log.actionType,
          log.actorName,
          log.actorUserId,
          log.deltaSeconds,
          log.beforeSeconds,
          log.afterSeconds,
          log.createdAt
        )
    ),
  ];

  await db.batch(statements);

  const updatedTimer: Timer = {
    ...timer,
    baseRemainingSeconds: newRemaining,
    lastCalculatedAt: now,
    status: newStatus,
    updatedAt: now,
  };

  return { timer: updatedTimer, logs };
}

function createLog(
  timerId: string,
  actionType: ActionType,
  actorName: string,
  actorUserId: string | null,
  deltaSeconds: number,
  beforeSeconds: number,
  afterSeconds: number,
  createdAt: string
): TimerLog {
  return {
    id: generateId(),
    timerId,
    actionType,
    actorName,
    actorUserId,
    deltaSeconds,
    beforeSeconds,
    afterSeconds,
    createdAt,
  };
}
