-- 오버레이 설정 저장 테이블
CREATE TABLE IF NOT EXISTS overlay_settings (
  timer_id TEXT PRIMARY KEY REFERENCES timers(id),
  font_size INTEGER NOT NULL DEFAULT 72,
  text_color TEXT NOT NULL DEFAULT '#ffffff',
  background TEXT NOT NULL DEFAULT 'transparent',
  show_title INTEGER NOT NULL DEFAULT 0,
  text_shadow INTEGER NOT NULL DEFAULT 1,
  position TEXT NOT NULL DEFAULT 'center',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
