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
| 배포 | Cloudflare Pages (@opennextjs/cloudflare) |

## 디렉토리 구조

```
src/
  app/
    layout.tsx                          — 루트 레이아웃
    page.tsx                            — 홈 (→ 프로젝트 목록)
    globals.css                         — Tailwind CSS 설정

    (auth)/
      login/page.tsx                    — 로그인 페이지
      callback/page.tsx                 — OAuth 콜백 처리 페이지

    projects/
      page.tsx                          — 프로젝트 목록
      [id]/page.tsx                     — 프로젝트 상세

    timers/
      [id]/page.tsx                     — 타이머 상세

    api/
      auth/
        login/route.ts                  — CHZZK OAuth 시작
        callback/route.ts               — OAuth 콜백 처리
        logout/route.ts                 — 로그아웃
        me/route.ts                     — 현재 사용자 정보
      projects/
        route.ts                        — 프로젝트 목록/생성
        [id]/
          route.ts                      — 프로젝트 상세
          timers/route.ts               — 타이머 목록/생성
      timers/
        [id]/
          route.ts                      — 타이머 상세
          modify/route.ts               — 시간 증감
          logs/route.ts                 — 로그 조회
          graph/route.ts                — 그래프 데이터

  components/
    timer/                              — 타이머 관련 컴포넌트
      CountdownDisplay.tsx              — 큰 카운트다운 숫자 표시
      TimerControls.tsx                 — 시간 증감 버튼, 입력 필드
      TimerCard.tsx                     — 타이머 목록용 카드
    project/                            — 프로젝트 관련 컴포넌트
      ProjectCard.tsx                   — 프로젝트 목록용 카드
      CreateProjectForm.tsx             — 프로젝트 생성 폼
    graph/                              — 그래프 컴포넌트
      RemainingChart.tsx                — 잔여 시간 추이 (LineChart)
      CumulativeChart.tsx               — 누적 변경량 (AreaChart)
      FrequencyChart.tsx                — 이벤트 빈도 (BarChart)
      GraphModeSelector.tsx             — 그래프 모드 선택 탭
    layout/                             — 레이아웃 컴포넌트
      Header.tsx                        — 상단 네비게이션
      Footer.tsx                        — 하단 푸터
    ui/                                 — 공통 UI 컴포넌트
      Button.tsx
      Badge.tsx
      Pagination.tsx
      Input.tsx

  lib/
    db.ts                               — D1 데이터베이스 헬퍼
    auth.ts                             — JWT 생성/검증, 세션 유틸
    timer.ts                            — 타이머 계산 로직
    chzzk.ts                            — CHZZK OAuth 클라이언트

  types/
    index.ts                            — 공통 타입 정의

proxy.ts                               — 인증 프록시

migrations/
  0001_initial.sql                      — 초기 DB 스키마

wrangler.toml                           — Cloudflare Workers 설정
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
  → 클라이언트: 주기적으로 서버에 재조회하여 동기화
```

### 시간 변경 흐름

```
클라이언트 → POST /api/timers/[id]/modify { action, deltaSeconds, actorName }
  → 프록시: JWT 검증 → 소유자 확인
  → 서버: 현재 remaining 계산
  → 서버: 새 remaining 계산 (ADD/SUBTRACT)
  → 서버: DB 업데이트 (baseRemainingSeconds, lastCalculatedAt, status)
  → 서버: timer_logs에 로그 기록
  → 응답: { remainingSeconds, status, log }
  → 클라이언트: UI 즉시 반영
```

### 인증 흐름

```
클라이언트 → GET /api/auth/login
  → 302 → CHZZK OAuth 동의
  → 302 → /api/auth/callback?code=xxx
  → 서버: 토큰 교환 → 사용자 정보 조회/생성
  → 서버: JWT 생성 → httpOnly 쿠키 설정
  → 302 → /
```

## Cloudflare 배포

### @opennextjs/cloudflare 어댑터

Next.js를 Cloudflare Workers/Pages에서 실행하기 위한 어댑터를 사용한다.

### wrangler.toml 설정

```toml
name = "samrumantimer"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "samrumantimer-db"
database_id = "<DATABASE_ID>"
```

### D1 바인딩 접근

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

Cloudflare Workers의 환경변수(Secrets)로 관리:

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

# 마이그레이션 적용
wrangler d1 migrations apply samrumantimer-db

# 배포
npx opennextjs-cloudflare && wrangler pages deploy
```
