-- 오버레이 시간 변경 애니메이션 on/off (기본 켜짐)
ALTER TABLE overlay_settings ADD COLUMN animation INTEGER NOT NULL DEFAULT 1;
