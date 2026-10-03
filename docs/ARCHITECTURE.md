# 아키텍처

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router) |
| 언어 | TypeScript, React 19 |
| 스타일링 | Tailwind CSS v4 |
| 차트 | Recharts |
| 데이터베이스 | Cloudflare D1 (SQLite) |
| 인증 | CHZZK OAuth + JWT (httpOnly 쿠키) |
| 배포 | Cloudflare Workers (@opennextjs/cloudflare) |

## 디렉토리 구조

```
src/
  middleware.ts                           — 인증 미들웨어 (/api/* 전체: 내부 헤더 제거, 보호 라우트 JWT 검증·자동 갱신, x-user-* 주입)

  app/
    layout.tsx                          — 루트 레이아웃 (ThemeProvider, ToastProvider, Header, Footer, SessionExpiredHandler)
    page.tsx                            — 홈 (→ /projects 리다이렉트)
    globals.css                         — Tailwind CSS 설정 (토큰·키프레임)
    icon.svg, apple-icon.png            — 파비콘·앱 아이콘
    manifest.ts                         — PWA 매니페스트 (/manifest.webmanifest)
    robots.ts, sitemap.ts               — /robots.txt, /sitemap.xml (절대 주소는 lib/site.ts의 SITE_URL)
    opengraph-image.png                 — SNS 미리보기 이미지 1200×630 (icon.svg 도형으로 생성)

    (auth)/
      login/page.tsx                    — 로그인 페이지 (next 검증 후 /api/auth/login으로 전달)
      callback/page.tsx                 — 직접 도달 시 /로 보내는 페이지 (실제 콜백은 /api/auth/callback)

    projects/
      page.tsx                          — 프로젝트 목록
      [id]/page.tsx                     — 프로젝트 상세

    timers/
      [id]/
        page.tsx                        — 타이머 상세
        stats/page.tsx                  — 타이머 통계
        overlay/page.tsx                — OBS 오버레이 페이지

    api/
      auth/
        login/route.ts                  — CHZZK OAuth 시작
        callback/route.ts               — OAuth 콜백 처리
        logout/route.ts                 — 로그아웃
        me/route.ts                     — 현재 사용자 정보
      projects/
        _shared.ts                      — 목록 조회 파라미터 파싱·쿼리 공용 로직
        route.ts                        — 프로젝트 목록/생성
        mine/route.ts                   — 내 프로젝트 목록
        others/route.ts                 — 다른 사용자 프로젝트 목록
        [id]/
          route.ts                      — 프로젝트 상세/수정/삭제
          timers/route.ts               — 타이머 목록/생성
          goals/route.ts                — 목표 목록/생성
          goals/[goalId]/route.ts       — 목표 수정/삭제
      timers/
        [id]/
          route.ts                      — 타이머 상세/수정/삭제
          modify/route.ts               — 시간 증감
          logs/route.ts                 — 로그 조회
          graph/route.ts                — 그래프 데이터
          stats/route.ts                — 통계 데이터
          overlay-settings/route.ts     — 오버레이 설정 조회/저장

  components/
    timer/                              — 타이머 관련 컴포넌트
      CountdownDisplay.tsx              — 큰 카운트다운 숫자 표시
      TimerControls.tsx                 — 시간 증감 버튼, 입력 필드
      CreateTimerForm.tsx               — 타이머 생성 폼
      OverlaySettings.tsx               — 오버레이 설정
    project/                            — 프로젝트 관련 컴포넌트
      ProjectCard.tsx                   — 프로젝트 목록용 카드
      CreateProjectForm.tsx             — 프로젝트 생성 폼
    goal/                               — 목표 컴포넌트
      GoalCard.tsx                      — 목표 카드
      GoalForm.tsx                      — 목표 생성 폼
      GoalProgressBar.tsx               — 목표 진행률 바
    graph/                              — 그래프 컴포넌트
      RemainingChart.tsx                — 잔여 시간 추이 (LineChart)
      CumulativeChart.tsx               — 누적 변경량 (AreaChart)
      FrequencyChart.tsx                — 이벤트 빈도 (BarChart)
      GraphModeSelector.tsx             — 그래프 모드 선택 탭
    stats/                              — 통계 컴포넌트
      StatsCard.tsx, StatsCardGrid.tsx  — 통계 카드
      DailyActivityChart.tsx            — 일별 활동
      HourlyActivityChart.tsx           — 시간대별 활동
      DonorRankingTable.tsx             — 기여자 순위
    layout/                             — 레이아웃 컴포넌트
      Header.tsx                        — 상단 네비게이션
      Footer.tsx                        — 하단 푸터
    providers/                          — 컨텍스트 프로바이더
      ThemeProvider.tsx                 — 다크/라이트 테마 프로바이더
      SessionExpiredHandler.tsx         — 세션 만료 시 토스트 후 /login?next=로 이동
      ServiceWorkerRegister.tsx         — 프로덕션에서 /sw.js 등록 (오버레이 경로 제외)
      ServiceWorkerCleanup.tsx          — 개발 모드에서 남은 /sw.js 등록·캐시 정리
    ui/                                 — 공통 UI 컴포넌트
      Button.tsx                        — 버튼
      Badge.tsx                         — 상태 배지
      Pagination.tsx                    — 페이지네이션
      Input.tsx                         — 입력 필드
      Spinner.tsx                       — 로딩 스피너
      Skeleton.tsx                      — 스켈레톤 로딩
      ErrorState.tsx                    — 에러 상태 표시
      ThemeToggle.tsx                   — 테마 토글 버튼
      Toast.tsx                         — 토스트 알림 (ToastProvider)
      Icons.tsx                         — 공통 아이콘
      EditableText.tsx                  — 인라인 편집 텍스트
      ConfirmDialog.tsx                 — 확인 다이얼로그
      FormDialog.tsx                    — 폼 다이얼로그

  hooks/
    useKeyboardShortcuts.ts             — 키보드 단축키 훅
    usePolling.ts                       — 주기 조회 훅
    useCountdownEnded.ts                — 로컬 카운트다운 0 도달 감지
    useDocumentTitle.ts                 — 브라우저 탭 제목
    useDebounce.ts                      — 디바운스

  lib/
    db.ts                               — D1 헬퍼 (getDB, generateId, nowISO, withErrorHandler)
    auth.ts                             — JWT 생성/검증, 쿠키, refresh token rotation
    timer.ts                            — 타이머 계산 로직
    chzzk.ts                            — CHZZK OAuth 클라이언트
    goal.ts                             — 목표 진행률 계산
    env.ts                              — 필수 환경변수 검증
    logger.ts                           — 구조화 로그
    safe-redirect.ts                    — 로그인 후 next 경로 검증 (서버·클라이언트 공용)
    overlay-style.ts                    — 오버레이 색상·배경 값 검증 (서버·클라이언트 공용)
    site.ts                             — 사이트 절대 주소·이름·설명·title 템플릿 (metadata·robots·sitemap 공용)
    auth-fetch.ts                       — (클라이언트) 401이면 세션 만료 이벤트를 보내는 fetch 래퍼
    session-expired.ts                  — (클라이언트) 세션 만료 이벤트
    timer-sync.ts                       — (클라이언트) 폴링 값과 로컬 카운트다운 동기화
    overlay-animation.ts                — (클라이언트) 오버레이 변화량 애니메이션
    pwa.ts                              — (클라이언트) 오버레이 경로 판정·SW 경로·캐시 접두사 (public/sw.js와 같은 규칙)
    utils.ts                            — 공용 유틸

  types/
    index.ts                            — 공통 타입 정의

public/                                 — Workers Static Assets가 Worker 없이 직접 서빙
  sw.js                                 — 서비스워커 (정적 자산 캐시·오프라인 안내)
  offline.html                          — 오프라인 안내 페이지
  icons/                                — PWA 아이콘 PNG (icon.svg에서 생성, 192·512·maskable 512)
  _headers                              — public 파일 응답 헤더

migrations/
  0001_initial.sql                      — 초기 DB 스키마
  0002_scheduled_start.sql              — 예약 시작 기능
  0003_soft_delete.sql                  — 타이머 소프트 삭제
  0004_project_soft_delete.sql          — 프로젝트 소프트 삭제
  0005_overlay_settings.sql             — 오버레이 설정
  0006_goals.sql                        — 목표
  0007_refresh_tokens.sql               — refresh token
  0008_overlay_animation.sql            — 오버레이 애니메이션 설정

wrangler.toml                           — Cloudflare Workers 설정
open-next.config.ts                     — @opennextjs/cloudflare 설정 (기본값)
```

