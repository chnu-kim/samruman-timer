# CLAUDE.md

삼루만타이머 — 치지직(CHZZK) 스트리머용 시간 추가형(서브어톤) 타이머 + OBS 오버레이 서비스.

## Commands

- `pnpm dev` / `pnpm build` / `pnpm start`
- `pnpm test` — Vitest 전체 실행. 파일 지정: `pnpm test src/__tests__/api/timers-modify.test.ts`
- `pnpm build-storybook` — 스토리 빌드 검증
- `pnpm db:migrate:local` / `pnpm db:migrate` — D1 마이그레이션 적용 (원격 적용은 사용자 확인 후)
- `pnpm run deploy` — 프로덕션 배포 (`pnpm deploy`는 pnpm 내장 workspace 명령이라 스크립트가 실행되지 않는다). 사용자가 명시적으로 요청할 때만 실행
- 배포와 원격 마이그레이션은 별개 명령이라 한쪽만 실행되기 쉽다. 실제로 코드만 배포되고 `0007` 마이그레이션이 빠져 프로덕션 로그인이 깨진 적이 있다. 배포 전이나 프로덕션 오류를 조사할 때는 `npx wrangler d1 migrations list samrumantimer-db --remote`로 원격에 적용 안 된 마이그레이션부터 확인한다. 로그는 `npx wrangler tail samrumantimer`.

변경을 마무리하기 전에 `pnpm test`와 `pnpm build`를 통과시킨다. UI 컴포넌트를 바꿨다면 `pnpm build-storybook`도.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript, Tailwind CSS v4 (CSS-first, `src/app/globals.css`에 토큰·키프레임 정의, config 파일 없음)
- Cloudflare Workers 배포 (`@opennextjs/cloudflare`, `wrangler.toml`)
- D1 (SQLite) — `getDB()` (`src/lib/db.ts`)로 접근
- 인증: CHZZK OAuth → access JWT(`session` 쿠키, 15분) + refresh token rotation(`refresh` 쿠키, 30일, D1 저장)
- `src/middleware.ts`가 `/api/*`를 가로채 JWT 검증·자동 갱신 후 `x-user-*` 헤더를 주입한다. Next 16 관례상 `proxy.ts`가 표준이지만 이 프로젝트는 `middleware.ts`를 쓴다
- Charts: Recharts, Path alias: `@/*` → `./src/*`

## 디렉토리

- `src/app/api/` — API 라우트 (`auth`, `projects`, `timers`)
- `src/app/timers/[id]/overlay/` — OBS 브라우저 소스용 오버레이 페이지
- `src/lib/` — 서버 로직 (`timer.ts` 잔여시간·상태전이, `auth.ts`, `chzzk.ts`, `db.ts`, `goal.ts`). `auth-fetch.ts`, `session-expired.ts`는 클라이언트용
- `src/components/{timer,project,goal,graph,stats,layout,providers,ui}/`
- `migrations/NNNN_*.sql` — D1 스키마 변경 이력
- `docs/` — 설계 문서. 해당 영역을 작업할 때 먼저 읽는다: `PRD`, `TIMER-LOGIC`, `DATABASE`, `AUTH`, `API`, `ARCHITECTURE`, `UI`, `UX-IMPROVEMENTS`(개선 백로그 체크리스트), `UI-UX-REVIEW`(스크린샷 근거의 UI/UX 리뷰 지적 목록)

docs와 코드가 다르면 코드가 현재 동작이다. 불일치를 발견하면 사용자에게 알리고, 작업 범위 안이면 문서도 함께 고친다.

## 컨벤션

- 언어: 문서·UI 텍스트·커밋 메시지·주석은 한국어, 식별자는 영어
- API 응답: 성공 `{ "data": ... }`, 실패 `{ "error": { "code", "message" } }`
- ID: 32자 hex (`generateId()`), 날짜: ISO 8601 UTC 문자열 (`nowISO()`)
- 타이머 잔여시간은 항상 서버에서 계산: `max(0, baseRemainingSeconds - (now - lastCalculatedAt))`
- 프로젝트당 타이머는 1개 (`POST /api/projects/[id]/timers`에서 강제)
- 커밋: Conventional Commits, `type: 한국어 요약` (`feat`/`fix`/`refactor`/`style`/`test`/`docs`/`chore`)

영역별 상세 규칙은 `.claude/rules/`에 있고 해당 경로 파일을 다룰 때 자동으로 로드된다.
