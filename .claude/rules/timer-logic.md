---
paths:
  - src/lib/timer.ts
  - src/lib/goal.ts
  - src/app/api/timers/**
  - src/app/api/projects/*/timers/**
  - src/app/api/projects/*/goals/**
---

# 타이머 로직

설계: `docs/TIMER-LOGIC.md` (상태 전이표와 로깅 규칙, 목표 달성 판정의 기준 문서).

## 핵심

- 잔여시간은 저장하지 않고 계산한다: `remaining = max(0, base_remaining_seconds - (now - last_calculated_at))`. 시간 변경 시 현재 remaining을 새 base로 확정하고 `last_calculated_at`을 갱신한다.
- 상태: `SCHEDULED`(예약, 카운트다운 미시작) / `RUNNING` / `EXPIRED` / `DELETED`(soft delete).
- 상태 전이는 조회 시점에 lazy하게 감지·기록한다. 크론이 없으므로 "조회될 때까지 DB 상태가 갱신되지 않는다"는 전제로 코드를 읽는다.
  - `SCHEDULED → RUNNING`: now ≥ `scheduled_start_at` → `ACTIVATE` 로그
  - 소유자 '지금 시작'(`POST /api/timers/[id]/activate`): 예약 시각 전 `SCHEDULED → RUNNING`, `last_calculated_at`·`scheduled_start_at` = now, 소유자 이름의 `ACTIVATE` 로그
  - `RUNNING → EXPIRED`: remaining ≤ 0 → `EXPIRE` 로그 (만료 시각 기준으로 기록)
  - `EXPIRED → RUNNING`: ADD로 remaining > 0 → `REOPEN` + `ADD`
  - SUBTRACT로 remaining ≤ 0 → `SUBTRACT` + `EXPIRE`
  - 되돌리기(`revertTimerLog`, 로그 취소 처리): 그 기록의 변경량만 현재 잔여에서 되돌리고 `reverted_at`을 채운다. 보정 행 없음. ADD 되돌리기로 ≤ 0 → `EXPIRE`, SUBTRACT 되돌리기로 만료 상태에서 > 0 → `REOPEN`. 통계·그래프·목표 집계는 `reverted_at IS NULL`만 쓴다
  - 이미 `EXPIRED`이거나 remaining이 0인 타이머의 SUBTRACT는 `400`, 상태·로그 변경 없음
  - 삭제 → `DELETED` + `DELETE` 로그 (before = 삭제 시점 잔여, after = 0)
  - `SCHEDULED`에서는 시간 변경 불가
- 로그 `action_type`: `CREATE`, `ADD`, `SUBTRACT`, `EXPIRE`, `REOPEN`, `ACTIVATE`, `DELETE`. `before_seconds`/`after_seconds`를 반드시 기록한다. 단순 조회와 카운트다운 틱은 로그를 남기지 않는다.
- 상태 변경과 로그 INSERT는 하나의 `db.batch()`로 묶는다. 상태 UPDATE에는 `STATE_GUARD`(읽은 status·잔여·기준 시각) 조건을 걸고, 로그 INSERT는 `INSERT_LOG_IF_CHANGED`(`WHERE changes() = 1`)로 넣는다. 조건 없는 `WHERE id = ?` 쓰기는 동시 요청의 변경을 덮어쓴다.
- 목표(`goal.ts`) 상태는 `GET /api/projects/[id]/goals` 조회 시에만 판정·저장한다.

로직을 바꾸면 `src/lib/__tests__/timer.test.ts`와 `src/__tests__/integration/timer-lifecycle.test.ts`에 경계값(정확히 0초, 예약 시각 직전·직후)을 넣는다.
