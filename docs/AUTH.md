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
     │  Set-Cookie: token=JWT│                        │
     │  302 Redirect → /     │                        │
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

- `state` 파라미터를 생성하여 쿠키에 저장 (CSRF 방지)

### 2단계: 콜백 처리 (`/api/auth/callback`)

1. `state` 검증 (쿠키와 비교)
2. Authorization code로 access token 교환
3. Access token으로 CHZZK 사용자 정보 조회
4. DB에서 사용자 조회 또는 생성 (upsert)
5. JWT 생성 및 httpOnly 쿠키 설정
6. 메인 페이지로 리다이렉트

### 3단계: 토큰 교환

```
POST https://chzzk.naver.com/auth/v1/token
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
| 쿠키 이름 | `session` |
| httpOnly | `true` |
| secure | `true` (production) |
| sameSite | `lax` |
| path | `/` |

### Refresh Token Rotation

Access token 만료 시 자동 갱신을 위한 refresh token rotation 방식을 사용한다.

#### Refresh Token 설정

| 항목 | 값 |
|------|-----|
| 형식 | Opaque random string (UUID) |
| 저장 | SHA-256 해시를 DB `refresh_tokens` 테이블에 저장 |
| 만료 시간 | 30일 |
| 쿠키 이름 | `refresh` |
| httpOnly | `true` |
| secure | `true` (production) |
| sameSite | `lax` |
| path | `/` |

#### Rotation 동작

1. 로그인 시 access token(15분) + refresh token(30일) 쌍을 발급하며, 같은 `family_id`로 체이닝
2. Access token 만료 시 미들웨어가 refresh token으로 자동 갱신 (투명 갱신)
3. 갱신 시 이전 refresh token은 `USED` 처리, 새 토큰 발급 (같은 `family_id`)
4. 이미 `USED`/`REVOKED`된 토큰 제시 시 해당 family 전체 폐기 (토큰 탈취 대응)
5. 로그아웃 시 해당 family 전체 `REVOKED` 처리

#### Reuse Detection

토큰 탈취 시나리오 대응:
- 공격자가 탈취한 refresh token을 사용하면, 정상 사용자의 다음 갱신 시 이미 `USED` 상태의 토큰이 감지됨
- 감지 즉시 해당 family의 모든 토큰을 `REVOKED` 처리
- 공격자와 정상 사용자 모두 재로그인 필요

#### DB 스키마 (`refresh_tokens`)

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
```

#### 투명 갱신 흐름 (미들웨어)

```
보호 라우트 요청 → access token 검증
├─ 유효 → 기존 로직 (헤더 주입)
└─ 만료/없음 → refresh 쿠키 확인
   ├─ 없음 → 401
   └─ 있음 → rotateRefreshToken()
      ├─ 성공 → 새 access/refresh 쿠키 설정 + 헤더 주입 + 요청 통과
      └─ 실패 → 401 + 두 쿠키 삭제
```

`/api/auth/me`는 PROTECTED_ROUTES에 없어 미들웨어 갱신을 타지 않으므로, 라우트 내부에서 직접 refresh 로직을 수행한다.

## 환경변수

```
CHZZK_CLIENT_ID=       # CHZZK OAuth 클라이언트 ID
CHZZK_CLIENT_SECRET=   # CHZZK OAuth 클라이언트 시크릿
JWT_SECRET=            # JWT 서명 비밀 키
BASE_URL=              # 서비스 베이스 URL (e.g., https://timer.example.com)
```

## Next.js Proxy

### 보호 대상 라우트

인증이 필요한 API 엔드포인트:

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/projects` | 프로젝트 생성 |
| POST | `/api/projects/[id]/timers` | 타이머 생성 |
| POST | `/api/timers/[id]/modify` | 시간 증감 |
| POST | `/api/auth/logout` | 로그아웃 |

### 프록시 동작

```typescript
// proxy.ts
export function proxy(request: NextRequest) {
  // 1. 보호 대상 라우트인지 확인
  // 2. session 쿠키에서 JWT 추출
  // 3. JWT 검증 (서명 + 만료)
  // 4. 유효하면 요청 헤더에 사용자 정보 주입
  // 5. 무효하면 401 응답
}
```

### 인증 헬퍼 (`lib/auth.ts`)

```typescript
// JWT 생성
function signJwt(payload: JwtPayload): string

// JWT 검증
function verifyJwt(token: string): JwtPayload | null

// 요청에서 현재 사용자 추출
function getCurrentUser(request: NextRequest): JwtPayload | null
```

## 로그아웃 (`/api/auth/logout`)

```
POST /api/auth/logout

→ Set-Cookie: session=; Max-Age=0; Path=/
→ Set-Cookie: refresh=; Max-Age=0; Path=/
→ 200 OK
```

1. Refresh token의 family를 전체 `REVOKED` 처리
2. `session` + `refresh` 두 쿠키를 삭제
3. Access token이 만료된 상태에서도 refresh 쿠키가 있으면 로그아웃 가능
