# 타이머 계산 로직

## 핵심 개념

타이머는 서버 시간 기준으로 계산한다. 클라이언트는 표시만 담당하며, 모든 상태 변경은 서버에서 수행한다.

## 잔여 시간 계산

```
remaining = max(0, baseRemainingSeconds - floor((now - lastCalculatedAt) / 1000))
```

- `baseRemainingSeconds`: 마지막 계산 시점의 잔여 시간 (초)
- `lastCalculatedAt`: 마지막으로 baseRemainingSeconds를 계산/갱신한 시각 (ISO 8601 UTC 문자열, 계산 시 ms로 변환)
- `now`: 현재 서버 시각 (`Date.now()`, ms)

구현: `calculateRemaining()` (`src/lib/timer.ts`). 잔여 시간이 0 이하이면 만료된 것으로 판단한다.

## 상태 전이

```
                    예약 시각 도래
SCHEDULED ─────────────────────→ RUNNING
                                    │
          시간 추가                 │ remaining ≤ 0
EXPIRED ──────────→ RUNNING ←──────┘
    ↑                   │
    │  remaining ≤ 0    │
    │  (조회·차감)      │
    └───────────────────┘

DELETED: 어느 상태에서든 삭제 시 (soft delete, 복구 API 없음)
```

### 상태 정의

| 상태 | 설명 |
|------|------|
| `SCHEDULED` | 예약 시작 대기 중. 카운트다운 미시작, 잔여 시간 고정 |
| `RUNNING` | 타이머 진행 중. 잔여 시간이 실시간으로 감소 |
| `EXPIRED` | 잔여 시간이 0 이하. 카운트다운 정지 |
| `DELETED` | 소프트 삭제. 타이머 조회·변경·통계 API는 404를 반환한다 (로그·그래프 API는 삭제 여부를 확인하지 않는다) |

### 전이 조건

| From | To | 조건 | 로그 |
|------|----|------|------|
| `SCHEDULED` | `RUNNING` | 조회 시 현재 시각 ≥ scheduledStartAt 감지 | `ACTIVATE` |
| `RUNNING` | `EXPIRED` | 조회 시 remaining ≤ 0 감지 | `EXPIRE` |
| `RUNNING` | `EXPIRED` | 시간 차감으로 remaining ≤ 0 | `SUBTRACT` + `EXPIRE` |
| `EXPIRED` | `RUNNING` | 시간 추가로 remaining > 0 | `REOPEN` + `ADD` |
| `RUNNING` | `EXPIRED` | 추가 기록을 되돌려 remaining ≤ 0 | `EXPIRE` (system) |
| `EXPIRED` | `RUNNING` | 차감 기록을 되돌려 remaining > 0 | `REOPEN` (system) |
| `SCHEDULED`/`RUNNING`/`EXPIRED` | `DELETED` | 소유자가 타이머(또는 프로젝트) 삭제 | `DELETE` |

## 연산별 로직

### 타이머 생성 (CREATE)
```
baseRemainingSeconds = 입력값 (초)
lastCalculatedAt = now
status = scheduledStartAt ? SCHEDULED : RUNNING
scheduled_start_at = scheduledStartAt (nullable)
```
- 로그: `CREATE` (delta_seconds = after_seconds = 입력값, before_seconds = 0, actor_name = 소유자 닉네임)
- `scheduledStartAt`이 지정되면 `SCHEDULED` 상태로 생성, 미지정 시 기존대로 `RUNNING`
- 입력 제한: `initialSeconds`는 1~31,536,000(1년) 정수, `scheduledStartAt`은 현재보다 미래인 유효한 날짜(아니면 400). 프로젝트당 비삭제 타이머가 이미 있으면 400
- 예약 시각을 바꾸는 API는 없다 (`PATCH /api/timers/[id]`는 title·description만 변경). 삭제 후 재생성해야 한다

### 예약 활성화 (ACTIVATE)
조회 시 `SCHEDULED` 상태의 타이머에 대해 lazy 감지:
```
if status === SCHEDULED && now >= scheduledStartAt:
  status = RUNNING
  lastCalculatedAt = scheduledStartAt  // 예약 시각부터 경과 시간 계산
```
- 로그: `ACTIVATE` (delta_seconds = 0, before_seconds = after_seconds = baseRemainingSeconds, created_at = scheduledStartAt)
- 핵심: `lastCalculatedAt`을 `scheduledStartAt`으로 설정하여 예약 시각부터 경과 시간 정확히 계산
- `SCHEDULED` 상태에서는 시간 변경(MODIFY) 불가

