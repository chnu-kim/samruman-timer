# 타이머 계산 로직

## 핵심 개념

타이머는 서버 시간 기준으로 계산한다. 클라이언트는 표시만 담당하며, 모든 상태 변경은 서버에서 수행한다.

## 잔여 시간 계산

```
remaining = baseRemainingSeconds - (now - lastCalculatedAt)
```

- `baseRemainingSeconds`: 마지막 계산 시점의 잔여 시간 (초)
- `lastCalculatedAt`: 마지막으로 baseRemainingSeconds를 계산/갱신한 시각 (Unix timestamp)
- `now`: 현재 서버 시각 (Unix timestamp)

잔여 시간이 0 이하이면 만료된 것으로 판단한다.

## 상태 전이

```
                    예약 시각 도래
SCHEDULED ─────────────────────→ RUNNING
                                    │
          시간 추가                 │ remaining ≤ 0
EXPIRED ──────────→ RUNNING ←──────┘
    ↑                   │
    │    remaining ≤ 0  │
    └───────────────────┘
```

### 상태 정의

| 상태 | 설명 |
|------|------|
| `SCHEDULED` | 예약 시작 대기 중. 카운트다운 미시작, 잔여 시간 고정 |
| `RUNNING` | 타이머 진행 중. 잔여 시간이 실시간으로 감소 |
| `EXPIRED` | 잔여 시간이 0 이하. 카운트다운 정지 |

### 전이 조건

| From | To | 조건 | 로그 |
|------|----|------|------|
| `SCHEDULED` | `RUNNING` | 조회 시 현재 시각 ≥ scheduledStartAt 감지 | `ACTIVATE` |
| `RUNNING` | `EXPIRED` | 조회 시 remaining ≤ 0 감지 | `EXPIRE` |
| `EXPIRED` | `RUNNING` | 시간 추가로 remaining > 0 | `REOPEN` + `ADD` |

## 연산별 로직

### 타이머 생성 (CREATE)
```
baseRemainingSeconds = 입력값 (초)
lastCalculatedAt = now
status = scheduledStartAt ? SCHEDULED : RUNNING
scheduled_start_at = scheduledStartAt (nullable)
```
- 로그: `CREATE` (delta_seconds = 입력값)
- `scheduledStartAt`이 지정되면 `SCHEDULED` 상태로 생성, 미지정 시 기존대로 `RUNNING`

### 예약 활성화 (ACTIVATE)
조회 시 `SCHEDULED` 상태의 타이머에 대해 lazy 감지:
```
if status === SCHEDULED && now >= scheduledStartAt:
  status = RUNNING
  lastCalculatedAt = scheduledStartAt  // 예약 시각부터 경과 시간 계산
```
- 로그: `ACTIVATE` (delta_seconds = 0)
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
  - 로그: `REOPEN` → `ADD`
- 그 외:
  - 로그: `ADD`

### 시간 차감 (SUBTRACT)
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

### 조회 시 상태 감지
타이머를 조회할 때 서버에서 lazy 감지를 체이닝 실행한다:
1. **예약 활성화 감지**: `SCHEDULED` → `RUNNING` (scheduledStartAt 도래 시)
2. **만료 감지**: `RUNNING` → `EXPIRED` (remaining ≤ 0 시)

이를 통해 한 번의 조회로 `SCHEDULED → RUNNING → EXPIRED` 연속 전이가 가능하다.

- status가 `RUNNING`이고 remaining ≤ 0이면:
  - status = `EXPIRED`로 DB 업데이트
  - `baseRemainingSeconds = 0`, `lastCalculatedAt = now`
  - 로그: `EXPIRE`

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

### 로깅하지 않는 이벤트
- 자동 감소 (카운트다운 틱): 로깅 없음
- 단순 조회: 로깅 없음 (만료 감지 시만 EXPIRE 로그)

### 로그 필드
```
{
  timer_id:       타이머 ID
  action_type:    CREATE | ADD | SUBTRACT | EXPIRE | REOPEN | ACTIVATE
  actor_name:     변경자 이름 (시간 변경을 요청한 시청자 닉네임)
  actor_user_id:  변경자 유저 ID (로그인 시, nullable)
  delta_seconds:  변경량 (초)
  before_seconds: 변경 전 잔여 시간
  after_seconds:  변경 후 잔여 시간
  created_at:     기록 시각
}
```

## 엣지 케이스

### 동시 수정
- D1은 단일 writer이므로 동시 쓰기 충돌은 D1 레벨에서 직렬화됨
- 각 연산은 `now` 시점 기준으로 currentRemaining을 재계산하므로, 순차 실행 시 정확한 결과 보장

### 매우 큰 시간 추가
- baseRemainingSeconds에 상한 제한 없음 (비즈니스 로직 결정)
- 프론트엔드에서 합리적 범위 안내 (UX 레벨)

### 음수 remaining 방지
- remaining 계산 시 항상 `max(0, ...)` 적용
- baseRemainingSeconds 저장 시에도 0 미만 불허

### 이미 만료된 타이머에 차감 시도
- currentRemaining이 이미 0이므로 변화 없음
- 로그는 기록 (before=0, after=0, delta=요청값)
