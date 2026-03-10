-- 초기 스키마: 4개 테이블 + 3개 인덱스

CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  chzzk_user_id TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  profile_image_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  description TEXT,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE timers (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  description TEXT,
  base_remaining_seconds INTEGER NOT NULL DEFAULT 0,
  last_calculated_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'EXPIRED')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE timer_logs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  timer_id TEXT NOT NULL REFERENCES timers(id),
  action_type TEXT NOT NULL CHECK (action_type IN ('CREATE', 'ADD', 'SUBTRACT', 'EXPIRE', 'REOPEN')),
  actor_name TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id),
  delta_seconds INTEGER NOT NULL DEFAULT 0,
  before_seconds INTEGER NOT NULL,
  after_seconds INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_timer_logs_timer_created ON timer_logs(timer_id, created_at);
CREATE INDEX idx_timers_project ON timers(project_id);
CREATE INDEX idx_projects_owner ON projects(owner_user_id);
