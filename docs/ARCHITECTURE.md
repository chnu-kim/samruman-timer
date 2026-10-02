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
    auth-fetch.ts                       — (클라이언트) 401이면 세션 만료 이벤트를 보내는 fetch 래퍼
    session-expired.ts                  — (클라이언트) 세션 만료 이벤트
    timer-sync.ts                       — (클라이언트) 폴링 값과 로컬 카운트다운 동기화
    overlay-animation.ts                — (클라이언트) 오버레이 변화량 애니메이션
    utils.ts                            — 공용 유틸

  types/
    index.ts                            — 공통 타입 정의

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
