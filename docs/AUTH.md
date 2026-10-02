# 인증 설계

## 개요

CHZZK OAuth를 통해 사용자 인증을 수행하고, JWT를 httpOnly 쿠키에 저장하여 세션을 관리한다.

## CHZZK OAuth 플로우

### Authorization Code Flow

```
┌─────────┐          ┌─────────────┐          ┌──────────────┐
│  브라우저  │          │  Next.js API │          │  CHZZK OAuth │
└────┬────┘          └──────┬──────┘          └──────┬───────┘
     │  GET /api/auth/login  │                        │
     │──────────────────────→│                        │
     │  302 Redirect         │                        │
     │←──────────────────────│                        │
     │                       │                        │
     │  chzzk.naver.com/account-interlock             │
     │───────────────────────────────────────────────→│
     │  사용자 동의                                     │
     │←───────────────────────────────────────────────│
     │                       │                        │
     │  GET /api/auth/callback?code=xxx               │
     │──────────────────────→│                        │
     │                       │  토큰 교환 (code → token)│
     │                       │───────────────────────→│
     │                       │  access_token           │
     │                       │←───────────────────────│
     │                       │  사용자 정보 조회         │
     │                       │───────────────────────→│
     │                       │  user info              │
     │                       │←───────────────────────│
     │                       │                        │
     │  Set-Cookie: session, refresh                  │
     │  302 Redirect → / 또는 next                     │
     │←──────────────────────│                        │
```

### 1단계: 로그인 시작 (`/api/auth/login`)

```
GET /api/auth/login

→ 302 Redirect
  Location: https://chzzk.naver.com/account-interlock
    ?clientId={CHZZK_CLIENT_ID}
    &redirectUri={BASE_URL}/api/auth/callback
    &state={random_state}
```

- `state` 파라미터(`crypto.randomUUID()`)를 생성하여 `oauth_state` 쿠키(httpOnly, SameSite=Lax, 10분, `Secure` 미지정)에 저장 (CSRF 방지)
- 선택 쿼리 `next`: 로그인 후 돌아갈 경로. `sanitizeNextPath()`(`src/lib/safe-redirect.ts`)를 통과하면 `oauth_next` 쿠키(httpOnly, SameSite=Lax, `NODE_ENV`가 `development`가 아닐 때 Secure, 10분)에 저장하고, 없거나 허용되지 않으면 이전 시도의 `oauth_next`를 지운다

#### `next` 검증 규칙 (오픈 리다이렉트 방지)

같은 출처의 상대 경로만 허용한다. 아래 중 하나라도 해당하면 버리고 `/`로 보낸다.

- `/`로 시작하지 않거나 `//`로 시작한다 (`https://evil.com`, `javascript:...`, `//evil.com`)
- 역슬래시·공백·제어 문자가 어디든 들어 있다. 브라우저는 `\`를 `/`로 바꾸고 URL 파서는 탭·개행을 지우므로 `/\evil.com`, `/<탭>/evil.com`이 `//evil.com`이 된다
- 512자를 넘는다
- 파싱한 결과의 출처가 바뀐다
- `/login`이나 `/api/`로 시작한다 (로그인 루프, 의도치 않은 API 호출)

쿼리 값은 한 번 디코딩된 뒤 검사하므로 `?next=%2F%2Fevil.com`은 `//evil.com`으로 거부된다. 콜백은 쿠키 값을 다시 검증하고, `new URL(next, BASE_URL)`의 출처가 `BASE_URL`과 같을 때만 리다이렉트한다.

#### 세션 만료 후 재로그인

refresh까지 실패해 `authFetch()`가 세션 만료를 알리면 `SessionExpiredHandler`가 현재 경로를 실어 `/login?next=<경로>`로 보낸다. 로그인 화면은 같은 규칙으로 검증한 `next`를 `/api/auth/login?next=`로 넘긴다. 비로그인 상태에서 헤더의 '로그인'을 누르면 같은 방식으로 누른 시점의 현재 경로를 실어 `/login?next=<경로>`로 보낸다(헤더는 레이아웃에 있어 다시 렌더되지 않으므로 클릭 시점에 계산한다). 경로가 허용되지 않거나 수정자 키를 누른 클릭이면 그냥 `/login`으로 간다.

