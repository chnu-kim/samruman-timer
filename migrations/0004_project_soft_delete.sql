-- 프로젝트 소프트 삭제: status 컬럼 추가
-- ALTER ADD COLUMN 사용 (CHECK 제약은 앱 코드에서 보장)

ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';