### 시간 추가 (ADD)
```
currentRemaining = max(0, baseRemainingSeconds - (now - lastCalculatedAt))
baseRemainingSeconds = currentRemaining + deltaSeconds
lastCalculatedAt = now
```
- 만약 이전 status가 `EXPIRED`이고 새 remaining > 0:
  - status = `RUNNING`
  - 로그: `REOPEN` → `ADD` (REOPEN은 요청자 닉네임으로, delta 0, before = after = currentRemaining)
- 그 외:
  - 로그: `ADD`

### 시간 차감 (SUBTRACT)
- 현재 status가 `EXPIRED`이거나 currentRemaining이 0이면 거절한다 (API `400`, 로그 없음). 아래 "이미 만료된 타이머에 차감 시도" 참고
```
currentRemaining = max(0, baseRemainingSeconds - (now - lastCalculatedAt))
baseRemainingSeconds = max(0, currentRemaining - deltaSeconds)
lastCalculatedAt = now
```
- 만약 새 remaining ≤ 0:
  - status = `EXPIRED`
  - 로그: `SUBTRACT` → `EXPIRE`
- 그 외:
  - 로그: `SUBTRACT`

### 추가/차감 공통 입력 제한
`POST /api/timers/[id]/modify` (프로젝트 소유자만):
- `action`: `ADD` 또는 `SUBTRACT`
- `deltaSeconds`: 1~31,536,000(1년) 정수
- `actorName`: 1~50자 문자열

### 되돌리기 (로그 취소 처리)
`POST /api/timers/[id]/logs/[logId]/revert` (프로젝트 소유자만). 구현: `revertTimerLog()` (`src/lib/timer.ts`).

잘못 누른 추가·차감을 없던 일로 만든다. **반대 방향 modify가 아니다.** 반대 modify는 기록·통계에 보정 행을 남겨 원래 실수를 그대로 집계하므로, 기록 행에 `reverted_at`을 표시하고 집계에서 뺀다.

```
amount = before_seconds - after_seconds      // ADD는 -delta, SUBTRACT는 실제로 줄인 양(0에서 잘렸으면 요청량보다 작다)
newRemaining = max(0, currentRemaining + amount)
lastCalculatedAt = now
timer_logs.reverted_at = now                 // 행은 지우지 않는다
```
- **현재 잔여에 그 기록의 변경량만** 되돌린다. 그 기록과 되돌리기 사이에 다른 기기의 변경(후원 ADD 등)이 있어도 그 변경은 남는다
- 대상: 이 타이머의 `ADD`·`SUBTRACT` 기록만. 다른 action은 `400`, 다른 타이머의 기록은 `404`, 이미 되돌린 기록은 `409 CONFLICT`(잔여를 다시 바꾸지 않는다). 시간 제한은 없다(화면은 성공 토스트의 6초 동안만 버튼을 보여 준다)
- 먼저 조회 시 상태 감지(활성화 → 만료)를 실행한다. DB가 `RUNNING`이지만 이미 0초인 타이머는 만료 시각의 `EXPIRE`가 먼저 남는다
- 상태 전이는 modify와 같은 규칙이고 전이 기록만 남긴다(보정 행이 아니다, delta 0, actor `system`):
  - `RUNNING`에서 newRemaining ≤ 0(정확히 0 포함) → `EXPIRED` + `EXPIRE` (before = 되돌리기 전 잔여, after = 0). 만료 뒤 추가로 재시작한 직후 그 추가를 되돌리는 경우가 여기에 해당한다(경과한 몇 초만큼 모자란다)
  - `EXPIRED`에서 newRemaining > 0 → `RUNNING` + `REOPEN` (before = 0, after = newRemaining). 차감으로 만료시킨 실수를 되돌리는 경우
  - 이미 0초인 `EXPIRED` 타이머의 `ADD`를 되돌리면 잔여는 0 그대로이고 기록만 취소 처리된다
- `SCHEDULED`·`DELETED`는 modify와 같이 `400`·`404`
- 동시성: 타이머 UPDATE에 `STATE_GUARD`와 함께 "그 기록이 아직 되돌려지지 않았음"(`EXISTS ... reverted_at IS NULL`)을 건다. 잔여가 바뀌지 않아도 타이머 행을 써서, 같은 기록을 동시에 두 번 되돌리면 하나만 적용된다. 이어지는 `reverted_at` UPDATE와 전이 로그 INSERT는 `changes() = 1`로 앞 문장이 적용됐을 때만 실행된다
- 집계 제외: 통계(요약·순위·시간대·일별), 그래프(세 모드), 목표 소비 시간은 `reverted_at IS NULL`인 행만 쓴다. 기록 목록은 되돌린 행도 보여 주고 '되돌림'으로 표시한다
- 잔여 그래프의 한계: 되돌린 행은 빠지지만, 그 행과 되돌리기 사이에 생긴 다른 행의 `after_seconds`는 당시 실제 잔여(되돌린 변경량 포함)라 그대로 그린다. 보통은 몇 초 안에 되돌려 사이 행이 없다

