-- 소프트 삭제: DELETED 상태 + DELETE 액션 타입 추가
-- SQLite는 ALTER CHECK 불가하므로 테이블 재생성

PRAGMA foreign_keys = OFF;

-- 1. timers 테이블: DELETED 상태 추가
ALTER TABLE timers RENAME TO timers_old;

CREATE TABLE timers (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  description TEXT,
  base_remaining_seconds INTEGER NOT NULL DEFAULT 0,
  last_calculated_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'EXPIRED', 'SCHEDULED', 'DELETED')),
  scheduled_start_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO timers (id, project_id, title, description, base_remaining_seconds, last_calculated_at, status, scheduled_start_at, created_by, created_at, updated_at)
SELECT id, project_id, title, description, base_remaining_seconds, last_calculated_at, status, scheduled_start_at, created_by, created_at, updated_at
FROM timers_old;

DROP TABLE timers_old;

CREATE INDEX idx_timers_project ON timers(project_id);
CREATE INDEX idx_timers_scheduled ON timers(status, scheduled_start_at);

-- 2. timer_logs 테이블: DELETE 액션 추가
ALTER TABLE timer_logs RENAME TO timer_logs_old;

CREATE TABLE timer_logs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  timer_id TEXT NOT NULL REFERENCES timers(id),
  action_type TEXT NOT NULL CHECK (action_type IN ('CREATE', 'ADD', 'SUBTRACT', 'EXPIRE', 'REOPEN', 'ACTIVATE', 'DELETE')),
  actor_name TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id),
  delta_seconds INTEGER NOT NULL DEFAULT 0,
  before_seconds INTEGER NOT NULL,
  after_seconds INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO timer_logs (id, timer_id, action_type, actor_name, actor_user_id, delta_seconds, before_seconds, after_seconds, created_at)
SELECT id, timer_id, action_type, actor_name, actor_user_id, delta_seconds, before_seconds, after_seconds, created_at
FROM timer_logs_old;

DROP TABLE timer_logs_old;

CREATE INDEX idx_timer_logs_timer_created ON timer_logs(timer_id, created_at);

PRAGMA foreign_keys = ON;
