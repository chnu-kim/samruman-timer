# 데이터베이스 설계

## 개요

Cloudflare D1 (SQLite 호환)을 사용한다. 스키마는 `migrations/` 디렉토리에서 마이그레이션 파일로 관리한다.

## 테이블 스키마

### users

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  chzzk_user_id TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  profile_image_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### projects

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  description TEXT,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### timers

```sql
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
```

### timer_logs

```sql
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
```

## 인덱스

```sql
CREATE INDEX idx_timer_logs_timer_created ON timer_logs(timer_id, created_at);
CREATE INDEX idx_timers_project ON timers(project_id);
CREATE INDEX idx_timers_scheduled ON timers(status, scheduled_start_at);
CREATE INDEX idx_projects_owner ON projects(owner_user_id);
```

## 마이그레이션 전략

### 파일 구조
```
migrations/
  0001_initial.sql    — 초기 스키마 (4개 테이블 + 인덱스)
  0002_scheduled_start.sql — 예약 시작 기능 (scheduled_start_at, SCHEDULED 상태, ACTIVATE 액션)
```

### 규칙
- 마이그레이션 파일은 순번 접두사로 관리: `NNNN_description.sql`
- 각 파일은 멱등적이지 않음 (한 번만 실행)
- `wrangler d1 migrations apply` 명령으로 적용
- 스키마 변경 시 새 마이그레이션 파일 추가 (기존 파일 수정 금지)

### 초기 마이그레이션 (0001_initial.sql)

위의 모든 CREATE TABLE 및 CREATE INDEX 문을 포함한다.

## 타입 규칙

| 컬럼 타입 | 설명 |
|-----------|------|
| `TEXT` (ID) | 32자 hex 랜덤 문자열 (UUID 대체) |
| `TEXT` (날짜) | ISO 8601 형식 (`datetime('now')`) |
| `INTEGER` | 초 단위 시간 값 |
| `TEXT` (enum) | CHECK 제약으로 허용 값 제한 |

## D1 특이사항

- FOREIGN KEY 기본 비활성: `PRAGMA foreign_keys = ON` 필요 시 실행
- 단일 writer: 동시 쓰기는 D1이 직렬화
- 트랜잭션: `db.batch()` 로 여러 쿼리를 하나의 트랜잭션으로 실행
- datetime 함수: SQLite의 `datetime('now')` 사용 (UTC)
