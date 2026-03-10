# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `pnpm dev` - Start development server
- `pnpm build` - Production build
- `pnpm start` - Start production server
- `pnpm test` - 전체 테스트 실행 (vitest run)
- `pnpm test:watch` - 테스트 워치 모드 (vitest)

## Architecture

This is a fresh Next.js 16 app using the App Router with TypeScript, React 19, and Tailwind CSS v4.

- **App Router**: Pages live in `src/app/` (e.g., `src/app/page.tsx` is the home route)
- **Styling**: Tailwind CSS v4 via `@tailwindcss/postcss` plugin — no `tailwind.config` file; configuration uses CSS-first approach in `src/app/globals.css`
- **Fonts**: Geist and Geist Mono loaded via `next/font/google` in `src/app/layout.tsx`
- **Path alias**: `@/*` maps to `./src/*`
- **Database**: Cloudflare D1 (SQLite) — `getCloudflareContext().env.DB`로 접근
- **Auth**: CHZZK OAuth + JWT (httpOnly 쿠키) 세션 관리
- **Charts**: Recharts
- **Deployment**: Cloudflare Pages (@opennextjs/cloudflare), `wrangler.toml`로 설정

## 설계 문서

프로젝트 기획/설계 문서는 `docs/` 디렉토리에 있다:

- `docs/PRD.md` — 제품 요구사항 정의
- `docs/TIMER-LOGIC.md` — 타이머 계산 로직, 상태 전이, 로깅 규칙
- `docs/DATABASE.md` — D1 스키마, 인덱스, 마이그레이션
- `docs/AUTH.md` — CHZZK OAuth 플로우, JWT 세션, 프록시
- `docs/API.md` — API 엔드포인트 설계 (요청/응답/인증)
- `docs/ARCHITECTURE.md` — 디렉토리 구조, 배포, 데이터 흐름
- `docs/UI.md` — 페이지 구성, 컴포넌트 계층, 그래프 설계

## 주요 컨벤션

- 문서 언어: 한국어
- 타이머 잔여 시간: 서버에서 계산 (`remaining = baseRemainingSeconds - (now - lastCalculatedAt)`)
- DB ID: 32자 hex 랜덤 문자열
- 날짜: ISO 8601 (UTC)
- API 응답: `{ "data": {...} }` 또는 `{ "error": { "code", "message" } }`
- 마이그레이션: `migrations/NNNN_description.sql` 순번 관리
- UI 텍스트: 한국어 (코드/변수명은 영어)

## 테스트

- **러너**: Vitest (`vitest.config.ts`에 `@/` alias 설정)
- **단위 테스트**: `src/lib/__tests__/*.test.ts` — Core Lib (db, auth, chzzk, timer)
- **API 테스트**: `src/__tests__/api/*.test.ts` — API 라우트 핸들러 (Mock DB)
- **프록시 테스트**: `src/__tests__/proxy.test.ts` — 인증 프록시
- **통합 테스트**: `src/__tests__/integration/*.test.ts` — 기능 흐름 E2E
- **헬퍼**: `src/__tests__/helpers.ts` — createMockDB, createGetRequest, createPostRequest
- **Mock 전략**: D1은 `createMockDB()`로 모킹, `getDB`는 `vi.mock("@/lib/db")`
- **Skill**: `/unit-test` — 단위 테스트 실행 + 결과 분석 + 커버리지 갭 확인
- **Skill**: `/integration-test` — 통합 테스트 작성 및 실행
- **Agent**: `unit-test-runner` — 테스트 실행/실패 분석 전문 에이전트
- **Agent**: `integration-test-writer` — 통합 테스트 작성 전문 에이전트