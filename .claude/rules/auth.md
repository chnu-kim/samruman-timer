---
paths:
  - src/lib/auth.ts
  - src/lib/chzzk.ts
  - src/app/api/auth/**
  - src/proxy.ts
---

# 인증 규칙

인증 관련 코드 작업 시 반드시 아래 설계 문서를 참조한다:

- `docs/AUTH.md` — CHZZK OAuth 플로우, JWT 세션, 프록시, 환경변수

## 핵심 규칙

- 인증: CHZZK OAuth (Authorization Code Flow)
- 세션: JWT를 `session` httpOnly 쿠키에 저장
- JWT 설정: HS256, `JWT_SECRET` 환경변수, 만료 7일
- JWT 페이로드: `{ userId, chzzkUserId, nickname, iat, exp }`
- CSRF 방지: OAuth `state` 파라미터를 쿠키에 저장하여 검증
- 쿠키 옵션: httpOnly, secure(production), sameSite=lax, path=/
- 보호 대상: `POST /api/projects`, `POST /api/projects/[id]/timers`, `POST /api/timers/[id]/modify`, `POST /api/auth/logout`
- 프록시에서 JWT 검증 후 요청 헤더에 사용자 정보 주입
- 환경변수: `CHZZK_CLIENT_ID`, `CHZZK_CLIENT_SECRET`, `JWT_SECRET`, `BASE_URL`