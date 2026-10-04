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

/** 되돌리기 대상 기록. 경로의 타이머에 속한 행만 읽는다 */
export interface RevertTarget {
  id: string;
  actionType: ActionType;
  actorName: string;
  actorUserId: string | null;
  deltaSeconds: number;
  beforeSeconds: number;
  afterSeconds: number;
  createdAt: string;
  revertedAt: string | null;
}

export async function loadRevertTarget(db: D1Database, timerId: string, logId: string): Promise<RevertTarget | null> {
  const row = await db
    .prepare(
      `SELECT id, action_type, actor_name, actor_user_id, delta_seconds, before_seconds, after_seconds, created_at, reverted_at
       FROM timer_logs WHERE id = ? AND timer_id = ?`
    )
    .bind(logId, timerId)
    .first<{
      id: string;
      action_type: string;
      actor_name: string;
      actor_user_id: string | null;
      delta_seconds: number;
      before_seconds: number;
      after_seconds: number;
      created_at: string;
      reverted_at: string | null;
    }>();
  if (!row) return null;
  return {
    id: row.id,
    actionType: row.action_type as ActionType,
    actorName: row.actor_name,
    actorUserId: row.actor_user_id,
    deltaSeconds: row.delta_seconds,
    beforeSeconds: row.before_seconds,
    afterSeconds: row.after_seconds,
    createdAt: row.created_at,
    revertedAt: row.reverted_at,
  };
}

export const ALREADY_REVERTED_MESSAGE = "이미 되돌린 기록입니다";

/**
 * 되돌리기가 잔여 시간에 더할 양. 반대 방향 modify가 아니라 "그 기록이 실제로 바꾼 양"만 되돌린다.
 * 차감은 0에서 잘렸을 수 있어(5초 남았을 때 -10분) 요청량(delta_seconds)이 아니라 before - after를 쓴다.
 */
export function revertAmount(log: Pick<RevertTarget, "actionType" | "beforeSeconds" | "afterSeconds">): number {
  // ADD는 after - before(= delta)만큼 늘렸으니 그만큼 빼고, SUBTRACT는 실제로 줄인 만큼 더한다
  return log.beforeSeconds - log.afterSeconds;
}

/**
 * 시간 변경 기록 하나를 되돌린다(로그 취소 처리).
 *
 * - 현재 잔여 시간에 그 기록이 실제로 바꾼 양만 반대로 적용한다. 사이에 다른 기기의 변경이 있어도 그 변경은 남는다.
 * - 기록 행은 지우지 않고 `reverted_at`만 채운다. 반대 방향 보정 행을 남기지 않는다.
 * - 상태 전이는 modify와 같은 규칙으로 기록한다: 0 이하가 되면 RUNNING → EXPIRED(+EXPIRE),
 *   만료 상태에서 0보다 커지면 EXPIRED → RUNNING(+REOPEN). 잔여가 이미 0인 만료 타이머의 ADD를 되돌리면 잔여는 0 그대로다.
 * - 타이머 UPDATE가 "그 기록이 아직 되돌려지지 않았음"을 조건으로 걸어, 동시에 두 번 되돌려도 한 번만 적용된다.
 */
export async function revertTimerLog(
  db: D1Database,
  timer: Timer,
  logId: string,
): Promise<{ timer: Timer; log: RevertTarget }> {
  let current = timer;
  for (let attempt = 0; attempt < MODIFY_ATTEMPTS; attempt++) {
    const log = await loadRevertTarget(db, timer.id, logId);
    if (!log) throw new TimerStateError("기록을 찾을 수 없습니다", 404, "NOT_FOUND");
    if (log.actionType !== "ADD" && log.actionType !== "SUBTRACT") {
      throw new TimerStateError("시간 추가·차감 기록만 되돌릴 수 있습니다", 400, "BAD_REQUEST");
    }
    if (log.revertedAt) throw new TimerStateError(ALREADY_REVERTED_MESSAGE, 409, "CONFLICT");

    const result = await tryRevertTimerLog(db, current, log);
    if (result) return result;
    current = await reloadTimerState(db, current);
  }
  throw new TimerStateError("다른 변경과 겹쳤습니다. 다시 시도해 주세요", 409, "CONFLICT");
}

async function tryRevertTimerLog(
  db: D1Database,
  timer: Timer,
  log: RevertTarget,
): Promise<{ timer: Timer; log: RevertTarget } | null> {
  if (timer.status === "DELETED") {
    throw new TimerStateError("타이머를 찾을 수 없습니다", 404, "NOT_FOUND");
  }
  if (timer.status === "SCHEDULED") {
    throw new TimerStateError("예약된 타이머는 시간을 변경할 수 없습니다", 400, "BAD_REQUEST");
  }

  const now = nowISO();
  const currentRemaining =
    timer.status === "EXPIRED" ? 0 : calculateRemaining(timer.baseRemainingSeconds, timer.lastCalculatedAt);
  let newRemaining = Math.max(0, currentRemaining + revertAmount(log));
  let newStatus = timer.status;
  let transition: TimerLog | null = null;

  // 상태 전이 행은 보정 행이 아니라 전이 기록이다(delta 0). 전·후 값은 되돌리기 전후 잔여라 잔여 그래프가 이 점을 잇는다
  if (timer.status === "RUNNING" && newRemaining <= 0) {
    newStatus = "EXPIRED";
    newRemaining = 0;
    transition = createLog(timer.id, "EXPIRE", "system", null, 0, currentRemaining, 0, now);
  } else if (timer.status === "EXPIRED" && newRemaining > 0) {
    newStatus = "RUNNING";
    transition = createLog(timer.id, "REOPEN", "system", null, 0, currentRemaining, newRemaining, now);
  }

  // 잔여가 바뀌지 않아도 타이머 행을 쓴다. 두 요청이 같은 기록을 동시에 되돌리면 이 CAS에서 하나만 이긴다
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE timers SET base_remaining_seconds = ?, last_calculated_at = ?, status = ?, updated_at = ?
         WHERE ${STATE_GUARD}
           AND EXISTS (SELECT 1 FROM timer_logs WHERE id = ? AND timer_id = ? AND reverted_at IS NULL)`
      )
      .bind(newRemaining, now, newStatus, now, ...stateGuardBinds(timer), log.id, timer.id),
    db
      .prepare("UPDATE timer_logs SET reverted_at = ? WHERE id = ? AND reverted_at IS NULL AND changes() = 1")
      .bind(now, log.id),
  ];
  if (transition) {
    statements.push(
      db
        .prepare(INSERT_LOG_IF_CHANGED)
        .bind(
          transition.id,
          transition.timerId,
          transition.actionType,
          transition.actorName,
          transition.actorUserId,
          transition.deltaSeconds,
          transition.beforeSeconds,
          transition.afterSeconds,
          transition.createdAt
        )
    );
  }

  const results = await db.batch(statements);
  if (!applied(results)) return null;

  return {
    timer: {
      ...timer,
      baseRemainingSeconds: newRemaining,
      lastCalculatedAt: now,
      status: newStatus,
      updatedAt: now,
    },
    log: { ...log, revertedAt: now },
  };
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
