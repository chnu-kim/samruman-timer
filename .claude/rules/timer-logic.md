---
paths:
  - src/lib/timer.ts
  - src/app/api/**/timers/**
  - src/app/api/**/modify/**
  - src/app/api/**/logs/**
  - src/app/api/**/graph/**
---

# 타이머 로직 규칙

타이머 관련 코드 작업 시 반드시 아래 설계 문서를 참조한다:

- `docs/TIMER-LOGIC.md` — 타이머 계산 로직, 상태 전이, 로깅 규칙
- `docs/DATABASE.md` — timers, timer_logs 테이블 스키마

## 핵심 규칙

- 잔여 시간 계산: `remaining = baseRemainingSeconds - (now - lastCalculatedAt)`
- remaining 계산 시 항상 `max(0, ...)` 적용 — 음수 불허
- 상태: `RUNNING` (진행 중) / `EXPIRED` (만료)
- 상태 전이:
  - `RUNNING → EXPIRED`: 조회 시 remaining ≤ 0 감지 → `EXPIRE` 로그
  - `EXPIRED → RUNNING`: 시간 추가로 remaining > 0 → `REOPEN` + `ADD` 로그
- SUBTRACT로 remaining ≤ 0 되면 → `SUBTRACT` + `EXPIRE` 로그
- 로그 action_type: `CREATE`, `ADD`, `SUBTRACT`, `EXPIRE`, `REOPEN`
- 로그에 `before_seconds`, `after_seconds` 반드시 기록
- 자동 감소(카운트다운 틱)와 단순 조회는 로깅하지 않음