## 데이터 흐름

### 타이머 조회 흐름

```
클라이언트 → GET /api/timers/[id]
  → 서버: D1에서 타이머 조회
  → 서버: remaining 계산 (baseRemainingSeconds - elapsed)
  → 서버: 만료 감지 시 DB 업데이트 + EXPIRE 로그
  → 응답: { remainingSeconds, status, ... }
  → 클라이언트: setInterval로 1초마다 로컬 카운트다운 표시
  → 클라이언트: 주기적으로 서버에 재조회하여 동기화 (상세 페이지 RUNNING 5초·그 외 15초, 오버레이 5초)
```

### 시간 변경 흐름

```
클라이언트 → POST /api/timers/[id]/modify { action, deltaSeconds, actorName }
  → 미들웨어: JWT 검증(만료 시 refresh 갱신) → x-user-id 주입
  → 서버: 프로젝트 소유자 확인 (아니면 403)
  → 서버: 현재 remaining 계산
  → 서버: 새 remaining 계산 (ADD/SUBTRACT)
  → 서버: DB 업데이트 (baseRemainingSeconds, lastCalculatedAt, status)
  → 서버: timer_logs에 로그 기록
  → 응답: { remainingSeconds, status, log }
  → 클라이언트: UI 즉시 반영
```

### 인증 흐름