### 타이머 삭제 (DELETE)
```
status = DELETED
```
- 로그: `DELETE` (delta_seconds = 0, before_seconds = 삭제 시점 잔여 시간, after_seconds = 0, actor_name = 소유자 닉네임)
- 삭제 시점 잔여 시간: `RUNNING`이면 계산값, `SCHEDULED`면 baseRemainingSeconds, `EXPIRED`면 0
- 프로젝트 삭제 시 하위 타이머도 같은 방식으로 함께 삭제된다

### 조회 시 상태 감지
타이머를 조회할 때 서버에서 lazy 감지를 체이닝 실행한다:
1. **예약 활성화 감지**: `SCHEDULED` → `RUNNING` (scheduledStartAt 도래 시)
2. **만료 감지**: `RUNNING` → `EXPIRED` (remaining ≤ 0 시)

이를 통해 한 번의 조회로 `SCHEDULED → RUNNING → EXPIRED` 연속 전이가 가능하다.

- status가 `RUNNING`이고 remaining ≤ 0이면:
  - status = `EXPIRED`로 DB 업데이트
  - `baseRemainingSeconds = 0`, `lastCalculatedAt = 실제 만료 시각(lastCalculatedAt + baseRemainingSeconds)`
  - 로그: `EXPIRE` (created_at = 실제 만료 시각, 조회 시각이 아니다)

감지를 실행하는 곳: `GET /api/timers/[id]`, `GET /api/projects/[id]/timers`, `POST /api/timers/[id]/logs/[logId]/revert` (활성화 → 만료 순). `POST /api/timers/[id]/modify`는 활성화 감지만 실행한다.

## 로그 기록 규칙

### 로깅하는 이벤트
| action_type | 설명 | delta_seconds |
|-------------|------|---------------|
| `CREATE` | 타이머 생성 | 초기 시간 |
| `ADD` | 시간 추가 | 추가된 초 |
| `SUBTRACT` | 시간 차감 | 차감된 초 (양수) |
| `EXPIRE` | 만료 감지(조회·차감·추가 되돌리기) | 0 |
| `REOPEN` | 만료→진행 재오픈(추가·차감 되돌리기) | 0 |
| `ACTIVATE` | 예약→진행 활성화 | 0 |
| `DELETE` | 타이머 삭제 | 0 |

### 로깅하지 않는 이벤트
- 자동 감소 (카운트다운 틱): 로깅 없음
- 단순 조회: 로깅 없음 (예약 활성화·만료 감지 시만 ACTIVATE·EXPIRE 로그)

### 로그 필드
```
{
  timer_id:       타이머 ID
  action_type:    CREATE | ADD | SUBTRACT | EXPIRE | REOPEN | ACTIVATE | DELETE
  actor_name:     변경자 이름 (ADD/SUBTRACT/REOPEN: 시간 변경을 요청한 시청자 닉네임, CREATE/DELETE: 소유자 닉네임, 자동 전이 ACTIVATE/EXPIRE와 되돌리기가 남긴 EXPIRE/REOPEN: 'system')
  actor_user_id:  조작한 소유자 유저 ID (자동 전이는 NULL)
  delta_seconds:  변경량 (초)
  before_seconds: 변경 전 잔여 시간
  after_seconds:  변경 후 잔여 시간
  created_at:     기록 시각
  reverted_at:    되돌린 시각 (ADD/SUBTRACT만, NULL이면 유효. 0010)
}
```

- 화면에서는 actor_user_id가 NULL인 `EXPIRE`·`ACTIVATE`·`REOPEN`의 actor_name(`'system'`)을 '자동'으로 바꿔 표시한다 (`src/lib/utils.ts`, DB 값은 유지)
- 상태 변경과 로그 INSERT는 하나의 `db.batch()`로 묶는다

## 엣지 케이스