### 2단계: 콜백 처리 (`/api/auth/callback`)

1. `state` 검증 (`oauth_state` 쿠키와 비교). `code`·`state`가 없거나 다르면 `/login?error=auth_failed`로 리다이렉트
2. Authorization code로 access token 교환
3. Access token으로 CHZZK 사용자 정보 조회
4. DB에서 사용자 조회 또는 생성 (upsert)
5. Access JWT 생성, 새 `family_id`로 refresh token 발급·DB 저장, `session`·`refresh` 쿠키 설정, `oauth_state` 삭제
6. `oauth_next` 쿠키의 경로로 리다이렉트(다시 검증, 없거나 허용되지 않으면 메인 페이지 `/`). 성공·실패 모두 `oauth_next`를 지운다

토큰 교환·사용자 조회 등에서 예외가 나면 `/login?error=auth_failed`로 보낸다. 로그인 화면은 `error` 쿼리가 있으면 실패 메시지를 보여 준다. `src/app/(auth)/callback/page.tsx`는 실제 콜백을 처리하지 않고 `/`로 보내기만 한다(실제 콜백은 `/api/auth/callback`).

### 3단계: 토큰 교환

```
POST https://openapi.chzzk.naver.com/auth/v1/token
Content-Type: application/json

{
  "grantType": "authorization_code",
  "clientId": "{CHZZK_CLIENT_ID}",
  "clientSecret": "{CHZZK_CLIENT_SECRET}",
  "code": "{authorization_code}",
  "state": "{state}"
}

→ { "accessToken": "...", "refreshToken": "...", "expiresIn": 3600 }
```

응답이 `{ content: { ... } }`로 감싸져 오면 `content`를 꺼내 쓴다. 이어서 `GET https://openapi.chzzk.naver.com/open/v1/users/me`(`Authorization: Bearer {accessToken}`)로 사용자 정보를 조회하며, `id`/`nickname`이 없으면 `channelId`/`channelName`을 쓴다. 두 호출 모두 10초 타임아웃이다. CHZZK의 access/refresh token은 사용자 조회에만 쓰고 저장하지 않는다.

## JWT 세션 관리

### JWT 페이로드

```json
{
  "userId": "사용자 DB ID",
  "chzzkUserId": "CHZZK 사용자 ID",
  "nickname": "닉네임",
  "iat": 1234567890,
  "exp": 1234567890
}
```

### JWT 설정 (Access Token)

| 항목 | 값 |
|------|-----|
| 알고리즘 | HS256 |
| 서명 키 | 환경변수 `JWT_SECRET` |
| 만료 시간 | 15분 |
| 쿠키 이름 | `session` (`Max-Age` 900초) |
| httpOnly | `true` |
| secure | `true` (`NODE_ENV`가 `development`가 아닐 때) |
| sameSite | `lax` |
| path | `/` |

### Refresh Token Rotation

Access token 만료 시 자동 갱신을 위한 refresh token rotation 방식을 사용한다.

#### Refresh Token 설정

| 항목 | 값 |
|------|-----|
| 형식 | Opaque random string (`crypto.randomUUID()`) |
| 저장 | SHA-256 해시를 DB `refresh_tokens` 테이블에 저장 |
| 만료 시간 | 30일 |
| 쿠키 이름 | `refresh` (`Max-Age` 30일) |
| httpOnly | `true` |
| secure | `true` (`NODE_ENV`가 `development`가 아닐 때) |
| sameSite | `lax` |
| path | `/` |

#### Rotation 동작

1. 로그인 시 access token(15분) + refresh token(30일) 쌍을 발급하며, 로그인마다 새 `family_id`를 만들고 이후 rotation은 같은 `family_id`로 체이닝
2. Access token 만료 시 미들웨어가 refresh token으로 자동 갱신 (투명 갱신)
3. 갱신 시 이전 refresh token은 `UPDATE ... WHERE status = 'ACTIVE'`로 `USED` 처리(`used_at` 기록)하고 새 토큰 발급 (같은 `family_id`). DB에 없는 토큰이나 만료된 `ACTIVE` 토큰은 상태를 바꾸지 않고 실패한다
4. 이미 `USED`/`REVOKED`된 토큰 제시 시 해당 family 전체 폐기 (토큰 탈취 대응). 단 아래 동시 요청 grace에 해당하는 `USED` 토큰은 예외
5. 로그아웃 시 해당 family 전체 `REVOKED` 처리

