-- 되돌리기(로그 취소 처리): 되돌린 ADD/SUBTRACT 기록에 취소 시각을 남긴다.
-- 행은 지우지 않고 기록 목록에 '되돌림'으로 보이며, 통계·순위·그래프·목표 진행률 집계에서는 제외한다.
-- NULL = 유효한 기록. 반대 방향 보정 행을 따로 남기지 않는다(docs/TIMER-LOGIC.md "되돌리기")
ALTER TABLE timer_logs ADD COLUMN reverted_at TEXT;
