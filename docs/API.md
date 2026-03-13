# API 라우트 설계

## 공통 규칙

### 응답 형식
모든 API는 JSON 응답을 반환한다.

```json
// 성공
{ "data": { ... } }

// 에러
{ "error": { "code": "ERROR_CODE", "message": "설명" } }
```

### 인증
- 인증 필요 엔드포인트는 `session` 쿠키의 JWT를 검증
- 미인증 시 `401 Unauthorized`
- 권한 부족 시 `403 Forbidden`

### 에러 코드

| HTTP 상태 | 코드 | 설명 |
|-----------|------|------|
| 400 | `BAD_REQUEST` | 잘못된 요청 파라미터 |
| 401 | `UNAUTHORIZED` | 인증 필요 |
| 403 | `FORBIDDEN` | 권한 없음 |
| 404 | `NOT_FOUND` | 리소스 없음 |
| 500 | `INTERNAL_ERROR` | 서버 오류 |

---

## 인증 API

### GET /api/auth/login

CHZZK OAuth 인증을 시작한다.

- **인증**: 불필요
- **응답**: `302 Redirect` → CHZZK 인증 페이지

### GET /api/auth/callback

CHZZK OAuth 콜백을 처리한다.

- **인증**: 불필요
- **쿼리 파라미터**:
  - `code` (string, 필수): Authorization code
  - `state` (string, 필수): CSRF state
- **응답**: `302 Redirect` → `/` (세션 쿠키 설정)
- **에러**: state 불일치 또는 토큰 교환 실패 시 `/login?error=auth_failed`로 리다이렉트

### POST /api/auth/logout

로그아웃한다.

- **인증**: 필요
- **응답**: `200 OK` (세션 쿠키 삭제)

### GET /api/auth/me

현재 로그인한 사용자 정보를 반환한다.

- **인증**: 필요
- **응답**:
```json
{
  "data": {
    "id": "user_id",
    "chzzkUserId": "chzzk_123",
    "nickname": "닉네임",
    "profileImageUrl": "https://..."
  }
}
```

---

## 프로젝트 API

### GET /api/projects

프로젝트 목록을 조회한다.

