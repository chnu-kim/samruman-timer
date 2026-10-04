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
- 인증 필요 엔드포인트는 `src/middleware.ts`의 `PROTECTED_ROUTES`(메서드+경로 패턴)에 등록된 것이다. 미들웨어가 `session` 쿠키의 JWT를 검증하고, 만료됐으면 `refresh` 쿠키로 토큰을 갱신(rotation)한 뒤 `x-user-id`·`x-user-chzzk-id`·`x-user-nickname` 헤더를 주입한다
- 미인증 시 `401 Unauthorized` (둘 다 없거나 갱신 실패 시 미들웨어가 바로 반환)
- 갱신 도중 D1 장애 같은 서버 오류가 나면 `401`이 아니라 `500 INTERNAL_ERROR`를 반환한다. 세션이 만료된 것이 아니므로 클라이언트는 로그인 화면으로 보내지 않는다 (AUTH.md 참조)
- 권한 부족 시 `403 Forbidden`

### 요청 ID (`x-request-id`)

모든 `/api/*` 응답(성공·오류·미들웨어가 직접 낸 401/500 포함)에 `x-request-id` 응답 헤더가 붙는다. 미들웨어가 요청마다 새로 만든 UUID이며, 클라이언트가 보낸 같은 이름의 헤더는 무시하고 덮어쓴다. 오류 본문에는 넣지 않는다. 운영 로그의 `requestId`와 같은 값이라 문제 신고를 로그와 잇는 키로 쓴다 (OBSERVABILITY.md).

### 에러 코드

| HTTP 상태 | 코드 | 설명 |
|-----------|------|------|
| 400 | `BAD_REQUEST` | 잘못된 요청 파라미터 |
| 401 | `UNAUTHORIZED` | 인증 필요 (로그아웃 상태: `refresh` 쿠키 없음, 또는 라우트가 사용자 헤더를 못 받음) |
| 401 | `SESSION_EXPIRED` | 미들웨어가 `refresh` 쿠키 갱신을 거부함 (세션 만료·폐기·재사용 감지). 화면은 이 코드로 로그아웃 상태와 세션 만료를 구분한다 |
| 403 | `FORBIDDEN` | 권한 없음 |
| 404 | `NOT_FOUND` | 리소스 없음 |
| 409 | `CONFLICT` | 동시 변경과 계속 겹침 (`POST /api/timers/[id]/modify`), 이미 되돌린 기록 (`POST /api/timers/[id]/logs/[logId]/revert`) |
| 500 | `INTERNAL_ERROR` | 서버 오류 |
| 503 | `SERVICE_UNAVAILABLE` | 원격 D1 스키마가 코드보다 뒤처짐 (`GET /api/health`) |

---

## 인증 API

### GET /api/auth/login

CHZZK OAuth 인증을 시작한다.

- **인증**: 불필요
- **쿼리 파라미터**:
  - `next` (string, 선택): 로그인 후 돌아갈 같은 출처 상대 경로(예: `/timers/abc`). `/`로 시작하고 `//`·역슬래시·공백·제어 문자가 없으며 `/login`·`/api/`가 아닌 경로만 받는다(AUTH.md 참조). 통과하면 `oauth_next` 쿠키에 저장하고, 아니면 무시한다
- **응답**: `302 Redirect` → CHZZK 인증 페이지

### GET /api/auth/callback

CHZZK OAuth 콜백을 처리한다.

- **인증**: 불필요
- **쿼리 파라미터**:
  - `code` (string, 필수): Authorization code
  - `state` (string, 필수): CSRF state
- **응답**: `302 Redirect` → `oauth_next` 쿠키의 경로(다시 검증), 없으면 `/` (세션 쿠키 설정, `oauth_next` 삭제)
- **에러**: `state` 누락, state 불일치(state 쿠키 대조), 토큰 교환·사용자 조회 실패 시 `/login?error=auth_failed`로 리다이렉트. `code`만 없고 state가 맞으면(동의 화면 취소) `error` 없이 `/login`으로. 어느 쪽이든 `oauth_next`를 다시 검증해 `&next=`로 싣고 쿠키는 삭제

