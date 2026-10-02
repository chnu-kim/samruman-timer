-- 프로젝트당 비삭제 타이머 1개를 DB에서 보장한다.
-- 앱의 COUNT 후 INSERT 검사만으로는 동시 생성 요청 두 개가 모두 통과할 수 있다.
-- 그 경합으로 이미 생긴 중복이 있으면 인덱스 생성이 실패하므로, 프로젝트마다 가장 먼저 만든
-- 타이머 하나만 남기고 나머지는 DELETED로 바꾼다(DELETE 로그를 남긴다).
INSERT INTO timer_logs (id, timer_id, action_type, actor_name, actor_user_id, delta_seconds, before_seconds, after_seconds, created_at)
SELECT lower(hex(randomblob(16))), t.id, 'DELETE', 'system', NULL, 0, t.base_remaining_seconds, 0,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM timers t
WHERE t.status != 'DELETED'
  AND EXISTS (
    SELECT 1 FROM timers o
    WHERE o.project_id = t.project_id AND o.status != 'DELETED'
      AND (o.created_at < t.created_at OR (o.created_at = t.created_at AND o.id < t.id))
  );

UPDATE timers
SET status = 'DELETED', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE status != 'DELETED'
  AND EXISTS (
    SELECT 1 FROM timers o
    WHERE o.project_id = timers.project_id AND o.status != 'DELETED'
      AND (o.created_at < timers.created_at OR (o.created_at = timers.created_at AND o.id < timers.id))
  );

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

-- 기존 토큰의 만료도 family 절대 만료를 넘지 않게 맞춘다
UPDATE refresh_tokens
SET expires_at = family_expires_at
WHERE expires_at > family_expires_at;