#### 동시 요청 grace (`RACE_GRACE_MS` = 30초)

access token이 만료된 상태에서 여러 요청이 같은 refresh token으로 동시에 들어오면, 먼저 처리된 요청이 토큰을 `USED`로 바꾼다. 이후 요청이 `USED` 토큰을 제시하거나 `USED` 처리 경합에서 지면(`changes = 0`), 같은 family에 최근 30초 안에 생성된 `ACTIVE` 토큰이 있는지 본다.

- 있으면 정상 동시 요청으로 보고 사용자 정보만 돌려준다. 미들웨어는 새 access token만 설정하고 refresh 쿠키는 바꾸지 않는다(`newRawToken: null`)
- 없으면 재사용(탈취)으로 보고 family 전체를 `REVOKED` 처리한다

#### Reuse Detection

토큰 탈취 시나리오 대응:
- 공격자가 탈취한 refresh token을 사용하면, 정상 사용자의 다음 갱신 시 이미 `USED` 상태의 토큰이 감지됨
- 감지 즉시 해당 family의 `ACTIVE`/`USED` 토큰을 모두 `REVOKED` 처리 (`revokeRefreshTokenFamily`)
- 공격자와 정상 사용자 모두 재로그인 필요

#### DB 스키마 (`refresh_tokens`, `migrations/0007_refresh_tokens.sql`)

```sql
CREATE TABLE refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL,
  family_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'USED', 'REVOKED')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at TEXT
);

CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens(family_id);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
```

#### 투명 갱신 흐름 (미들웨어)

```
보호 라우트 요청 → access token 검증
├─ 유효 → 기존 로직 (헤더 주입)
└─ 만료/없음 → refresh 쿠키 확인
   ├─ 없음 → 401
   └─ 있음 → rotateRefreshToken()
      ├─ 성공 → 새 access 쿠키 설정 (+ grace가 아니면 새 refresh 쿠키) + 헤더 주입 + 요청 통과
      └─ 실패/예외 → 401 (쿠키는 지우지 않는다)
```

`GET /api/auth/me`도 보호 라우트라 같은 갱신을 거치고, 라우트는 주입된 `x-user-id`로 사용자를 조회한다(헤더가 없으면 401, 사용자가 없으면 404).

## 환경변수

```
CHZZK_CLIENT_ID=       # CHZZK OAuth 클라이언트 ID
CHZZK_CLIENT_SECRET=   # CHZZK OAuth 클라이언트 시크릿
JWT_SECRET=            # JWT 서명 비밀 키
BASE_URL=              # 서비스 베이스 URL (e.g., https://timer.example.com)
```

## 미들웨어 (`src/middleware.ts`)

Next 16 관례상 `proxy.ts`가 표준이지만 이 프로젝트는 `middleware.ts`를 쓴다. `matcher: ["/api/:path*"]`로 모든 API 요청을 가로챈다.

### 보호 대상 라우트