- **인증**: 불필요
- **응답**:
```json
{
  "data": [
    {
      "id": "project_id",
      "name": "프로젝트 이름",
      "description": "설명",
      "ownerNickname": "소유자 닉네임",
      "timerCount": 3,
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

### POST /api/projects

프로젝트를 생성한다.

- **인증**: 필요
- **요청 본문**:
```json
{
  "name": "프로젝트 이름",
  "description": "설명 (선택)"
}
```
- **유효성 검사**:
  - `name`: 필수, 1~100자
  - `description`: 선택, 최대 500자
- **응답**: `201 Created`
```json
{
  "data": {
    "id": "new_project_id",
    "name": "프로젝트 이름",
    "description": "설명",
    "ownerUserId": "user_id",
    "createdAt": "2025-01-01T00:00:00Z"
  }
}
```

### GET /api/projects/mine

내 프로젝트 목록을 조회한다.

- **인증**: 필요
- **응답**:
```json
{
  "data": [
    {
      "id": "project_id",
      "name": "프로젝트 이름",
      "description": "설명",
      "ownerNickname": "소유자 닉네임",
      "timerCount": 3,
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

### GET /api/projects/others

다른 사용자의 프로젝트 목록을 조회한다.

- **인증**: 필요
- **응답**:
```json
{
  "data": [
    {
      "id": "project_id",
      "name": "프로젝트 이름",
      "description": "설명",
      "ownerNickname": "소유자 닉네임",
      "timerCount": 3,
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

### GET /api/projects/[id]

프로젝트 상세 정보를 조회한다.

- **인증**: 불필요
- **응답**:
```json
{
  "data": {
    "id": "project_id",
    "name": "프로젝트 이름",
    "description": "설명",
    "owner": {
      "id": "user_id",
      "nickname": "닉네임",
      "profileImageUrl": "https://..."
    },
    "createdAt": "2025-01-01T00:00:00Z",
    "updatedAt": "2025-01-01T00:00:00Z"
  }
}
```

### PATCH /api/projects/[id]

프로젝트를 수정한다.

- **인증**: 필요 (프로젝트 소유자만)
- **요청 본문**:
```json
{
  "name": "새 이름 (선택)",
  "description": "새 설명 (선택)"
}
```
- **유효성 검사**:
  - 최소 1개 필드 필수
  - `name`: 공백 제거 후 비어있으면 안 됨
  - `description`: null 허용
- **에러**:
  - `400`: 변경할 필드 없음, 이름 비어있음, JSON 파싱 실패
  - `401`: 인증 없음
  - `403`: 소유자 아님
  - `404`: 프로젝트 없음
- **응답**: `200 OK`
```json
{
  "data": {
    "id": "project_id",
    "name": "프로젝트 이름",
    "description": "설명",
    "owner": {
      "id": "user_id",
      "nickname": "닉네임",
      "profileImageUrl": "https://..."
    },
    "createdAt": "2025-01-01T00:00:00Z",
    "updatedAt": "2025-01-01T00:00:00Z"
  }
}
```

### DELETE /api/projects/[id]

프로젝트를 소프트 삭제한다 (status를 DELETED로 변경). 하위 타이머도 연쇄 소프트 삭제된다.

- **인증**: 필요 (프로젝트 소유자만)
- **동작**:
  - 프로젝트 status를 `DELETED`로 업데이트
  - 하위 비삭제 타이머 일괄 소프트 삭제
  - 각 타이머에 대해 `DELETE` 액션 로그 기록 (before_seconds에 삭제 시점 잔여 시간, after_seconds=0)
  - 삭제된 프로젝트는 목록/조회에서 필터링됨
- **에러**:
  - `401`: 인증 없음
  - `404`: 프로젝트 없음 또는 이미 삭제됨
  - `403`: 프로젝트 소유자 아님
- **응답**: `200 OK`
```json
{
  "data": {
    "id": "project_id"
  }
}
```

---

## 타이머 API

### GET /api/projects/[id]/timers

프로젝트의 타이머 목록을 조회한다.

- **인증**: 불필요
- **응답**:
```json
{
  "data": [
    {
      "id": "timer_id",
      "title": "타이머 제목",
      "description": "설명",
      "remainingSeconds": 3600,
      "status": "RUNNING | SCHEDULED | EXPIRED",
      "scheduledStartAt": null | "2025-06-01T09:00:00.000Z",
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```
- `remainingSeconds`는 서버에서 실시간 계산한 값
- `SCHEDULED` 상태: `remainingSeconds`는 `baseRemainingSeconds` (고정값)

### POST /api/projects/[id]/timers

타이머를 생성한다. 프로젝트당 1개 타이머를 권장하며, 이미 타이머가 있는 경우 추가 생성 여부를 확인한다.

- **인증**: 필요 (프로젝트 소유자만)
- **요청 본문**:
```json
{
  "title": "타이머 제목",
  "description": "설명 (선택)",
  "initialSeconds": 86400,
  "scheduledStartAt": "2025-06-01T09:00:00Z (선택, ISO 8601 미래 시각)"
}
```
- **유효성 검사**:
  - `title`: 필수, 1~100자
  - `description`: 선택, 최대 500자
  - `initialSeconds`: 필수, 양의 정수
  - `scheduledStartAt`: 선택, 유효한 ISO 8601 미래 시각
- **동작**:
  - `scheduledStartAt` 미지정: 즉시 `RUNNING` 상태로 생성 (기존 동작)
  - `scheduledStartAt` 지정: `SCHEDULED` 상태로 생성, 해당 시각까지 카운트다운 미시작
- **응답**: `201 Created`
```json
{
  "data": {
    "id": "new_timer_id",
    "title": "타이머 제목",
    "remainingSeconds": 86400,
    "status": "RUNNING | SCHEDULED",
    "scheduledStartAt": null | "2025-06-01T09:00:00.000Z",
    "createdAt": "2025-01-01T00:00:00Z"
  }
}
```

### GET /api/timers/[id]

타이머 상세 정보를 조회한다.

- **인증**: 불필요
- **응답**:
```json
{
  "data": {
    "id": "timer_id",
    "projectId": "project_id",
    "title": "타이머 제목",
    "description": "설명",
    "remainingSeconds": 3600,
    "status": "RUNNING | SCHEDULED | EXPIRED",
    "scheduledStartAt": null | "2025-06-01T09:00:00.000Z",
    "createdBy": {
      "id": "user_id",
      "nickname": "닉네임"
    },
    "createdAt": "2025-01-01T00:00:00Z",
    "updatedAt": "2025-01-01T00:00:00Z"
  }
}
```
- 조회 시 예약 활성화 감지 → 만료 감지 로직 체이닝 실행 (TIMER-LOGIC.md 참조)
- `SCHEDULED` 상태: `remainingSeconds`는 `baseRemainingSeconds` (고정값)

### PATCH /api/timers/[id]

타이머의 제목/설명을 수정한다.

- **인증**: 필요 (프로젝트 소유자만)
- **요청 본문**:
```json
{
  "title": "새 제목 (선택)",
  "description": "새 설명 (선택)"
}
```
- **유효성 검사**:
  - 최소 1개 필드 필수
  - `title`: 공백 제거 후 비어있으면 안 됨
  - `description`: null 허용
- **에러**:
  - `400`: 변경할 필드 없음, 제목 비어있음, JSON 파싱 실패
  - `401`: 인증 없음
  - `403`: 소유자 아님
  - `404`: 타이머 없음
- **응답**: `200 OK` (타이머 상세 정보 전체 반환)

### DELETE /api/timers/[id]

타이머를 소프트 삭제한다 (status를 DELETED로 변경).

- **인증**: 필요 (프로젝트 소유자만)
- **동작**:
  - 타이머 status를 `DELETED`로 업데이트
  - `DELETE` 액션 로그 기록 (before_seconds에 삭제 시점 잔여 시간, after_seconds=0)
  - 삭제된 타이머는 목록/조회에서 필터링됨
- **에러**:
  - `401`: 인증 없음
  - `404`: 타이머 없음 또는 이미 삭제됨
  - `403`: 프로젝트 소유자 아님
- **응답**: `200 OK`
```json
{
  "data": {
    "id": "timer_id"
  }
}
```

### POST /api/timers/[id]/modify

타이머 시간을 증감한다.

- **인증**: 필요 (프로젝트 소유자만)
- **요청 본문**:
```json
{
  "action": "ADD" | "SUBTRACT",
  "deltaSeconds": 3600,
  "actorName": "시청자 닉네임 (시간 변경을 요청한 시청자)"
}
```
- **유효성 검사**:
  - `action`: 필수, "ADD" 또는 "SUBTRACT"
  - `deltaSeconds`: 필수, 양의 정수
  - `actorName`: 필수, 1~50자 (시간 변경을 요청한 시청자 닉네임)
- **제한**: `SCHEDULED` 상태의 타이머는 시간 변경 불가 (`400 BAD_REQUEST`)
- **동작**: 요청 시 먼저 예약 활성화 감지를 실행한 후 시간 변경 수행
- **응답**: `200 OK`
```json
{
  "data": {
    "id": "timer_id",
    "remainingSeconds": 7200,
    "status": "RUNNING",
    "log": {
      "id": "log_id",
      "actionType": "ADD",
      "actorName": "시청자 닉네임",
      "deltaSeconds": 3600,
      "beforeSeconds": 3600,
      "afterSeconds": 7200,
      "createdAt": "2025-01-01T00:00:00Z"
    }
  }
}
```

---

## 통계 API

### GET /api/timers/[id]/stats

타이머의 활동 통계를 반환한다. 프로젝트당 타이머 1개(1:1 관계)이므로 프로젝트 통계와 사실상 동일.

- **인증**: 필요 (프로젝트 소유자만)
- **쿼리 파라미터**:
  - `donorLimit` (number, 기본값 10, 최대 50): 상위 후원자 수
- **에러**:
  - `401`: 인증 없음
  - `403`: 소유자 아님
  - `404`: 타이머 없음
- **응답**:
```json
{
  "data": {
    "summary": {
      "totalAddedSeconds": 7200,
      "totalSubtractedSeconds": 1800,
      "netAddedSeconds": 5400,
      "totalEvents": 15,
      "uniqueDonors": 5,
      "peakHour": 14
    },
    "topDonors": [
      {
        "actorName": "닉네임",
        "totalSeconds": 3600,
        "eventCount": 3
      }
    ],
    "hourlyDistribution": [
      {
        "hour": 14,
        "eventCount": 8,
        "adds": 5,
        "subtracts": 3,
        "addedSeconds": 3600
      }
    ],
    "dailyActivity": [
      {
        "date": "2025-01-01",
        "eventCount": 10,
        "addedSeconds": 5000,
        "subtractedSeconds": 1000
      }
    ]
  }
}
```

---

## 로그/그래프 API

### GET /api/timers/[id]/logs

타이머의 변경 로그를 조회한다.

- **인증**: 불필요
- **쿼리 파라미터**:
  - `page` (number, 기본값 1): 페이지 번호
  - `limit` (number, 기본값 20, 최대 250): 페이지당 항목 수
  - `actionType` (string, 선택): 필터링할 액션 타입 (쉼표 구분)
- **응답**:
```json
{
  "data": {
    "logs": [
      {
        "id": "log_id",
        "actionType": "ADD",
        "actorName": "시청자 닉네임",
        "actorUserId": "user_id",
        "deltaSeconds": 3600,
        "beforeSeconds": 0,
        "afterSeconds": 3600,
        "createdAt": "2025-01-01T00:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "totalPages": 3
    }
  }
}
```

### GET /api/timers/[id]/graph

그래프 시각화용 데이터를 반환한다.

- **인증**: 불필요
- **쿼리 파라미터**:
  - `mode` (string, 필수): `remaining` | `cumulative` | `frequency`
- **응답 (mode=remaining)**:
```json
{
  "data": {
    "mode": "remaining",
    "points": [
      { "timestamp": "2025-01-01T00:00:00Z", "remainingSeconds": 86400 },
      { "timestamp": "2025-01-01T01:00:00Z", "remainingSeconds": 82800 }
    ]
  }
}
```
- **응답 (mode=cumulative)**:
```json
{
  "data": {
    "mode": "cumulative",
    "points": [
      { "timestamp": "2025-01-01T00:00:00Z", "totalAdded": 3600, "totalSubtracted": 0 }
    ]
  }
}
```
- **응답 (mode=frequency)**:
```json
{
  "data": {
    "mode": "frequency",
    "buckets": [
      { "hour": "2025-01-01T00:00:00Z", "count": 5, "adds": 3, "subtracts": 2 }
    ]
  }
}
```

---

## 오버레이 설정 API

### GET /api/timers/[id]/overlay-settings

OBS 오버레이 설정을 조회한다.

- **인증**: 불필요
- **응답**: `200 OK`
```json
{
  "data": {
    "fontSize": 72,
    "color": "#ffffff",
    "bg": "transparent",
    "showTitle": false,
    "shadow": true,
    "position": "center"
  }
}
```
- 설정 미저장 시 모든 필드 기본값으로 반환
- `position`: `"center"` | `"top-left"` | `"top-right"` | `"bottom-left"` | `"bottom-right"`
- **에러**:
  - `404`: 타이머 없음

### PUT /api/timers/[id]/overlay-settings

OBS 오버레이 설정을 저장한다.

- **인증**: 필요 (프로젝트 소유자만)
- **요청 본문**:
```json
{
  "fontSize": 96,
  "color": "#00ff88",
  "bg": "transparent",
  "showTitle": true,
  "shadow": false,
  "position": "top-left"
}
```
- **유효성 검사**:
  - `fontSize`: 24~200 정수
  - `position`: 유효한 값만 허용
- **에러**:
  - `400`: JSON 파싱 실패, fontSize 범위 초과, 유효하지 않은 position
  - `401`: 인증 없음
  - `403`: 소유자 아님
  - `404`: 타이머 없음
- **응답**: `200 OK` (저장된 설정 전체 반환)

---

## 목표(Goals) API

### GET /api/projects/[id]/goals

프로젝트의 목표 목록을 조회한다.

- **인증**: 불필요
- **동작**: 조회 시 ACTIVE 목표의 달성 여부를 자동 감지하여 COMPLETED로 전이
- **응답**: `200 OK`
```json
{
  "data": [
    {
      "id": "goal_id",
      "type": "DURATION",
      "title": "10시간 달성",
      "targetSeconds": 36000,
      "targetDatetime": null,
      "status": "ACTIVE",
      "progress": {
        "percentage": 50,
        "currentSeconds": 18000,
        "remainingToTarget": 18000
      },
      "createdAt": "2025-01-01T00:00:00Z",
      "completedAt": null
    }
  ]
}
```
- `type=DURATION`의 progress: `{ percentage, currentSeconds, remainingToTarget }`
- `type=DEADLINE`의 progress: `{ percentage, timerSurvivesDeadline, deadlineIn }`
- 정렬: `created_at DESC`
- CANCELLED 상태의 목표는 제외
- **에러**:
  - `404`: 프로젝트 없음

### POST /api/projects/[id]/goals

프로젝트 목표를 생성한다.

- **인증**: 필요 (프로젝트 소유자만)
- **요청 본문**:
```json
{
  "type": "DURATION | DEADLINE",
  "title": "목표 제목",
  "targetSeconds": 36000,
  "targetDatetime": "2025-12-31T23:59:59Z"
}
```
- **유효성 검사**:
  - `type`: 필수, `"DURATION"` 또는 `"DEADLINE"`
  - `title`: 필수, 1~100자
  - `targetSeconds`: DURATION일 때 필수, 1~8,760,000 (약 100일)
  - `targetDatetime`: DEADLINE일 때 필수, ISO 8601 미래 시각
- **에러**:
  - `400`: 파싱 실패, 제목 길이, 유효하지 않은 타입, 범위 초과, 과거 날짜
  - `401`: 인증 없음
  - `403`: 소유자 아님
  - `404`: 프로젝트 없음
- **응답**: `201 Created`

### PATCH /api/projects/[id]/goals/[goalId]

목표를 취소한다 (ACTIVE → CANCELLED).

- **인증**: 필요 (프로젝트 소유자만)
- **요청 본문**: 없음
- **에러**:
  - `400`: ACTIVE가 아닌 목표 취소 시도
  - `401`: 인증 없음
  - `403`: 소유자 아님
  - `404`: 프로젝트 없음, 목표 없음
- **응답**: `200 OK` (취소된 목표 정보 반환, status=CANCELLED)
