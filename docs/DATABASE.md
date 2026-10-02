# 데이터베이스 설계

## 개요

Cloudflare D1 (SQLite 호환)을 사용한다. 스키마는 `migrations/` 디렉토리에서 마이그레이션 파일로 관리한다.

아래 스키마는 `migrations/0001`~`0009`를 순서대로 적용한 최종 형태다. 일부 테이블은 마이그레이션 중 재생성되어 최초 정의와 다르다(예: `timers`, `timer_logs`의 `id`는 `DEFAULT`가 없다). ID와 날짜는 앱 코드에서 `generateId()`·`nowISO()`로 채운다.

## 테이블 스키마

### users

`0001`에서 생성.

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

`0001`에서 생성, `0004`에서 `status` 컬럼 추가(소프트 삭제).

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  description TEXT,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'ACTIVE'
);
```

`status`는 `ALTER TABLE ... ADD COLUMN`으로 추가돼 `CHECK` 제약이 없다. 허용 값(`ACTIVE`, `DELETED`)은 앱 코드(`ProjectStatus`)에서 보장한다. 삭제는 `status = 'DELETED'`로 표시하는 소프트 삭제이며, 이때 하위 타이머도 함께 `DELETED`로 바꾼다.

### timers

`0001`에서 생성, `0002`(`scheduled_start_at`, `SCHEDULED`)와 `0003`(`DELETED`)에서 테이블을 재생성했다. `0003` 이후 `id`에는 `DEFAULT`가 없다.

```sql
CREATE TABLE timers (
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
```

### timer_logs

`0001`에서 생성, `0002`(`ACTIVATE`)와 `0003`(`DELETE`)에서 테이블을 재생성했다. `0003` 이후 `id`에는 `DEFAULT`가 없다.

```sql
CREATE TABLE timer_logs (
  id TEXT PRIMARY KEY,
  timer_id TEXT NOT NULL REFERENCES timers(id),
  action_type TEXT NOT NULL CHECK (action_type IN ('CREATE', 'ADD', 'SUBTRACT', 'EXPIRE', 'REOPEN', 'ACTIVATE', 'DELETE')),
  actor_name TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id),
  delta_seconds INTEGER NOT NULL DEFAULT 0,
  before_seconds INTEGER NOT NULL,
  after_seconds INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### overlay_settings

`0005`에서 생성, `0008`에서 `animation` 컬럼 추가. 타이머당 1행이며 `PUT /api/timers/[id]/overlay-settings`가 upsert(`ON CONFLICT(timer_id) DO UPDATE`)한다. 행이 없으면 API가 기본값을 응답한다. 불리언은 `INTEGER` 0/1로 저장한다.

```sql
CREATE TABLE IF NOT EXISTS overlay_settings (
  timer_id TEXT PRIMARY KEY REFERENCES timers(id),
  font_size INTEGER NOT NULL DEFAULT 72,
  text_color TEXT NOT NULL DEFAULT '#ffffff',
  background TEXT NOT NULL DEFAULT 'transparent',
  show_title INTEGER NOT NULL DEFAULT 0,
  text_shadow INTEGER NOT NULL DEFAULT 1,
  position TEXT NOT NULL DEFAULT 'center',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  animation INTEGER NOT NULL DEFAULT 1
);
```

`CHECK` 제약은 없다. API가 `position`(`center`, `top-left`, `top-right`, `bottom-left`, `bottom-right`)과 `font_size`(24~200 정수)를 검증하고, `text_color`·`background`는 검증 없이 문자열로 저장한다.

### goals

`0006`에서 생성. `DURATION`은 `target_seconds`, `DEADLINE`은 `target_datetime`을 쓰며 둘 다 NULL 허용이다.

```sql
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
```

`created_at`·`updated_at`에 `DEFAULT`가 없어 앱이 항상 값을 넣어야 한다. 삭제는 행을 지우지 않고 `status = 'CANCELLED'`로 바꾼다.

### refresh_tokens

`0007`에서 생성. refresh token 원문은 저장하지 않고 `token_hash`만 저장한다. 같은 로그인에서 rotation으로 이어지는 토큰은 `family_id`를 공유한다.

```sql
CREATE TABLE refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL,
  family_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'USED', 'REVOKED')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at TEXT,
  family_expires_at TEXT  -- 0009: family 절대 만료(로그인 후 90일)
);
```

`expires_at`은 발급 시각 + 30일과 `family_expires_at` 중 이른 쪽이다. rotation해도 family 절대 만료를 넘겨 연장되지 않는다. 로그인할 때 그 사용자의 만료된 행을 지운다(`deleteExpiredRefreshTokens`).

## 인덱스

최종 상태 기준. `0002`·`0003`에서 `timers`, `timer_logs`를 재생성할 때 인덱스도 다시 만들었다.

```sql
CREATE INDEX idx_timer_logs_timer_created ON timer_logs(timer_id, created_at);
CREATE INDEX idx_timers_project ON timers(project_id);
-- 0009: 프로젝트당 비삭제 타이머 1개를 DB에서 보장 (앱의 COUNT 검사 경합 보완)
CREATE UNIQUE INDEX idx_timers_one_per_project ON timers(project_id) WHERE status != 'DELETED';
CREATE INDEX idx_timers_scheduled ON timers(status, scheduled_start_at);
CREATE INDEX idx_projects_owner ON projects(owner_user_id);
CREATE INDEX idx_goals_project ON goals(project_id);
CREATE INDEX idx_goals_project_status ON goals(project_id, status);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens(family_id);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
```

## 마이그레이션 전략

### 파일 구조
```
migrations/
  0001_initial.sql    — 초기 스키마 (4개 테이블 + 인덱스 3개)
  0002_scheduled_start.sql — 예약 시작 기능 (scheduled_start_at, SCHEDULED 상태, ACTIVATE 액션, idx_timers_scheduled)
  0003_soft_delete.sql     — 소프트 삭제 (DELETED 상태, DELETE 액션)
  0004_project_soft_delete.sql — 프로젝트 소프트 삭제 (status 컬럼 추가)
  0005_overlay_settings.sql — 오버레이 설정 테이블 (overlay_settings)
  0006_goals.sql            — 목표 테이블 (goals + 인덱스 2개)
  0007_refresh_tokens.sql   — refresh token 테이블 (refresh_tokens + 인덱스 3개)
  0008_overlay_animation.sql — overlay_settings.animation 컬럼 추가
  0009_timer_unique_and_session_lifetime.sql — 프로젝트당 비삭제 타이머 UNIQUE 부분 인덱스(먼저 기존 중복은 가장 먼저 만든 1개만 남기고 DELETED + DELETE 로그), refresh_tokens.family_expires_at(기존 행은 family 최초 발급 + 90일, expires_at도 그 안으로 줄임)
```

### 규칙
- 마이그레이션 파일은 순번 접두사로 관리: `NNNN_description.sql`
- 각 파일은 멱등적이지 않음 (한 번만 실행)
- `wrangler d1 migrations apply` 명령으로 적용
- 스키마 변경 시 새 마이그레이션 파일 추가 (기존 파일 수정 금지)
- `CHECK` 제약 변경은 테이블 재생성이 필요하다. `0002`는 `PRAGMA foreign_keys = OFF` + rename 방식, `0003`은 새 테이블 생성 → 복사 → 기존 테이블 삭제 → rename 순서(FK 의존성 순서)를 썼다.

### 초기 마이그레이션 (0001_initial.sql)

`users`, `projects`, `timers`, `timer_logs` 4개 테이블과 `idx_timer_logs_timer_created`, `idx_timers_project`, `idx_projects_owner` 인덱스를 만든다. 위 스키마는 이후 마이그레이션이 반영된 최종 형태이므로 `0001`의 내용과 다르다(`timers.status`는 `RUNNING`, `EXPIRED`만, `timer_logs.action_type`은 `CREATE`·`ADD`·`SUBTRACT`·`EXPIRE`·`REOPEN`만 허용, `projects.status` 없음).

## 타입 규칙

| 컬럼 타입 | 설명 |
|-----------|------|
| `TEXT` (ID) | 32자 hex 랜덤 문자열 (UUID 대체) |
| `TEXT` (날짜) | 앱이 쓰는 값은 ISO 8601 UTC (`nowISO()`). 컬럼 `DEFAULT (datetime('now'))`는 `YYYY-MM-DD HH:MM:SS` 형식이라 앱이 항상 값을 명시한다 |
| `INTEGER` (불리언) | `overlay_settings`의 `show_title`, `text_shadow`, `animation`은 0/1 |
| `INTEGER` | 초 단위 시간 값 |
| `TEXT` (enum) | CHECK 제약으로 허용 값 제한 |

## D1 특이사항

- D1은 `PRAGMA foreign_keys = OFF`를 유지하지 않는다(`0003` 주석). 그래서 테이블 재생성은 FK 의존성 순서로 한다
- 단일 writer: 문장 단위로는 직렬화되지만 읽기-수정-쓰기 사이의 경합은 막지 못한다. 타이머 상태 쓰기는 CAS 조건을 건다(`docs/TIMER-LOGIC.md` 동시 수정)
- 트랜잭션: `db.batch()` 로 여러 쿼리를 하나의 트랜잭션으로 실행
- datetime 함수: 컬럼 `DEFAULT`의 `datetime('now')`는 UTC다. 앱 쿼리는 이를 쓰지 않고 `nowISO()` 값을 바인딩한다
