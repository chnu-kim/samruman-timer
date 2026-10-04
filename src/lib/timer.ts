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

/**
 * 타이머 상태 쓰기는 읽은 상태가 그대로일 때만 적용한다(CAS).
 * 조회와 쓰기가 별도 왕복이라, 조건 없이 쓰면 그 사이 커밋된 다른 변경(후원 ADD, 삭제 등)을 덮어쓴다.
 * 로그 INSERT는 바로 앞 문장이 행을 바꿨을 때만 실행한다(`changes()`는 직전 문장의 변경 행 수).
 */
const STATE_GUARD = "id = ? AND status = ? AND base_remaining_seconds = ? AND last_calculated_at = ?";

function stateGuardBinds(timer: Timer): [string, string, number, string] {
  return [timer.id, timer.status, timer.baseRemainingSeconds, timer.lastCalculatedAt];
}

const INSERT_LOG_IF_CHANGED = `INSERT INTO timer_logs (id, timer_id, action_type, actor_name, actor_user_id, delta_seconds, before_seconds, after_seconds, created_at)
   SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1`;

function applied(results: D1Result[]): boolean {
  return results[0]?.meta?.changes === 1;
}

/** 다른 요청이 먼저 상태를 바꿨을 때 현재 상태를 다시 읽는다 */
export async function reloadTimerState(db: D1Database, timer: Timer): Promise<Timer> {
  const row = await db
    .prepare("SELECT status, base_remaining_seconds, last_calculated_at, updated_at FROM timers WHERE id = ?")
    .bind(timer.id)
    .first<{ status: string; base_remaining_seconds: number; last_calculated_at: string; updated_at: string }>();
  if (!row) return { ...timer, status: "DELETED" };
  return {
    ...timer,
    status: row.status as Timer["status"],
    baseRemainingSeconds: row.base_remaining_seconds,
    lastCalculatedAt: row.last_calculated_at,
    updatedAt: row.updated_at,
  };
}

export class TimerStateError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
    readonly code: "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT",
  ) {
    super(message);
  }
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

  const results = await db.batch([
    db
      .prepare(
        `UPDATE timers SET status = 'RUNNING', last_calculated_at = ?, updated_at = ? WHERE ${STATE_GUARD}`
      )
      .bind(timer.scheduledStartAt, nowStr, ...stateGuardBinds(timer)),
    db
      .prepare(INSERT_LOG_IF_CHANGED)
      .bind(logId, timer.id, "ACTIVATE", "system", null, 0, timer.baseRemainingSeconds, timer.baseRemainingSeconds, timer.scheduledStartAt),
  ]);
  if (!applied(results)) return reloadTimerState(db, timer);

  return {
    ...timer,
    status: "RUNNING",
    lastCalculatedAt: timer.scheduledStartAt,
    updatedAt: nowStr,
  };
}

/**
 * 소유자가 예약 시각 전에 직접 시작한다(SCHEDULED → RUNNING).
 * 시작 시각(scheduled_start_at)도 지금으로 바꿔, 실제 시작 시각을 읽는 곳(오버레이 경과 시간 등)이 어긋나지 않게 한다.
 *
 * 예약 시각이 이미 지났으면 먼저 그 시각 기준으로 자동 활성화한다(지금 시각으로 다시 시작해 경과 시간을 잃지 않게).
 * 이미 시작된 타이머(자동 활성화, 다른 요청이 먼저 시작)면 log 없이 현재 상태를 돌려준다. 삭제됐으면 404.
 */
