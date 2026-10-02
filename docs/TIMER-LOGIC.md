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

감지를 실행하는 곳: `GET /api/timers/[id]`, `GET /api/projects/[id]/timers` (활성화 → 만료 순). `POST /api/timers/[id]/modify`는 활성화 감지만 실행한다.

## 로그 기록 규칙

### 로깅하는 이벤트
| action_type | 설명 | delta_seconds |
|-------------|------|---------------|
| `CREATE` | 타이머 생성 | 초기 시간 |
| `ADD` | 시간 추가 | 추가된 초 |
| `SUBTRACT` | 시간 차감 | 차감된 초 (양수) |
| `EXPIRE` | 만료 감지 | 0 |
| `REOPEN` | 만료→진행 재오픈 | 0 |
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
  actor_name:     변경자 이름 (ADD/SUBTRACT/REOPEN: 시간 변경을 요청한 시청자 닉네임, CREATE/DELETE: 소유자 닉네임, 자동 전이 ACTIVATE/EXPIRE: 'system')
  actor_user_id:  조작한 소유자 유저 ID (자동 전이는 NULL)
  delta_seconds:  변경량 (초)
  before_seconds: 변경 전 잔여 시간
  after_seconds:  변경 후 잔여 시간
  created_at:     기록 시각
}
```

- 화면에서는 actor_name `'system'`을 '자동'으로 바꿔 표시한다 (`src/lib/utils.ts`, DB 값은 유지)
- 상태 변경과 로그 INSERT는 하나의 `db.batch()`로 묶는다

## 엣지 케이스

### 동시 수정
- D1은 단일 writer이므로 동시 쓰기 충돌은 D1 레벨에서 직렬화됨
- 각 연산은 `now` 시점 기준으로 currentRemaining을 재계산하므로, 순차 실행 시 정확한 결과 보장

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
`ACTIVE` → `COMPLETED` | `FAILED` (자동 판정) / `CANCELLED` (소유자 취소. 삭제 API는 `COMPLETED`·`FAILED` 목표도 `CANCELLED`로 바꾼다)

판정 결과는 `GET /api/projects/[id]/goals` 조회 시에만 DB에 반영된다 (lazy, 로그 없음). 목표 상태가 바뀌면 `completed_at`에 판정 시각을 기록한다.

### 소비 시간
```
consumed = max(0, 초기값(CREATE.after_seconds) + Σ ADD.delta - Σ SUBTRACT.delta - 현재 잔여)
```
- 현재 잔여: `RUNNING`이면 계산값, `EXPIRED`면 0, `SCHEDULED`면 baseRemainingSeconds
- 타이머가 없으면 0

### DURATION (누적 진행 시간 목표)
- `percentage = round(consumed / targetSeconds × 100)`, 최대 999
- `ACTIVE`이고 consumed ≥ targetSeconds이면 `COMPLETED`. `FAILED`로는 가지 않는다

### DEADLINE (마감 시각까지 타이머 생존 목표)
- `percentage = round(consumed / (deadline - 타이머 생성 시각) × 100)`, 최대 100
- 타이머 생존: DB status가 `RUNNING`이고 계산한 잔여 > 0
- `ACTIVE`일 때:
  - 현재 시각 ≥ deadline: 생존이면 `COMPLETED`, 아니면 `FAILED`
  - deadline 전이라도 타이머 DB status가 `EXPIRED`이면 `FAILED` (이후 재오픈돼도 되돌리지 않는다)
  - `target_datetime`이 없거나 파싱할 수 없으면 `FAILED`