```
클라이언트 → GET /api/auth/login[?next=경로]
  → 302 → CHZZK OAuth 동의 (state·oauth_next 쿠키 저장)
  → 302 → /api/auth/callback?code=xxx&state=yyy
  → 서버: state 검증 → 토큰 교환 → 사용자 정보 조회/생성
  → 서버: access JWT + refresh token 발급 → session, refresh httpOnly 쿠키 설정
  → 302 → next 경로 또는 /  (실패 시 /login?error=auth_failed)
```

## Cloudflare 배포

### @opennextjs/cloudflare 어댑터

Next.js를 Cloudflare Workers에서 실행하기 위한 어댑터를 사용한다. `opennextjs-cloudflare build`가 `.open-next/worker.js`와 정적 자산(`.open-next/assets`)을 만든다.

### wrangler.toml 설정

```toml
name = "samrumantimer"
main = ".open-next/worker.js"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = ".open-next/assets"
binding = "ASSETS"

[[d1_databases]]
binding = "DB"
database_name = "samrumantimer-db"
database_id = "<DATABASE_ID>"
```

### D1 바인딩 접근

`src/lib/db.ts`의 `getDB()`가 아래처럼 바인딩을 꺼낸다.

```typescript
import { getCloudflareContext } from "@opennextjs/cloudflare";

const { env } = await getCloudflareContext();
const db = env.DB;

// 쿼리 예시
const result = await db.prepare("SELECT * FROM users WHERE id = ?")
  .bind(userId)
  .first();
```

### 환경변수

Cloudflare Workers의 환경변수(Secrets)로 관리 (로컬은 `.dev.vars`/`.env`). 미들웨어가 `validateEnv()`로 누락 여부를 확인한다:

| 변수 | 설명 |
|------|------|
| `CHZZK_CLIENT_ID` | CHZZK OAuth 클라이언트 ID |
| `CHZZK_CLIENT_SECRET` | CHZZK OAuth 클라이언트 시크릿 |
| `JWT_SECRET` | JWT 서명 비밀 키 |
| `BASE_URL` | 서비스 베이스 URL |

### 배포 명령

```bash
# D1 데이터베이스 생성
wrangler d1 create samrumantimer-db

# 마이그레이션 적용 (플래그가 없으면 wrangler 4는 로컬 DB에 적용한다)
wrangler d1 migrations apply samrumantimer-db --local    # pnpm db:migrate:local
wrangler d1 migrations apply samrumantimer-db --remote   # 원격(프로덕션)

# 원격에 적용 안 된 마이그레이션 확인
npx wrangler d1 migrations list samrumantimer-db --remote

# 배포 (pnpm run deploy)
npx opennextjs-cloudflare build && npx opennextjs-cloudflare deploy
```

### 정적 자산 헤더 (`public/_headers`)

`wrangler.toml`에 `run_worker_first`가 없으므로 `.open-next/assets`에 있는 파일(`public/*`, `/_next/static/*`)은 Workers Static Assets가 Worker를 실행하지 않고 바로 응답한다. 그래서 `next.config.ts`의 `headers()`는 이 파일들에 붙지 않는다. `public/*` 응답 헤더는 `public/_headers`로 지정하고, 보안 헤더(nosniff, HSTS, Permissions-Policy 등)는 `next.config.ts`의 `/:path*` 공통 헤더와 맞추고, `src/__tests__/static-headers.test.ts`가 둘이 같은지 확인한다. 반대로 `/manifest.webmanifest`, `/icon.svg`, `/apple-icon.png`, `/opengraph-image.png`, `/robots.txt`, `/sitemap.xml`은 Next 메타데이터 라우트라 Worker를 거쳐 `next.config.ts` 헤더를 받는다.

## SEO 메타데이터