인증이 필요한 API 엔드포인트 (`PROTECTED_ROUTES`, 메서드와 경로가 모두 맞아야 한다):

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/projects` | 프로젝트 생성 |
| GET | `/api/projects/mine` | 내 프로젝트 목록 |
| GET | `/api/projects/others` | 다른 사용자 프로젝트 목록 |
| PATCH / DELETE | `/api/projects/[id]` | 프로젝트 수정 / 삭제 |
| GET | `/api/projects/[id]/stats` | (해당 라우트 없음) |
| POST | `/api/projects/[id]/timers` | 타이머 생성 |
| POST | `/api/projects/[id]/goals` | 목표 생성 |
| PATCH | `/api/projects/[id]/goals/[goalId]` | 목표 수정 |
| PATCH / DELETE | `/api/timers/[id]` | 타이머 수정 / 삭제 |
| POST | `/api/timers/[id]/modify` | 시간 증감 |
| PUT | `/api/timers/[id]/overlay-settings` | 오버레이 설정 저장 |
| GET | `/api/timers/[id]/stats` | 타이머 통계 |
| GET | `/api/auth/me` | 현재 사용자 |
| POST | `/api/auth/logout` | 로그아웃 |

목록에 없는 요청(예: `GET /api/timers/[id]`, `DELETE /api/projects/[id]/goals/[goalId]`)은 인증 없이 통과하며 `x-user-*` 헤더도 주입되지 않는다.

### 미들웨어 동작

1. `validateEnv()`로 필수 환경변수(`JWT_SECRET`, `CHZZK_CLIENT_ID`, `CHZZK_CLIENT_SECRET`, `BASE_URL`)를 확인한다 (최초 1회)
2. 모든 요청에서 내부 헤더 `x-user-id`, `x-user-chzzk-id`, `x-user-nickname`를 지워 외부 위조를 막고, 요청 추적용 `x-request-id`(UUID)를 넣는다
3. 보호 대상이 아니면 그대로 통과
4. `session` 쿠키의 JWT를 검증해 유효하면 `x-user-id`(userId), `x-user-chzzk-id`(chzzkUserId), `x-user-nickname`(`encodeURIComponent`한 nickname)을 주입하고 통과
5. 무효하면 위 투명 갱신 흐름을 탄다. 실패 시 `{ "error": { "code": "UNAUTHORIZED", ... } }` 401

### 인증 헬퍼 (`lib/auth.ts`)

```typescript
// JWT 생성 (HS256, iat + 15분 exp)
async function signJwt(payload: Omit<JwtPayload, "iat" | "exp">): Promise<string>

// JWT 검증 (실패 시 null)
async function verifyJwt(token: string): Promise<JwtPayload | null>

// session 쿠키에서 현재 사용자 추출
async function getCurrentUser(request: NextRequest): Promise<JwtPayload | null>

// refresh token rotation (실패 시 null)
async function rotateRefreshToken(db: D1Database, rawToken: string): Promise<RotateResult | null>
```

그 밖에 `createSessionCookie`/`deleteSessionCookie`, `createRefreshCookie`/`deleteRefreshCookie`, `generateRefreshToken`, `hashToken`, `createRefreshTokenInDB`, `revokeRefreshTokenFamily`를 내보낸다.

## 로그아웃 (`/api/auth/logout`)

```
POST /api/auth/logout

→ Set-Cookie: session=; Max-Age=0; Path=/
→ Set-Cookie: refresh=; Max-Age=0; Path=/
→ 200 OK
```

1. Refresh token의 family를 전체 `REVOKED` 처리 (폐기에 실패해도 로그아웃은 진행)
2. `session` + `refresh` 두 쿠키를 삭제 (`HttpOnly; SameSite=Lax; Path=/; Max-Age=0`, development 외 `Secure`). 응답 본문은 `{ "data": null }`
3. 보호 라우트라 미들웨어를 먼저 거친다. Access token이 유효하면 그대로 라우트가 실행된다. Access token이 만료됐거나 없을 때는 refresh 쿠키가 유효하면 미들웨어가 갱신한 뒤 라우트가 원래 refresh 쿠키의 family를 폐기하고, refresh 쿠키가 없거나 무효하면 미들웨어에서 401로 끝나 쿠키가 지워지지 않는다

클라이언트(`Header`)는 결과와 무관하게 `/login`으로 이동한다.

## 세션 만료 클라이언트 처리

- `authFetch()`(`src/lib/auth-fetch.ts`)는 `fetch`를 감싸 401이면 `fireSessionExpired()`를 호출한다
- `fireSessionExpired()`(`src/lib/session-expired.ts`)는 페이지 수명 동안 한 번만 `window`에 `session-expired` 이벤트를 보낸다
- `SessionExpiredHandler`(`src/components/providers/`)가 이벤트를 받아 토스트("세션이 만료되었습니다. 다시 로그인해주세요.")를 띄우고 1.5초 뒤 `loginUrlWithNext(현재 경로 + 쿼리)`로 이동한다
- `/api/auth/me` 조회(헤더, 프로젝트·타이머 페이지)는 `authFetch`가 아닌 `fetch`를 써서 비로그인 401이 세션 만료로 처리되지 않는다
