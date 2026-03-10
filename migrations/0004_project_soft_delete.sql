-- 프로젝트 소프트 삭제: status 컬럼 추가
-- SQLite는 ALTER ADD with CHECK 불가하므로 테이블 재생성

PRAGMA foreign_keys = OFF;

ALTER TABLE projects RENAME TO projects_old;

CREATE TABLE projects (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  description TEXT,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DELETED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO projects (id, name, description, owner_user_id, status, created_at, updated_at)
SELECT id, name, description, owner_user_id, 'ACTIVE', created_at, updated_at
FROM projects_old;

DROP TABLE projects_old;

CREATE INDEX idx_projects_owner ON projects(owner_user_id);

PRAGMA foreign_keys = ON;