- 절대 주소는 `src/lib/site.ts`의 `SITE_URL` 상수로 둔다. `BASE_URL`은 프로덕션에서 런타임 시크릿이라, 빌드 때 프리렌더되는 metadata·`robots.txt`·`sitemap.xml`에서 읽으면 `.env`의 localhost가 박힌다. 도메인을 바꾸면 이 상수도 고친다.
- 루트 `layout.tsx`가 `metadataBase`·title 템플릿(`%s | 삼루먼타이머`)·OpenGraph·Twitter 카드를 정한다. OG 이미지는 정적 `src/app/opengraph-image.png`다(한글 폰트·Workers 번들 문제로 `ImageResponse`를 쓰지 않는다).
- 페이지가 모두 클라이언트 컴포넌트라 페이지별 title은 각 라우트의 서버 `layout.tsx`에 둔다. 하위 페이지가 있는 layout(`projects`, `timers/[id]`)은 title을 문자열로 두면 그 아래에서 템플릿이 끊기므로 `{ default, template }`으로 다시 선언한다.
- 색인 제외: 오버레이·OAuth 콜백·통계(소유자 전용)는 layout의 `robots: noindex`로 막는다. `robots.txt`는 `/api/`만 Disallow한다(Disallow하면 크롤러가 noindex 메타를 읽지 못한다).
- canonical: `/projects`(검색·정렬 쿼리 통합), `/login`(`?next=`·`?error=` 통합), `/projects/<id>`(상위 canonical을 물려받지 않게 자기 주소).
- sitemap에는 로그인 없이 보이는 `/projects`, `/login`만 둔다.

## PWA

설치 가능한 앱(standalone)과 오프라인 안내만 제공한다. 푸시 알림은 없다.

- 매니페스트: `src/app/manifest.ts`. `start_url`은 `/projects`(`/`는 리다이렉트를 거친다). 아이콘은 `public/icons/*.png`.
- iOS: `layout.tsx` metadata의 `appleWebApp`(홈 화면 이름·상태 표시줄)과 `apple-mobile-web-app-capable`로 iOS 16.4 이전 Safari에서도 standalone으로 열린다. 아이콘은 `src/app/apple-icon.png`.
- 서비스워커: `public/sw.js`. `ServiceWorkerRegister`가 프로덕션 빌드에서만 등록한다(`layout.tsx`가 `NODE_ENV`로 판단). 개발 모드에서는 대신 `ServiceWorkerCleanup`이 `next start` 때 남은 `/sw.js` 등록과 `samrumantimer-` 캐시를 지운다(같은 localhost:3000이라 dev 청크가 캐시로 낡게 나오는 것을 막는다).
  - 캐시: `/_next/static/*`(해시 자산, 캐시 우선, 200개 상한)과 설치 때 받아 둔 `/offline.html`뿐이다. 상한을 넘으면 가장 오래 쓰지 않은 항목부터 지운다(적중 때 다시 넣어 순서를 갱신). 청크 URL에 빌드 ID가 없어 빌드 단위 정리는 하지 않는다.
  - 페이지 이동은 네트워크 전용이고, 네트워크 오류일 때만 오프라인 안내를 보여 준다. HTTP 오류 응답은 그대로 통과한다. HTML은 저장하지 않는다. 오프라인 응답은 원본의 보안 헤더(CSP·X-Frame-Options 등)를 그대로 담아 저장한다.
  - navigation preload는 켜지 않는다. 켜면 가로채지 않는 내비게이션(`/api/auth/callback`, 오버레이)에도 미리 받기 요청이 나가 같은 요청이 두 번 서버에 닿고, OAuth 인가 코드가 두 번 교환될 수 있다. 페이지 이동마다 SW 기동 시간만큼 지연되는 비용은 감수한다.
  - 가로채지 않음: `/api/*`(서버 계산 잔여시간, session/refresh 쿠키 회전), 오버레이 문서와 오버레이 문서가 보낸 하위 요청(referrer로 판정), GET 이외, 다른 출처, RSC 요청, `/_next/image`.
  - 오버레이(`/timers/<id>/overlay`)는 등록 컴포넌트가 등록하지 않고, 이미 SW가 있는 브라우저(설정 화면 iframe 미리보기 등)에서는 `sw.js`가 문서 요청과 referrer가 오버레이인 요청을 넘긴다. CSS가 부르는 폰트는 referrer가 CSS 파일이라 구분되지 않아 캐시를 탈 수 있다(해시 불변 파일이라 시간 표시에는 영향이 없다). `respondWith`는 동기로 불러야 해서 `clients.get()`으로 판정하지 않는다. 판정 규칙은 `src/lib/pwa.ts`와 `sw.js`에 중복되어 있고 `src/__tests__/sw.test.ts`가 일치를 확인한다.
  - 캐시 정책·오프라인 페이지를 바꾸면 `sw.js`의 `CACHE_VERSION`을 올린다. `activate`에서 이전 버전 캐시를 지운다. HTML을 캐시하지 않으므로 `skipWaiting`·`clients.claim`으로 바로 교체한다.
  - 로그아웃 시 캐시 정리는 하지 않는다. 사용자 데이터가 캐시에 들어가지 않기 때문이다. 나중에 HTML·API 응답을 캐시하게 되면 로그아웃 때 캐시를 지워야 한다.
- CSP: 지금은 `script-src`·`worker-src`·`default-src`가 없어 충돌하지 않는다. 이후 추가할 때는 `worker-src 'self'`와 `manifest-src 'self'`도 함께 둔다.