### POST /api/auth/logout

로그아웃한다.

- **인증**: `session` 또는 `refresh` 쿠키 중 하나가 있어야 한다. 둘 다 없으면 `401`
  - `PROTECTED_ROUTES`에 넣지 않는다. 넣으면 access token이 만료된 상태의 로그아웃에서 미들웨어가 rotation한 새 `session` 쿠키가 라우트의 삭제 쿠키를 덮어써 로그인이 유지된다. 라우트가 쿠키를 직접 확인한다
- **동작**: `refresh` 쿠키가 있으면 해당 refresh token family 전체를 폐기한다 (폐기 실패해도 로그아웃은 진행)
- **응답**: `200 OK`, `{ "data": null }` (`session`·`refresh` 쿠키 삭제)

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
- **에러**: `404`: 사용자 없음

---

## 프로젝트 API

### GET /api/projects

프로젝트 목록을 조회한다.

- **인증**: 불필요
- **쿼리 파라미터** (`/api/projects`, `/mine`, `/others` 공통):
  - `q` (string, 선택): 이름·설명·소유자 닉네임 부분 일치 검색. 앞 100자만 사용
  - `page` (number, 기본값 1)
  - `limit` (number, 기본값 12, 1~50으로 보정)
  - `sort` (string, 선택): `name`이면 이름순, 그 외에는 최신순(`created_at DESC`)
- 삭제된(`DELETED`) 프로젝트는 제외한다. `timerCount`는 비삭제 타이머 수, `totalPages`는 최소 1
- 타이머 상태(`timerStatus`·`remainingSeconds`·`scheduledStartAt`)는 프로젝트의 비삭제 타이머(최대 1개)를 조인해 **조회 시점 기준으로 계산한 값**이다. 저장된 상태가 `RUNNING`이어도 잔여 0이면 `EXPIRED`, 시작 시각이 지난 `SCHEDULED`는 그 시각부터 흐른 `RUNNING`(또는 `EXPIRED`)으로 내려 준다. 목록 조회는 상태 전이를 DB에 쓰지 않는다(전이는 타이머 조회 때 기록된다)
  - `timerStatus`: `RUNNING` | `SCHEDULED` | `EXPIRED` | `null`(타이머 없음)
  - `remainingSeconds`: 조회 시점 잔여초, 타이머가 없으면 `null`
  - `scheduledStartAt`: `SCHEDULED`일 때 시작 시각, 그 외 `null`
