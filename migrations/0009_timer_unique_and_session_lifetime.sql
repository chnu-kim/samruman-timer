-- 프로젝트당 비삭제 타이머 1개를 DB에서 보장한다.
-- 앱의 COUNT 후 INSERT 검사만으로는 동시 생성 요청 두 개가 모두 통과할 수 있다.
CREATE UNIQUE INDEX IF NOT EXISTS idx_timers_one_per_project
  ON timers(project_id) WHERE status != 'DELETED';

-- refresh token family의 절대 만료 시각. rotation할 때마다 30일씩 연장되더라도
-- 이 시각을 넘기지 않아, 로그인 후 일정 기간이 지나면 다시 로그인해야 한다.
ALTER TABLE refresh_tokens ADD COLUMN family_expires_at TEXT;

-- 기존 family는 가장 먼저 발급된 토큰 기준 90일로 채운다
UPDATE refresh_tokens
SET family_expires_at = (
  SELECT strftime('%Y-%m-%dT%H:%M:%fZ', MIN(r2.created_at), '+90 days')
  FROM refresh_tokens r2
  WHERE r2.family_id = refresh_tokens.family_id
);