### 동시 수정
- D1은 문장 단위로 쓰기를 직렬화하지만, 조회(SELECT)와 쓰기(batch)가 별도 왕복이라 읽기-수정-쓰기 사이에 다른 요청이 끼어들 수 있다. 조건 없이 쓰면 그 사이 커밋된 ADD를 덮어쓰거나 삭제된 타이머를 되살린다
- 그래서 상태 UPDATE는 읽은 `status`·`base_remaining_seconds`·`last_calculated_at`이 그대로일 때만 적용한다(CAS, `src/lib/timer.ts`의 `STATE_GUARD`). 같은 batch의 로그 INSERT는 `WHERE changes() = 1`로 UPDATE가 적용됐을 때만 들어간다
- CAS가 실패하면:
  - 조회 시 lazy 전이(`detectScheduledActivation`, `detectExpiry`): 아무것도 쓰지 않고 다시 읽은 상태를 돌려준다(먼저 쓴 쪽이 맞다)
  - `modifyTimer`: 다시 읽은 상태로 최대 5번 다시 계산한다. 그 사이 삭제됐으면 `404`, 모두 겹치면 `409 CONFLICT`

### 매우 큰 시간 추가
- 요청 1회당 `deltaSeconds`(와 생성 시 `initialSeconds`)는 최대 31,536,000초(1년)로 제한한다 (API `400`)
- 누적된 baseRemainingSeconds에는 상한이 없다

### 음수 remaining 방지
- remaining 계산 시 항상 `max(0, ...)` 적용
- baseRemainingSeconds 저장 시에도 0 미만 불허

### 이미 만료된 타이머에 차감 시도
- currentRemaining이 이미 0이라 차감해도 변화가 없으므로 `400 BAD_REQUEST`("만료된 타이머는 차감할 수 없습니다")로 거절한다
- 상태와 로그를 바꾸지 않는다. 예전에는 before=0, after=0인 `SUBTRACT` 로그가 시청자 닉네임과 함께 공개 변경 기록에 남았다
- DB status가 아직 `RUNNING`이어도(만료는 조회 시 lazy 감지) currentRemaining이 0이면 같은 상황으로 보고 거절한다
- `modifyTimer()`도 같은 조건에서 예외를 던진다. 라우트가 먼저 400을 반환하므로 정상 경로에서는 도달하지 않는다

## 목표 달성 판정

구현: `src/lib/goal.ts` (`computeProgress`). 목표는 프로젝트 단위이며 프로젝트의 비삭제 타이머 1개를 기준으로 계산한다.

### 상태
`ACTIVE` → `COMPLETED` | `FAILED` (자동 판정) / `CANCELLED` (소유자 취소). 삭제 API는 상태를 바꾸지 않고 `FAILED`·`CANCELLED` 행만 실제로 지운다. `COMPLETED`로 바뀐 목표는 다시 바뀌지 않는다

판정 결과는 `GET /api/projects/[id]/goals` 조회 시에만 DB에 반영된다 (lazy, 로그 없음). 목표 상태가 바뀌면 `completed_at`에 판정 시각을 기록한다.

### 소비 시간
```
consumed = max(0, 초기값(CREATE.after_seconds) + Σ ADD.delta - Σ SUBTRACT.delta - 현재 잔여)
```
- Σ는 되돌리지 않은(`reverted_at IS NULL`) 기록만. 되돌리기는 잔여도 같은 양만큼 되돌리므로 consumed는 그대로다. 되돌린 +10시간을 합에 남기면 consumed가 10시간 뛰어 목표가 잘못 달성 처리된다
- 현재 잔여: `RUNNING`이면 계산값, `EXPIRED`면 0, `SCHEDULED`면 baseRemainingSeconds
- 타이머가 없으면 0

### DURATION (누적 진행 시간 목표)
- `percentage = round(consumed / targetSeconds × 100)`, 최대 999. `COMPLETED`이면 100으로 고정하고 `currentSeconds`는 `targetSeconds`로 보여 준다(달성 뒤에도 consumed는 늘어난다). 화면 이름은 '방송 시간 목표'
- `ACTIVE`이고 consumed ≥ targetSeconds이면 `COMPLETED`. `FAILED`로는 가지 않는다

### DEADLINE (마감 시각까지 타이머 생존 목표)
- `percentage = round(consumed / (deadline - 타이머 생성 시각) × 100)`, 최대 100. `COMPLETED`이면 100. 카드는 퍼센트 대신 마감 시각('10. 05 (월) 00:00 · D-1')을 보여 준다
- `deadlineAfterTimerEnd`: 종료 예정(RUNNING: 지금+잔여, SCHEDULED: 시작 예정+잔여)보다 마감이 늦으면 true. 카드에 '종료 예정보다 뒤' 경고
- 타이머 생존: DB status가 `RUNNING`이고 계산한 잔여 > 0
- `ACTIVE`일 때:
  - 현재 시각 ≥ deadline: 생존이면 `COMPLETED`, 아니면 `FAILED`
  - deadline 전이라도 타이머 DB status가 `EXPIRED`이면 `FAILED` (이후 재오픈돼도 되돌리지 않는다)
  - `target_datetime`이 없거나 파싱할 수 없으면 `FAILED`
