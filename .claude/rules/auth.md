---
paths:
  - src/lib/auth.ts
  - src/lib/chzzk.ts
  - src/lib/auth-fetch.ts
  - src/lib/session-expired.ts
  - src/app/api/auth/**
  - src/middleware.ts
---

# 인증

설계: `docs/AUTH.md`. 문서가 코드보다 오래됐을 수 있으니 실제 동작은 `src/lib/auth.ts`와 `src/middleware.ts`에서 확인한다.

## 현재 구조

- CHZZK OAuth Authorization Code Flow. `state`를 `oauth_state` 쿠키(10분)에 저장했다가 콜백에서 대조해 CSRF를 막는다. 토큰 교환·사용자 조회는 `openapi.chzzk.naver.com`(`src/lib/chzzk.ts`).
- Access token: HS256 JWT, `session` 쿠키, 15분 (`ACCESS_TOKEN_MAX_AGE`). 페이로드 `{ userId, chzzkUserId, nickname }`.
- Refresh token: 랜덤 토큰을 해시해 `refresh_tokens` 테이블에 저장, `refresh` 쿠키, 30일. 사용 시 rotation(`ACTIVE` → `USED`, 새 토큰 발급), 같은 `family_id`로 묶인다. 새 토큰 만료는 `min(30일, family_expires_at)`이라 로그인 후 90일을 넘기지 않는다.
- 동시 요청 race 대응: `USED` 토큰이라도 그 토큰 자신의 `used_at`이 30초(`RACE_GRACE_MS`) 이내면 허용하고, 새 refresh 없이 access token만 다시 발급한다. 그 밖의 `USED`/`REVOKED` 재사용은 탈취로 보고 family 전체를 `REVOKED` 처리한다.
- 미들웨어(`matcher: /api/:path*`)는 모든 요청에서 `x-user-*` 헤더를 지우고 `x-request-id`를 넣는다. `PROTECTED_ROUTES`(메서드+경로)에 해당하면 JWT를 검증해 `x-user-id`, `x-user-chzzk-id`, `x-user-nickname`(URI 인코딩)을 주입하고, access 만료 시 refresh로 자동 갱신해 새 쿠키를 응답에 싣는다. 갱신 실패는 401이며 쿠키는 지우지 않는다. 라우트가 `x-user-id`를 읽는다면 그 메서드·경로가 `PROTECTED_ROUTES`에 있어야 한다.
- 클라이언트는 `authFetch()`로 호출하고, 401이면 세션 만료 UX(로그인 리다이렉트)로 넘어간다. 이때 현재 경로를 `/login?next=`로 실어 보내고, `next`는 `oauth_next` 쿠키로 OAuth 왕복을 거쳐 콜백에서 리다이렉트 대상이 된다.

## 지켜야 할 것

- 쿠키: `HttpOnly`, `SameSite=Lax`, `Path=/`, `NODE_ENV`가 `development`가 아닐 때 `Secure`(현재 `oauth_state`만 `Secure`를 지정하지 않는다). 로그아웃은 두 쿠키 모두 `Max-Age=0` + refresh family revoke.
- 로그인 후 리다이렉트 경로(`next`)는 반드시 `sanitizeNextPath()`(`src/lib/safe-redirect.ts`)를 거친다. 로그인 라우트에서 저장할 때와 콜백에서 쿠키를 읽을 때 모두 검증한다(오픈 리다이렉트 방지). 규칙을 바꾸면 `src/lib/__tests__/safe-redirect.test.ts`의 거부 목록을 함께 갱신한다.
- `verifyJwt` 등 검증 함수는 실패 시 `null`을 반환하고 원인을 밖으로 내보내지 않는다.
- 시크릿(`JWT_SECRET`, `CHZZK_CLIENT_SECRET`)은 `wrangler secret`/`.env`로만 관리. `NEXT_PUBLIC_`에 두지 않는다.
- 인증 흐름을 바꾸면 `src/__tests__/proxy.test.ts`, `src/__tests__/integration/auth-flow.test.ts`를 함께 갱신한다.
