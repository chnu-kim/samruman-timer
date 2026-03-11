# 보안 규칙

보안 관련 파일 수정 시 모든 에이전트가 적용하는 규칙.

**적용 대상**: `src/lib/auth.ts`, `src/lib/chzzk.ts`, `src/lib/db.ts`, `src/middleware.ts`, `src/app/api/**`, `next.config.ts`, `wrangler.toml`

## 인증/세션

- JWT 쿠키 속성 필수: `httpOnly: true`, `secure: true`, `sameSite: "lax"`, `path: "/"`
- OAuth state 파라미터 반드시 검증 (CSRF 방지)
- `verifyJwt` 실패 시 null 반환 — 에러 객체/메시지 노출 금지
- 로그아웃 시 쿠키 `maxAge: 0`으로 완전 삭제

## 인가/접근 제어

- 내부 헤더(`x-user-id` 등)는 미들웨어에서만 설정 — 클라이언트 위조 불가
- 리소스 수정/삭제 시 소유권 검증 필수 (`userId === resource.userId`)
- 신규 인증 필요 API → `PROTECTED_ROUTES` 배열에 등록 필수
- DELETE/PUT/PATCH 엔드포인트는 인증 미들웨어 적용 필수

## 입력 검증

- `request.json()` 호출 시 try/catch 필수 — 파싱 실패 시 400 반환
- SQL 쿼리는 반드시 바인드 파라미터(`?`) 사용 — 문자열 보간(`${}`) 금지
- URL/경로 매개변수 타입 검증 필수 (32자 hex ID 등)
- 요청 본문 필드에 길이/범위 제한 적용

## 에러 처리

- API 라우트는 `withErrorHandler()` 래퍼 사용 권장
- catch 블록에서 에러 원본(스택 트레이스, DB 쿼리) 클라이언트 반환 금지
- 에러 응답은 `{ "error": { "code": "...", "message": "..." } }` 형식만 사용
- 프로덕션 `console.log`에 토큰/비밀번호/사용자 데이터 포함 금지

## 시크릿 관리

- `.env` 파일은 반드시 `.gitignore`에 포함
- 코드에 시크릿/토큰/API 키 하드코딩 금지
- `NEXT_PUBLIC_` 접두사 환경변수에 시크릿 값 금지
- `wrangler.toml`에 시크릿 하드코딩 금지 — `wrangler secret` 사용

## 서버/클라이언트 경계

- `"use client"` 파일에서 `process.env` 직접 참조 금지
- 서버 전용 모듈(`src/lib/db.ts`, `src/lib/auth.ts`)을 클라이언트 컴포넌트에서 import 금지
- API 키/시크릿이 클라이언트 번들에 포함되지 않도록 주의

## 외부 통신

- 외부 API fetch 시 timeout 설정 권장 (`AbortSignal.timeout()`)
- 외부 API 에러 메시지를 클라이언트에 그대로 전달 금지
- 외부 응답 데이터 검증 후 사용
