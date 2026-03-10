-- 소프트 삭제: DELETED 상태 + DELETE 액션 타입 추가
-- D1은 PRAGMA foreign_keys = OFF를 유지하지 않으므로
-- FK 의존성 순서대로 새 테이블 생성 → 복사 → 삭제 → 이름 변경

-- 1. 새 timers 테이블 (DELETED 상태 포함)
CREATE TABLE timers_new (
  id TEXT PRIMARY KEY,
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
INSERT INTO timers_new SELECT * FROM timers;

-- 2. 새 timer_logs 테이블 (DELETE 액션 포함, FK → timers_new)
CREATE TABLE timer_logs_new (
  id TEXT PRIMARY KEY,
  timer_id TEXT NOT NULL REFERENCES timers_new(id),
  action_type TEXT NOT NULL CHECK (action_type IN ('CREATE', 'ADD', 'SUBTRACT', 'EXPIRE', 'REOPEN', 'ACTIVATE', 'DELETE')),
  actor_name TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id),
  delta_seconds INTEGER NOT NULL DEFAULT 0,
  before_seconds INTEGER NOT NULL,
  after_seconds INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO timer_logs_new SELECT * FROM timer_logs;

-- 3. 기존 테이블 삭제 (timer_logs 먼저 — timers를 참조하므로)
DROP TABLE timer_logs;
DROP TABLE timers;

-- 4. 이름 변경
ALTER TABLE timers_new RENAME TO timers;
ALTER TABLE timer_logs_new RENAME TO timer_logs;

-- 5. 인덱스 재생성
CREATE INDEX idx_timers_project ON timers(project_id);
CREATE INDEX idx_timers_scheduled ON timers(status, scheduled_start_at);
CREATE INDEX idx_timer_logs_timer_created ON timer_logs(timer_id, created_at);
