---
name: progress-check
description: 프로젝트 구현 진행 상태를 체크하고 우선순위 TODO를 출력한다
user_invocable: true
---

# 구현 진행 상태 체크

`docs/ARCHITECTURE.md` 기준 예상 파일 목록의 존재 여부와 구현 정도를 확인하여, 영역별 완료율과 의존성 기반 우선순위 TODO 체크리스트를 출력한다.

## 동작 순서

### 1단계: 설계 문서에서 예상 파일 목록 확인

`docs/ARCHITECTURE.md`를 읽어 디렉토리 구조와 파일 목록을 파악한다.

### 2단계: 파일 존재 여부 확인

아래 **38개 파일**을 Glob으로 확인한다. 각 영역별로 그룹화하여 체크:

**Config (2개)**
- `wrangler.toml`
- `migrations/0001_initial.sql`

**Types (1개)**
- `src/types/index.ts`

**Core Lib (4개)**
- `src/lib/db.ts`
- `src/lib/auth.ts`
- `src/lib/timer.ts`
- `src/lib/chzzk.ts`

**Auth - Proxy (1개)**
- `src/proxy.ts`

**Auth - API Routes (4개)**
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/callback/route.ts`
- `src/app/api/auth/logout/route.ts`
- `src/app/api/auth/me/route.ts`

**Auth - Pages (2개)**
- `src/app/(auth)/login/page.tsx`
- `src/app/(auth)/callback/page.tsx`

**API Routes (7개)**
- `src/app/api/projects/route.ts`
- `src/app/api/projects/[id]/route.ts`
- `src/app/api/projects/[id]/timers/route.ts`
- `src/app/api/timers/[id]/route.ts`
- `src/app/api/timers/[id]/modify/route.ts`
- `src/app/api/timers/[id]/logs/route.ts`
- `src/app/api/timers/[id]/graph/route.ts`

**Pages (5개)**
- `src/app/page.tsx`
- `src/app/layout.tsx`
- `src/app/projects/page.tsx`
- `src/app/projects/[id]/page.tsx`
- `src/app/timers/[id]/page.tsx`

**Components - Timer (3개)**
- `src/components/timer/CountdownDisplay.tsx`
- `src/components/timer/TimerControls.tsx`
- `src/components/timer/TimerCard.tsx`

**Components - Project (2개)**
- `src/components/project/ProjectCard.tsx`
- `src/components/project/CreateProjectForm.tsx`

**Components - Graph (4개)**
- `src/components/graph/RemainingChart.tsx`
- `src/components/graph/CumulativeChart.tsx`
- `src/components/graph/FrequencyChart.tsx`
- `src/components/graph/GraphModeSelector.tsx`

**Components - Layout (2개)**
- `src/components/layout/Header.tsx`
- `src/components/layout/Footer.tsx`

**Components - UI (4개)**
- `src/components/ui/Button.tsx`
- `src/components/ui/Badge.tsx`
- `src/components/ui/Pagination.tsx`
- `src/components/ui/Input.tsx`

### 3단계: 구현 수준 판별

존재하는 파일의 **첫 50줄**을 Read로 읽어, 아래 기준으로 구분:

- **미존재**: 파일 없음
- **보일러플레이트**: Next.js 기본 생성 코드만 존재 (예: `page.tsx`의 Vercel 로고 기본 페이지)
- **부분 구현**: 프로젝트 관련 코드가 있으나 설계 대비 미완성
- **구현 완료**: 설계 문서 기반 요구사항을 충족

### 4단계: 결과 출력

아래 형식으로 출력:

```
## 📊 구현 진행 상태

| 영역 | 완료 | 부분 | 미구현 | 완료율 |
|------|------|------|--------|--------|
| Config & DB | ?/2 | ? | ? | ??% |
| Types | ?/1 | ? | ? | ??% |
| Core Lib | ?/4 | ? | ? | ??% |
| Auth Flow | ?/7 | ? | ? | ??% |
| API Routes | ?/7 | ? | ? | ??% |
| UI Components | ?/15 | ? | ? | ??% |
| Pages | ?/5 | ? | ? | ??% |
| **전체** | **?/41** | **?** | **?** | **??%** |

## 🔜 우선순위 TODO (의존성 순서)

### P1: Config & DB (의존 없음)
- [ ] `wrangler.toml` — D1 바인딩, 환경변수 설정
- [ ] `migrations/0001_initial.sql` — 초기 스키마 (docs/DATABASE.md 참조)

### P2: Types (DB 스키마 기반)
- [ ] `src/types/index.ts` — DB 행 타입 + API 요청/응답 타입

### P3: Core Lib (Types 의존)
- [ ] `src/lib/db.ts` — D1 헬퍼 (getDB, generateId)
- [ ] `src/lib/auth.ts` — JWT 생성/검증, 쿠키 관리
- [ ] `src/lib/timer.ts` — 잔여 시간 계산, 상태 전이
- [ ] `src/lib/chzzk.ts` — CHZZK OAuth API 호출

### P4: Auth Flow (Core Lib 의존)
- [ ] `src/proxy.ts` — JWT 검증 프록시
- [ ] Auth API routes (login, callback, logout, me)
- [ ] Auth pages (login, callback)

### P5: API Routes (Auth + Core Lib 의존)
- [ ] Projects CRUD (3개 route)
- [ ] Timers CRUD + 부가 기능 (4개 route)

### P6: UI Components (Types 의존)
- [ ] Layout (Header, Footer)
- [ ] UI 기본 (Button, Badge, Pagination, Input)
- [ ] Timer (CountdownDisplay, TimerControls, TimerCard)
- [ ] Project (ProjectCard, CreateProjectForm)
- [ ] Graph (4개 차트 컴포넌트)

### P7: Pages (Components + API 의존)
- [ ] `src/app/page.tsx` — 메인 페이지 (리다이렉트 or 대시보드)
- [ ] `src/app/projects/page.tsx` — 프로젝트 목록
- [ ] `src/app/projects/[id]/page.tsx` — 프로젝트 상세
- [ ] `src/app/timers/[id]/page.tsx` — 타이머 상세

## 💡 다음 추천 작업
(가장 높은 우선순위의 미완성 작업 1~3개를 구체적으로 제안)
```

완료된 항목은 체크리스트에서 `[x]`로 표시하고, TODO에서 제외한다.