---
paths:
  - src/app/api/**
---

# API 라우트 규칙

API 라우트 작업 시 반드시 아래 설계 문서를 참조한다:

- `docs/API.md` — 엔드포인트 설계 (요청/응답/인증/에러 코드)
- `docs/DATABASE.md` — D1 스키마, 쿼리 패턴

## 핵심 규칙

- 응답 형식: `{ "data": {...} }` (성공) / `{ "error": { "code", "message" } }` (에러)
- 에러 코드: `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INTERNAL_ERROR`
- 인증 필요 엔드포인트는 `session` 쿠키의 JWT 검증 필수
- D1 접근: `getCloudflareContext().env.DB`
- ID 생성: `lower(hex(randomblob(16)))` (32자 hex)
- 날짜: ISO 8601 UTC (`datetime('now')`)
- 유효성 검사를 반드시 수행하고, 실패 시 `400 BAD_REQUEST` 반환