export async function activateTimerNow(
  db: D1Database,
  timer: Timer,
  actorName: string,
  actorUserId: string
): Promise<{ timer: Timer; log: TimerLog | null }> {
  let current = await detectScheduledActivation(db, timer);
  if (current.status === "SCHEDULED") {
    const now = nowISO();
    const log = createLog(
      current.id, "ACTIVATE", actorName, actorUserId, 0, current.baseRemainingSeconds, current.baseRemainingSeconds, now
    );
    const results = await db.batch([
      db
        .prepare(
          `UPDATE timers SET status = 'RUNNING', last_calculated_at = ?, scheduled_start_at = ?, updated_at = ? WHERE ${STATE_GUARD}`
        )
        .bind(now, now, now, ...stateGuardBinds(current)),
      db
        .prepare(INSERT_LOG_IF_CHANGED)
        .bind(log.id, log.timerId, log.actionType, log.actorName, log.actorUserId, log.deltaSeconds, log.beforeSeconds, log.afterSeconds, log.createdAt),
    ]);
    if (applied(results)) {
      return {
        timer: { ...current, status: "RUNNING", lastCalculatedAt: now, scheduledStartAt: now, updatedAt: now },
        log,
      };
    }
    // 예약 상태에서는 시간 변경이 막혀 있으므로, 가드가 어긋났다면 다른 요청이 먼저 시작했거나 삭제한 것이다
    current = await reloadTimerState(db, current);
  }
  if (current.status === "DELETED") {
    throw new TimerStateError("타이머를 찾을 수 없습니다", 404, "NOT_FOUND");
  }
  return { timer: await detectExpiry(db, current), log: null };
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

  // 실제 만료 시각 = lastCalculatedAt + baseRemainingSeconds
  const actualExpiryMs =
    new Date(timer.lastCalculatedAt).getTime() +
    timer.baseRemainingSeconds * 1000;
  const actualExpiryISO = new Date(actualExpiryMs).toISOString();
  const now = nowISO();
  const logId = generateId();

  const results = await db.batch([
    db
      .prepare(
        `UPDATE timers SET status = 'EXPIRED', base_remaining_seconds = 0, last_calculated_at = ?, updated_at = ? WHERE ${STATE_GUARD}`
      )
      .bind(actualExpiryISO, now, ...stateGuardBinds(timer)),
    db
      .prepare(INSERT_LOG_IF_CHANGED)
      .bind(logId, timer.id, "EXPIRE", "system", null, 0, remaining, 0, actualExpiryISO),
  ]);
  // 그 사이 시간이 추가됐다면 그 상태가 맞다. 다시 읽은 상태로 응답한다
  if (!applied(results)) return reloadTimerState(db, timer);

  return {
    ...timer,
    status: "EXPIRED",
    baseRemainingSeconds: 0,
    lastCalculatedAt: actualExpiryISO,
    updatedAt: now,
  };
}

export const EXPIRED_SUBTRACT_MESSAGE = "만료된 타이머는 차감할 수 없습니다";

const MODIFY_ATTEMPTS = 5;

/**
 * 시간을 추가·차감한다. 읽은 뒤 다른 요청이 먼저 상태를 바꿨으면(동시 후원 등)
 * 현재 상태를 다시 읽어 최대 MODIFY_ATTEMPTS번 다시 계산한다. 변경을 잃지 않기 위해서다.
 */
export async function modifyTimer(
  db: D1Database,
  timer: Timer,
  action: ModifyAction,
  deltaSeconds: number,
  actorName: string,
  actorUserId: string | null
): Promise<{ timer: Timer; logs: TimerLog[] }> {
  let current = timer;
  for (let attempt = 0; attempt < MODIFY_ATTEMPTS; attempt++) {
    const result = await tryModifyTimer(db, current, action, deltaSeconds, actorName, actorUserId);
    if (result) return result;
    current = await reloadTimerState(db, current);
  }
  throw new TimerStateError("다른 변경과 겹쳤습니다. 다시 시도해 주세요", 409, "CONFLICT");
}

async function tryModifyTimer(
  db: D1Database,
  timer: Timer,
  action: ModifyAction,
  deltaSeconds: number,
  actorName: string,
  actorUserId: string | null
): Promise<{ timer: Timer; logs: TimerLog[] } | null> {
  if (timer.status === "DELETED") {
    throw new TimerStateError("타이머를 찾을 수 없습니다", 404, "NOT_FOUND");
  }
  if (timer.status === "SCHEDULED") {
    throw new TimerStateError("예약된 타이머는 시간을 변경할 수 없습니다", 400, "BAD_REQUEST");
  }

  const now = nowISO();
  const currentRemaining = calculateRemaining(
    timer.baseRemainingSeconds,
    timer.lastCalculatedAt
  );

  // 만료 상태(또는 아직 EXPIRED로 기록되지 않았지만 0초가 된 타이머)에서는 차감이 아무것도 바꾸지 않으므로 0→0 로그를 남기지 않는다
  if (action === "SUBTRACT" && (timer.status === "EXPIRED" || currentRemaining <= 0)) {
    throw new TimerStateError(EXPIRED_SUBTRACT_MESSAGE, 400, "BAD_REQUEST");
  }

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
        `UPDATE timers SET base_remaining_seconds = ?, last_calculated_at = ?, status = ?, updated_at = ? WHERE ${STATE_GUARD}`
      )
      .bind(newRemaining, now, newStatus, now, ...stateGuardBinds(timer)),
    ...logs.map((log) =>
      db
        .prepare(INSERT_LOG_IF_CHANGED)
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

  const results = await db.batch(statements);
  if (!applied(results)) return null;

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
