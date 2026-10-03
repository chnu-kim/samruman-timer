# CLAUDE.md

삼루먼타이머 — 치지직(CHZZK) 스트리머용 시간 추가형(서브어톤) 타이머 + OBS 오버레이 서비스.

## Commands

- `pnpm dev` / `pnpm build` / `pnpm start`
- `pnpm test` — Vitest 전체 실행. 파일 지정: `pnpm test src/__tests__/api/timers-modify.test.ts`
- `pnpm build-storybook` — 스토리 빌드 검증
- `pnpm db:migrate:local` — 로컬 D1에 마이그레이션 적용. `pnpm db:migrate:remote` — 원격(프로덕션) D1에 적용, 사용자 확인 후에만 실행. `pnpm db:migrate`는 플래그가 없어 wrangler 4에서 로컬에 적용된다
- `pnpm run deploy` — 프로덕션 배포 (`pnpm deploy`는 pnpm 내장 workspace 명령이라 스크립트가 실행되지 않는다). 사용자가 명시적으로 요청할 때만 실행. `scripts/deploy.mjs`가 git short SHA를 버전 태그로 붙이고 dirty 트리나 origin/main에 없는 HEAD면 거부한다(`--dry-run`으로 확인)
- 배포와 원격 마이그레이션은 별개 명령이라 한쪽만 실행되기 쉽다. 실제로 코드만 배포되고 `0007` 마이그레이션이 빠져 프로덕션 로그인이 깨진 적이 있다. 배포 전이나 프로덕션 오류를 조사할 때는 `npx wrangler d1 migrations list samrumantimer-db --remote`로 원격에 적용 안 된 마이그레이션부터 확인한다. 로그는 대시보드 Workers Logs(보관됨)나 `npx wrangler tail samrumantimer`(실시간).
- `node scripts/obs.mjs <errors|events|request|summary|issues|issue|verify|triage>` — 프로덕션 운영 로그·Issues 읽기 전용 조회(`CF_OBS_TOKEN` 필요). `verify --tag <sha>`는 배포 후 재발 여부를, `triage [--since 24h]`는 지금의 정상/비정상(카탈로그 기준을 옮긴 `scripts/lib/obs-rules.mjs` 규칙표)을 exit code로 낸다. 절차는 `docs/OBSERVABILITY.md`, 조사 루프는 `prod-triage` skill. 토큰이 없으면 Cloudflare 플러그인의 `execute` 도구로 같은 API를 부를 수 있다. 플러그인 인증은 쓰기 권한까지 가질 수 있으므로 OBSERVABILITY "Cloudflare 플러그인으로 조회"에 적힌 조회용 엔드포인트만 부른다. 판정은 토큰 없이도 코드가 한다: `verify`·`triage ... --print-plugin-code`가 낸 조회 코드를 execute로 돌리고 그 결과 파일로 `--input <file>`

변경을 마무리하기 전에 `pnpm test`와 `pnpm build`를 통과시킨다. UI 컴포넌트를 바꿨다면 `pnpm build-storybook`도.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript, Tailwind CSS v4 (CSS-first, `src/app/globals.css`에 토큰·키프레임 정의, config 파일 없음)
- Cloudflare Workers 배포 (`@opennextjs/cloudflare`, `wrangler.toml`)
- D1 (SQLite) — `getDB()` (`src/lib/db.ts`)로 접근
- 인증: CHZZK OAuth → access JWT(`session` 쿠키, 15분) + refresh token rotation(`refresh` 쿠키, 30일, D1 저장)
- `src/middleware.ts`가 `/api/*`를 가로채 JWT 검증·자동 갱신 후 `x-user-*` 헤더를 주입한다. Next 16 관례상 `proxy.ts`가 표준이지만 이 프로젝트는 `middleware.ts`를 쓴다
- Charts: Recharts, Path alias: `@/*` → `./src/*`
- 사이트 절대 주소는 `src/lib/site.ts`의 `SITE_URL` 상수다. metadata·robots·sitemap은 빌드 때 프리렌더되는데 `BASE_URL`은 프로덕션 런타임 시크릿이라, 빌드 시점에는 `.env`의 localhost 값만 읽힌다. 도메인을 바꾸면 `BASE_URL`, CHZZK Redirect URI와 함께 이 상수도 고친다

## 디렉토리

- `src/app/api/` — API 라우트 (`auth`, `projects`, `timers`)
- `src/app/timers/[id]/overlay/` — OBS 브라우저 소스용 오버레이 페이지
- `src/lib/` — 서버 로직 (`timer.ts` 잔여시간·상태전이, `auth.ts`, `chzzk.ts`, `db.ts`, `goal.ts`). `auth-fetch.ts`, `session-expired.ts`, `timer-sync.ts`, `overlay-animation.ts`, `overlay-mode.ts`, `overlay-polling.ts`, `overlay-recovery.ts`, `pwa.ts`는 클라이언트용, `safe-redirect.ts`, `overlay-style.ts`, `site.ts`(사이트 절대 주소·SEO 메타 상수)는 서버·클라이언트 공용
- `src/hooks/` — 클라이언트 훅 (`usePolling`, `useKeyboardShortcuts` 등)
- `src/components/{timer,project,goal,graph,stats,layout,providers,ui}/`
- `migrations/NNNN_*.sql` — D1 스키마 변경 이력
- `docs/` — 설계 문서. 해당 영역을 작업할 때 먼저 읽는다: `PRD`, `TIMER-LOGIC`, `DATABASE`, `AUTH`, `API`, `ARCHITECTURE`, `OBSERVABILITY`(운영 로그 이벤트 카탈로그·조사 런북), `UI`, `UX-IMPROVEMENTS`(개선 백로그 체크리스트), `UI-UX-REVIEW`(스크린샷 근거의 UI/UX 리뷰 지적 목록)

docs와 코드가 다르면 코드가 현재 동작이다. 불일치를 발견하면 사용자에게 알리고, 작업 범위 안이면 문서도 함께 고친다.

## 컨벤션

- 언어: 문서·UI 텍스트·커밋 메시지·주석은 한국어, 식별자는 영어
- API 응답: 성공 `{ "data": ... }`, 실패 `{ "error": { "code", "message" } }`
- ID: 32자 hex (`generateId()`), 날짜: ISO 8601 UTC 문자열 (`nowISO()`)
- 타이머 잔여시간은 항상 서버에서 계산: `max(0, baseRemainingSeconds - (now - lastCalculatedAt))`
- 프로젝트당 타이머는 1개 (`POST /api/projects/[id]/timers`에서 강제)
- 커밋: Conventional Commits, `type: 한국어 요약` (`feat`/`fix`/`refactor`/`style`/`test`/`docs`/`chore`)

영역별 상세 규칙은 `.claude/rules/`에 있고 해당 경로 파일을 다룰 때 자동으로 로드된다.