- **응답**:
```json
{
  "data": {
    "projects": [
      {
        "id": "project_id",
        "name": "프로젝트 이름",
        "description": "설명",
        "ownerNickname": "소유자 닉네임",
        "timerCount": 1,
        "timerStatus": "RUNNING",
        "remainingSeconds": 8040,
        "scheduledStartAt": null,
        "createdAt": "2025-01-01T00:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 12,
      "total": 30,
      "totalPages": 3
    }
  }
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
- **쿼리 파라미터**: `GET /api/projects`와 같다
- **응답**:
```json
{
  "data": {
    "projects": [
      {
        "id": "project_id",
        "name": "프로젝트 이름",
        "description": "설명",
        "ownerNickname": "소유자 닉네임",
        "timerCount": 1,
        "timerStatus": "RUNNING",
        "remainingSeconds": 8040,
        "scheduledStartAt": null,
        "createdAt": "2025-01-01T00:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 12,
      "total": 30,
      "totalPages": 3
    }
  }
}
```

### GET /api/projects/others

다른 사용자의 프로젝트 목록을 조회한다.

- **인증**: 필요
- **쿼리 파라미터**: `GET /api/projects`와 같다
- **응답**:
```json
{
  "data": {
    "projects": [
      {
        "id": "project_id",
        "name": "프로젝트 이름",
        "description": "설명",
        "ownerNickname": "소유자 닉네임",
        "timerCount": 1,
        "timerStatus": "RUNNING",
        "remainingSeconds": 8040,
        "scheduledStartAt": null,
        "createdAt": "2025-01-01T00:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 12,
      "total": 30,
      "totalPages": 3
    }
  }
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
- **에러**: `404`: 프로젝트 없음 또는 삭제됨

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
  - 본문은 JSON 객체여야 하고 최소 1개 필드 필수
  - `name`: 문자열, 공백 제거 후 1~100자 (앞뒤 공백을 제거해 저장)
  - `description`: 최대 500자 문자열 또는 `null`. 앞뒤 공백 제거 후 빈 문자열이면 null로 저장
- **에러**:
  - `400`: 본문이 객체가 아님, 변경할 필드 없음, 이름 형식·길이, 설명 길이, JSON 파싱 실패
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
- 조회 시 타이머마다 예약 활성화 감지 → 만료 감지를 실행한다. 정렬 `created_at DESC`, 삭제된 타이머 제외
- **에러**: `404`: 프로젝트 없음 또는 삭제됨

### POST /api/projects/[id]/timers

타이머를 생성한다. 프로젝트당 타이머는 1개로, 비삭제 타이머가 이미 있으면 `400 BAD_REQUEST`로 거절한다.

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
  - `initialSeconds`: 필수, 1~31,536,000 정수 (1년)
  - `scheduledStartAt`: 선택, 유효한 ISO 8601 미래 시각 (`toISOString()`으로 정규화해 저장)
- **동작**:
  - `scheduledStartAt` 미지정: 즉시 `RUNNING` 상태로 생성 (기존 동작)
  - `scheduledStartAt` 지정: `SCHEDULED` 상태로 생성, 해당 시각까지 카운트다운 미시작
  - 타이머 생성과 `CREATE` 로그 기록을 `db.batch()`로 함께 실행
- **에러**:
  - `400`: JSON 파싱 실패, 유효성 검사 실패, 이미 타이머가 있음
  - `401`: 인증 없음
  - `403`: 프로젝트 소유자 아님
  - `404`: 프로젝트 없음 또는 삭제됨
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
    "projectName": "프로젝트 이름",
    "title": "타이머 제목",
    "description": "설명",
    "remainingSeconds": 3600,
    "status": "RUNNING | SCHEDULED | EXPIRED",
    "scheduledStartAt": null | "2025-06-01T09:00:00.000Z",
    "createdBy": {
      "id": "user_id",
      "nickname": "닉네임"
    },
    "projectOwnerId": "user_id",
    "createdAt": "2025-01-01T00:00:00Z",
    "updatedAt": "2025-01-01T00:00:00Z",
    "deltaSinceSeconds": 600 | -300 | null
  }
}
```
- 조회 시 예약 활성화 감지 → 만료 감지 로직 체이닝 실행 (TIMER-LOGIC.md 참조)
- `SCHEDULED` 상태: `remainingSeconds`는 `baseRemainingSeconds` (고정값)
- 쿼리 `since`(선택, ISO 8601): 직전에 본 `updatedAt`. 주면 `deltaSinceSeconds`에 `since` 뒤부터 지금 `updatedAt`까지 기록된 `ADD`·`SUBTRACT` 로그의 실제 변경량 합계(초, `after_seconds - before_seconds`라 차감은 음수, 0에서 멈춘 차감은 실제로 줄어든 만큼)를 준다. 그사이 추가·차감이 없으면(제목 수정, 예약 활성화·만료 기록 등) `null`, `since`가 없거나 잘못된 값이거나 지금 `updatedAt`보다 늦으면 필드를 넣지 않는다. 그사이 되돌린 기록(`reverted_at`이 구간 안)이 있어도 필드를 넣지 않는다. 되돌리기는 `ADD`·`SUBTRACT` 행을 새로 쓰지 않고 원래 행에 `reverted_at`만 채우므로 합계가 실제 변경과 어긋나기 때문이다(추가 후 바로 되돌리면 잔여는 그대로인데 합계는 양수, 되돌리기만 있으면 잔여가 바뀌었는데 합계는 없음). 오버레이가 변경량 연출('+1:00')에 쓰고, 필드가 없을 때만 폴링 시각으로 추정한다
- **에러**: `404`: 타이머 없음 또는 삭제됨

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
  - 본문은 JSON 객체여야 하고 최소 1개 필드 필수
  - `title`: 문자열, 공백 제거 후 1~100자 (앞뒤 공백을 제거해 저장)
  - `description`: 최대 500자 문자열 또는 `null`. 앞뒤 공백 제거 후 빈 문자열이면 null로 저장
- **에러**:
  - `400`: 본문이 객체가 아님, 변경할 필드 없음, 제목 형식·길이, 설명 길이, JSON 파싱 실패
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
  - `deltaSeconds`: 필수, 1~31,536,000 정수 (1년)
  - `actorName`: 필수, 1~50자 (시간 변경을 요청한 시청자 닉네임)
- **제한**:
  - `SCHEDULED` 상태의 타이머는 시간 변경 불가 (`400 BAD_REQUEST`)
  - 만료된 타이머(`EXPIRED`, 또는 아직 `RUNNING`으로 남아 있지만 잔여가 0초인 타이머)에 대한 `SUBTRACT`는 거절 (`400 BAD_REQUEST`, "만료된 타이머는 차감할 수 없습니다"). 아무것도 바꾸지 않으므로 로그도 남기지 않는다. `ADD`는 허용되며 `EXPIRED` 타이머는 재시작한다(`REOPEN` + `ADD`)
- **동작**: 요청 시 먼저 예약 활성화 감지를 실행한 후 시간 변경 수행. `SUBTRACT`로 잔여가 0이 되면 `EXPIRED`로 전이하고 `EXPIRE` 로그를 함께 남긴다
- **에러**:
  - `400`: JSON 파싱 실패, 유효성 검사 실패, 예약 상태, 만료 타이머 차감
  - `401`: 인증 없음
  - `403`: 프로젝트 소유자 아님
  - `404`: 타이머 없음 또는 삭제됨 (처리 중 다른 요청이 삭제한 경우 포함)
  - `409`: 동시 변경과 5번 연속 겹침. 다시 시도하면 된다
- **응답**: `200 OK` (`status`는 `RUNNING` 또는 `EXPIRED`, `updatedAt`은 변경 뒤 타이머의 `updatedAt`이다. 콘솔이 저장해 두고 다음 폴링과 비교해 자기 조작을 다른 기기의 변경으로 보지 않는다. `log`는 이번 요청의 `ADD`/`SUBTRACT` 로그다. 차감으로 0초가 돼 `EXPIRE`를 함께 남겨도 `log`는 `SUBTRACT`이며, 되돌리기는 이 `log.id`를 쓴다)
```json
{
  "data": {
    "id": "timer_id",
    "remainingSeconds": 7200,
    "status": "RUNNING",
    "updatedAt": "2025-01-01T00:00:00Z",
    "log": {
      "id": "log_id",
      "actionType": "ADD",
      "actorName": "시청자 닉네임",
      "actorUserId": "user_id",
      "deltaSeconds": 3600,
      "beforeSeconds": 3600,
      "afterSeconds": 7200,
      "createdAt": "2025-01-01T00:00:00Z",
      "revertedAt": null
    }
  }
}
```

### POST /api/timers/[id]/logs/[logId]/revert

시간 추가·차감 기록 하나를 되돌린다(로그 취소 처리). 반대 방향 `modify`가 아니다. 보정 행을 남기지 않고 그 기록에 `revertedAt`을 표시하며, 되돌린 기록은 통계·순위·그래프·목표 진행률에서 빠진다. 규칙은 [TIMER-LOGIC.md](TIMER-LOGIC.md) "되돌리기".

- **인증**: 필요 (프로젝트 소유자만)
- **요청 본문**: 없음
- **동작**: 예약 활성화·만료 감지를 먼저 실행한 뒤, 현재 잔여 시간에 그 기록이 실제로 바꾼 양(`beforeSeconds - afterSeconds`)만 반대로 적용한다. 사이에 다른 기기의 변경이 있어도 그 변경은 그대로 남는다. 0초가 되면 `EXPIRED`(+`EXPIRE` 로그), 만료 상태에서 0초보다 커지면 `RUNNING`(+`REOPEN` 로그). 이미 0초인 만료 타이머의 `ADD`를 되돌리면 잔여는 0 그대로이고 기록만 취소 처리된다
- **에러**:
  - `400`: 타이머 ID·`logId`가 32자 hex가 아님, `ADD`/`SUBTRACT`가 아닌 기록, 예약 상태
  - `401`: 인증 없음
  - `403`: 프로젝트 소유자 아님
  - `404`: 타이머 없음·삭제됨, 또는 이 타이머의 기록이 아님
  - `409`: 이미 되돌린 기록(`"이미 되돌린 기록입니다"`), 또는 동시 변경과 5번 연속 겹침
- **응답**: `200 OK`. `modify`와 같은 모양이고 `log`는 되돌린 기록이다(`revertedAt` 채워짐)
```json
{
  "data": {
    "id": "timer_id",
    "remainingSeconds": 3600,
    "status": "RUNNING",
    "updatedAt": "2025-01-01T00:00:05Z",
    "log": {
      "id": "log_id",
      "actionType": "ADD",
      "actorName": "시청자 닉네임",
      "actorUserId": "user_id",
      "deltaSeconds": 3600,
      "beforeSeconds": 3600,
      "afterSeconds": 7200,
      "createdAt": "2025-01-01T00:00:00Z",
      "revertedAt": "2025-01-01T00:00:05Z"
    }
  }
}
```

### POST /api/timers/[id]/activate

예약(`SCHEDULED`) 타이머를 예약 시각 전에 지금 시작한다. 방송을 일찍 켰을 때 OBS 오버레이 주소를 바꾸지 않고 같은 타이머로 시작하기 위한 것이다.

- **인증**: 필요 (프로젝트 소유자만)
- **요청 본문**: 없음
- **동작**:
  - 먼저 예약 활성화 감지를 실행한다. 예약 시각이 이미 지났으면 그 시각 기준으로 자동 활성화된다(`actor_name` = `'system'`). 지금 시각으로 다시 시작하지 않는다
  - 아직 예약 상태면 `status = RUNNING`, `last_calculated_at = scheduled_start_at = now`로 바꾸고 `ACTIVATE` 로그를 남긴다(`actor_name` = 소유자 닉네임, `actor_user_id` = 소유자, delta 0, before = after = 잔여). 상태 쓰기는 `STATE_GUARD` 조건이라 다른 요청이 먼저 시작·삭제했으면 쓰지 않는다
  - 이미 시작된 타이머(자동 활성화, 다른 탭에서 먼저 시작, `RUNNING`·`EXPIRED`)는 아무것도 쓰지 않고 현재 상태로 `200`을 준다. 요청의 목적(타이머가 돌고 있음)은 이미 이뤄졌고, 화면이 이 응답으로 곧바로 실행 중 상태로 바뀌게 하기 위해서다
- **에러**:
  - `400`: 타이머 ID가 32자 hex가 아님
  - `401`: 인증 없음
  - `403`: 프로젝트 소유자 아님
  - `404`: 타이머 없음 또는 삭제됨 (처리 중 다른 요청이 삭제한 경우 포함)
- **응답**: `200 OK`. 형태는 `POST /api/timers/[id]/modify`와 같다(`log`는 이번 `ACTIVATE` 로그, 이미 시작된 타이머면 그 타이머의 마지막 로그)
```json
{
  "data": {
    "id": "timer_id",
    "remainingSeconds": 3600,
    "status": "RUNNING",
    "log": {
      "id": "log_id",
      "actionType": "ACTIVATE",
      "actorName": "소유자 닉네임",
      "actorUserId": "user_id",
      "deltaSeconds": 0,
      "beforeSeconds": 3600,
      "afterSeconds": 3600,
      "createdAt": "2026-10-04T10:00:00Z"
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
  - `donorLimit` (number, 기본값 10, 1~50으로 보정): 상위 후원자 수
- **에러** (판별 순서대로. 401은 미들웨어가 라우트보다 먼저 내므로 로그아웃 상태에서는 없는 id여도 404가 아니라 401이다):

| 상태 | 코드 | 상황 | 통계 화면(`/timers/[id]/stats`) |
|------|------|------|------|
| 401 | `UNAUTHORIZED` | 로그아웃 상태 | '로그인이 필요합니다' + 돌아갈 링크 1개, 탭 제목 '통계를 볼 수 없음' |
| 401 | `SESSION_EXPIRED` | 세션 만료 | 같은 안내 + 세션 만료 흐름(`fireSessionExpired`, 로그인 화면으로 이동) |
| 403 | `FORBIDDEN` | 소유자 아님 | '통계를 볼 수 없습니다'(소유자만) + 프로젝트 링크, 탭 제목 '통계를 볼 수 없음' |
| 404 | `NOT_FOUND` | 타이머 없음 | '타이머를 찾을 수 없습니다' + 목록 링크, 탭 제목 '찾을 수 없음' |
| 그 밖 | — | 서버 오류 등 | h1 '통계'·돌아갈 링크는 남기고 본문만 '다시 시도' 오류 |

- **시간대 기준**: `hourlyDistribution[].hour`, `summary.peakHour`, `dailyActivity[].date`는 **KST(UTC+9)** 기준이다. `created_at`은 UTC로 저장되므로 SQL에서 `strftime('%H', created_at, '+9 hours')`, `DATE(created_at, '+9 hours')`로 옮겨 묶는다. 한국 전용 서비스라 시간대 파라미터는 받지 않는다.
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
- 집계 대상은 되돌리지 않은(`reverted_at IS NULL`) `ADD`·`SUBTRACT` 로그다. `uniqueDonors`와 `topDonors`는 `ADD`의 `actorName` 기준, `peakHour`는 이벤트가 없으면 `null`

---

## 로그/그래프 API

### GET /api/timers/[id]/logs

타이머의 변경 로그를 조회한다.

- **인증**: 불필요
- **쿼리 파라미터**:
  - `page` (number, 기본값 1): 페이지 번호
  - `limit` (number, 기본값 20, 최대 250): 페이지당 항목 수
  - `actionType` (string, 선택): 필터링할 액션 타입 (쉼표 구분). 허용: `CREATE`, `ADD`, `SUBTRACT`, `EXPIRE`, `REOPEN`, `ACTIVATE`, `DELETE`
- 정렬: `created_at DESC`. `limit`은 1~250으로 보정, `totalPages`는 `ceil(total / limit)`
- 되돌린 기록도 목록에 남는다. `revertedAt`이 채워져 있으면 되돌린 기록이다(`null`이면 유효)
- **에러**:
  - `400`: 허용되지 않은 `actionType`
  - `404`: 타이머 없음 또는 삭제됨
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
        "createdAt": "2025-01-01T00:00:00Z",
        "revertedAt": null
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
- **에러**:
  - `400`: `mode` 누락 또는 유효하지 않음
  - `404`: 타이머 없음 또는 삭제됨
- `remaining`은 모든 로그의 `afterSeconds`, `cumulative`·`frequency`는 `ADD`·`SUBTRACT` 로그만 사용한다. 세 모드 모두 되돌린 기록은 뺀다(`remaining`에서 그 기록과 되돌리기 사이의 다른 기록은 당시 실제 잔여를 그대로 그린다). `frequency`의 `hour`는 UTC 시간 단위 버킷
- 응답 크기 상한(비인증 공개 엔드포인트라 로그 수에 비례해 커지지 않게 한다):
  - `remaining`·`cumulative`: 로그가 1000건을 넘으면 `ceil(전체/1000)`건마다 하나씩 균등 추출한다. 마지막 점은 항상 포함한다. `cumulative`의 누적합은 추출 전 전체 로그로 SQL 창 함수에서 계산한다
  - `frequency`: 최근 1000개 시간 버킷만 반환한다 (오름차순)
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
    "position": "center",
    "animation": true
  }
}
```
- 설정 미저장 시 모든 필드 기본값으로 반환
- `position`: `"center"` | `"top-left"` | `"top-right"` | `"bottom-left"` | `"bottom-right"`
- `animation`: 오버레이 애니메이션 사용 여부. 시간 추가/차감 효과(flash, 변경량 표시)와 긴급·만료 펄스(깜빡임)를 함께 켜고 끈다. 끄면 긴급 상태는 색 변화로만 표시된다. 기본 `true`
- **에러**:
  - `404`: 타이머 없음 또는 삭제됨

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
  "position": "top-left",
  "animation": false
}
```
- **유효성 검사**:
  - `fontSize`: 24~200 정수
  - `position`: 유효한 값만 허용
  - 본문은 JSON 객체여야 한다
  - `color`: `#rrggbb`
  - `bg`: `transparent` 또는 `#rrggbb` (자유 문자열은 오버레이의 CSS로 흘러가 인젝션 경로가 되므로 받지 않는다)
  - `showTitle`·`shadow`·`animation`: boolean
- 생략한 필드는 기존 저장값이 아니라 기본값으로 저장된다 (전체 덮어쓰기 upsert)
- **에러**:
  - `400`: JSON 파싱 실패, 본문이 객체가 아님, fontSize 범위 초과, 유효하지 않은 position, 색 형식, boolean이 아닌 플래그
  - `401`: 인증 없음
  - `403`: 소유자 아님
  - `404`: 타이머 없음
- **응답**: `200 OK` (저장된 설정 전체 반환)

---

## 목표(Goals) API

### GET /api/projects/[id]/goals

프로젝트의 목표 목록을 조회한다.

- **인증**: 불필요
- **동작**: 조회 시 ACTIVE 목표의 달성·실패 여부를 자동 감지하여 COMPLETED 또는 FAILED로 전이 (`src/lib/goal.ts`의 `computeProgress`). 전이 UPDATE는 `status = 'ACTIVE'`일 때만 적용해 동시에 들어온 취소를 덮어쓰지 않는다. 타이머 상태·소비 시간은 요청당 한 번만 읽어 모든 목표에 쓴다 (`loadProgressSnapshot`)
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
- `type=DURATION`의 progress: `{ percentage, currentSeconds, remainingToTarget }` (`percentage` 최대 999). `COMPLETED`이면 달성 뒤 늘어난 소비 시간과 무관하게 `percentage=100`, `currentSeconds=targetSeconds`, `remainingToTarget=0`
- `type=DEADLINE`의 progress: `{ percentage, timerSurvivesDeadline, deadlineIn, deadlineAfterTimerEnd }` (`percentage` 최대 100, `COMPLETED`이면 100). `deadlineAfterTimerEnd`: 지금 잔여대로면 타이머가 마감 전에 끝나는지(RUNNING은 지금+잔여, SCHEDULED는 시작 예정+잔여를 종료 예정으로 본다. 타이머가 없거나 만료면 false)
- `status`: `ACTIVE` | `COMPLETED` | `FAILED` | `CANCELLED`
- 정렬: `created_at DESC`
- CANCELLED 상태의 목표도 포함해 반환한다
- 최대 50개. ACTIVE 목표를 먼저 뽑고 나머지를 최신순으로 채운 뒤 생성일 역순으로 정렬한다 (ACTIVE는 최대 20개라 항상 포함된다)
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
  - `title`: 필수, 공백 제거 후 1자 이상, 최대 100자 (앞뒤 공백을 제거해 저장)
  - `targetSeconds`: DURATION일 때 필수, 1~8,760,000 정수 (약 100일)
  - `targetDatetime`: DEADLINE일 때 필수, 64자 이하의 미래 시각. ISO 8601 UTC(`toISOString()`)로 정규화해 저장·응답한다
  - 진행 중(ACTIVE) 목표는 프로젝트당 20개까지. 상한에 걸리면 기존 ACTIVE 목표의 달성·실패 전이를 먼저 반영하고 다시 센다
- **에러**:
  - `400`: 파싱 실패, 제목 길이, 유효하지 않은 타입, 범위 초과, 과거 날짜, 진행 중 목표 상한 초과
  - `401`: 인증 없음
  - `403`: 소유자 아님
  - `404`: 프로젝트 없음 또는 삭제됨
- **응답**: `201 Created` (생성한 목표를 `GET` 목록 항목과 같은 형태로 반환, `progress` 포함)

### PATCH /api/projects/[id]/goals/[goalId]

목표를 취소한다 (ACTIVE → CANCELLED).

- **인증**: 필요 (프로젝트 소유자만)
- **요청 본문**: 없음
- **에러**:
  - `400`: ACTIVE가 아닌 목표 취소 시도
  - `401`: 인증 없음
  - `403`: 소유자 아님
  - `404`: 프로젝트 없음, 목표 없음
- **응답**: `200 OK` (취소된 목표 정보 반환, status=CANCELLED, `completedAt`에 취소 시각)

### DELETE /api/projects/[id]/goals/[goalId]

실패·취소로 끝난 목표(`FAILED`·`CANCELLED`)의 행을 실제로 지운다. 종료 탭 목표 카드(`GoalCard`)의 더보기 '삭제'가 호출한다. 진행 중인 목표는 먼저 취소(PATCH)하고, 달성한 목표(`COMPLETED`)는 기록으로 남기므로 지울 수 없다.

- **인증**: 필요 (프로젝트 소유자만)
- **요청 본문**: 없음
- **동작**: `DELETE ... WHERE status IN ('FAILED','CANCELLED')`로 지워, 조회와 삭제 사이에 상태가 바뀐 경우에는 지우지 않는다. 다른 테이블이 목표를 참조하지 않으므로 마이그레이션 없이 행 삭제가 가능하다
- **에러**:
  - `409 CONFLICT`: `ACTIVE`(먼저 취소) 또는 `COMPLETED`(달성 기록 보호)인 목표
  - `401`: 인증 없음
  - `403`: 소유자 아님
  - `404`: 프로젝트 없음, 목표 없음(이미 지워진 목표 포함)
- **응답**: `200 OK`
```json
{
  "data": {
    "id": "goal_id"
  }
}
```

---

## 운영 API

### GET /api/health

서비스가 살아 있고 원격 D1 스키마가 코드와 맞는지 확인한다. 외부 프로브(`.github/workflows/health.yml`)가 매시 부르고, 배포 후 `obs.mjs verify --expect-event health.check`의 "이 버전이 요청을 받았다"는 근거가 된다 (OBSERVABILITY.md `health.check`).

- **인증**: 불필요 (`PROTECTED_ROUTES`에 넣지 않는다. 미들웨어는 거치므로 `x-request-id`가 붙고, 환경변수 검증이 실패하면 `500`)
- **동작**: D1 조회 한 번(`SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1`). 원격의 마지막 적용 마이그레이션을 코드 상수 `EXPECTED_LATEST_MIGRATION`(`src/lib/health.ts`)과 비교한다
  - 같거나 원격이 더 새것(번호가 큼): 정상(200). 원격 마이그레이션을 먼저 적용하고 코드를 배포하는 사이에는 원격이 앞선다. 앞선 경우는 운영 로그에 `health.schema_ahead`(warn)를 따로 남긴다
  - 원격이 뒤처짐, 번호는 같은데 이름이 다름, 적용 기록 없음: 스키마 드리프트
- **응답 헤더**: `Cache-Control: no-store` (200·503)
- **응답**: `200 OK`
```json
{ "data": { "ok": true } }
```
- **에러**:
  - `503 SERVICE_UNAVAILABLE`: 스키마 드리프트. 본문은 code·message뿐이고, 마이그레이션 이름은 운영 로그(`health.schema_drift`)에만 남긴다
  - `500 INTERNAL_ERROR`: D1 조회 예외 (`withErrorHandler`, `api.unhandled`)
- 공개 경로라 응답에 내부 정보를 넣지 않고 조회를 1회로 묶는다. rate limit은 없다. 요청 한도 소모 공격은 다른 공개 경로와 같은 수준이고, rate limit은 보안 감사 후속 항목으로 따로 다룬다
