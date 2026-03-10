-- 예약 시작 기능: scheduled_start_at 컬럼 추가 + SCHEDULED 상태 추가
-- SQLite는 ALTER CHECK 불가하므로 테이블 재생성

PRAGMA foreign_keys = OFF;

-- 1. 기존 테이블 백업
ALTER TABLE timers RENAME TO timers_old;

-- 2. 새 스키마로 테이블 생성
CREATE TABLE timers (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  description TEXT,
  base_remaining_seconds INTEGER NOT NULL DEFAULT 0,
  last_calculated_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'EXPIRED', 'SCHEDULED')),
  scheduled_start_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. 데이터 복사
INSERT INTO timers (id, project_id, title, description, base_remaining_seconds, last_calculated_at, status, scheduled_start_at, created_by, created_at, updated_at)
SELECT id, project_id, title, description, base_remaining_seconds, last_calculated_at, status, NULL, created_by, created_at, updated_at
FROM timers_old;

-- 4. 기존 테이블 삭제
DROP TABLE timers_old;

-- 5. 기존 인덱스 재생성 + 새 인덱스
CREATE INDEX idx_timers_project ON timers(project_id);
CREATE INDEX idx_timers_scheduled ON timers(status, scheduled_start_at);

-- 6. timer_logs에 ACTIVATE 액션 추가 (테이블 재생성)
ALTER TABLE timer_logs RENAME TO timer_logs_old;

CREATE TABLE timer_logs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  timer_id TEXT NOT NULL REFERENCES timers(id),
  action_type TEXT NOT NULL CHECK (action_type IN ('CREATE', 'ADD', 'SUBTRACT', 'EXPIRE', 'REOPEN', 'ACTIVATE')),
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
