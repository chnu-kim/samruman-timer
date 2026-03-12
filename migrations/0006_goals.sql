CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  type TEXT NOT NULL CHECK (type IN ('DURATION', 'DEADLINE')),
  title TEXT NOT NULL,
  target_seconds INTEGER,
  target_datetime TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'FAILED', 'CANCELLED')),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_goals_project ON goals(project_id);
CREATE INDEX idx_goals_project_status ON goals(project_id, status);
