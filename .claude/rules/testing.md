---
paths:
  - src/**/__tests__/**
  - src/**/*.test.ts
  - src/**/*.test.tsx
  - vitest.config.ts
---

# 테스트

## 위치

- `src/lib/__tests__/*.test.ts` — lib 단위 테스트
- `src/__tests__/api/*.test.ts` — 라우트 핸들러 단위 테스트
- `src/__tests__/proxy.test.ts` — `src/middleware.ts`
- `src/__tests__/*-page.test.tsx` — 페이지 컴포넌트 (`projects-page`, `project-detail-page`, `timer-detail-page`, `overlay-page`)
- `src/components/*/__tests__/*.test.tsx`, `src/hooks/__tests__/*.test.tsx` — 컴포넌트·훅 테스트
- `src/__tests__/integration/*.test.ts` — 여러 라우트를 순서대로 호출하는 흐름 테스트 (예: `timer-lifecycle`, `auth-flow`, `cross-resource-auth`)

## 환경

`vitest.config.ts`의 기본 환경은 `node`이고 `src/test-setup.ts`가 `@testing-library/jest-dom`을 불러온다. DOM이 필요한 테스트(컴포넌트·훅·페이지)는 파일 맨 위에 `// @vitest-environment jsdom`을 둔다.

## Mock 전략

- D1: `createMockDB()` + `mockGetDB(db)` (`src/__tests__/helpers.ts`), 또는 `vi.mock("@/lib/db")`.
- 요청: `createGetRequest`, `createPostRequest`, `createPostRequestRaw`(잘못된 JSON 테스트용), `createDeleteRequest`, `createPatchRequest`, `createPutRequest`, `createPutRequestRaw`.
- 인증된 요청은 미들웨어가 주입하는 `x-user-id` 등 헤더를 직접 넣어 흉내 낸다.
- CHZZK API: `global.fetch = vi.fn()`. JWT는 env를 stub하고 실제 `signJwt`/`verifyJwt`를 쓴다.
- 통합 테스트에서 DB 응답은 호출 순서대로 `mockResolvedValueOnce`를 쌓는다. 순서가 어긋나면 엉뚱한 응답이 반환되므로, 테스트가 이상하게 실패하면 먼저 mock 순서를 의심한다.

## 무엇을 검증하나

상태 코드와 `{ data }`/`{ error: { code } }` 형태, 그리고 의미 있는 부수효과(바인드 값, 기록된 로그의 `action_type`·before/after)를 검증한다. 엔드포인트마다 401(미인증)·403(타인 리소스)·404·400(잘못된 입력) 경로를 포함한다.

운영 로그를 남기는 경로는 `vi.spyOn(console, "error" | "warn" | "log").mockImplementation(() => {})`로 출력을 막고, 호출 인자를 `JSON.parse`해 `event`·`requestId`·필드를 단언한다. 테스트 출력에 stderr 잡음(스택 전체 등)을 남기지 않기 위해서이고, 로그가 한 번만 남는지와 토큰·닉네임 같은 금지 값이 들어가지 않는지도 함께 확인한다. spy 타입은 `MockInstance<typeof console.error>`로 둔다(`ReturnType<typeof vi.spyOn>`은 tsc에서 인자 타입이 무너진다).

mock이 실제 D1 동작을 대신하므로, SQL 자체의 정확성(제약 위반, 인덱스 등)은 이 테스트로 보장되지 않는다. 스키마가 얽힌 변경은 `pnpm db:migrate:local` 후 `pnpm dev`로 직접 확인한다.
