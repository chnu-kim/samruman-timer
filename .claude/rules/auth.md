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

- CHZZK OAuth Authorization Code Flow. `state`를 쿠키에 저장했다가 콜백에서 대조해 CSRF를 막는다.
- Access token: HS256 JWT, `session` 쿠키, 15분 (`ACCESS_TOKEN_MAX_AGE`). 페이로드 `{ userId, chzzkUserId, nickname }`.
- Refresh token: 랜덤 토큰을 해시해 `refresh_tokens` 테이블에 저장, `refresh` 쿠키, 30일. 사용 시 rotation(`ACTIVE` → `USED`, 새 토큰 발급), 같은 `family_id`로 묶인다.
- 동시 요청 race 대응: `USED` 토큰도 30초(`RACE_GRACE_MS`) 안이면 허용한다. 그 밖의 재사용은 탈취로 보고 family 전체를 `REVOKED` 처리한다.
- 미들웨어가 access 만료 시 refresh로 자동 갱신하고 새 쿠키를 응답에 싣는다.
- 클라이언트는 `authFetch()`로 호출하고, 401이면 세션 만료 UX(로그인 리다이렉트)로 넘어간다.

## 지켜야 할 것

- 쿠키: `HttpOnly`, `SameSite=Lax`, `Path=/`, 프로덕션에서 `Secure`. 로그아웃은 두 쿠키 모두 `Max-Age=0` + refresh family revoke.
- `verifyJwt` 등 검증 함수는 실패 시 `null`을 반환하고 원인을 밖으로 내보내지 않는다.
- 시크릿(`JWT_SECRET`, `CHZZK_CLIENT_SECRET`)은 `wrangler secret`/`.env`로만 관리. `NEXT_PUBLIC_`에 두지 않는다.
- 인증 흐름을 바꾸면 `src/__tests__/proxy.test.ts`, `src/__tests__/integration/auth-flow.test.ts`를 함께 갱신한다.
