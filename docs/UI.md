# UI 설계

## 페이지 구성

### 1. 홈 / 프로젝트 목록 (`/`, `/projects`)

- `/`는 `/projects`로 redirect한다.
- 로그인 시 '내 프로젝트' / '다른 프로젝트' 탭(탭마다 개수 표시)
- 검색 입력, 정렬(최신순·이름순), 페이지네이션(12개 단위)
- 프로젝트 카드 그리드 레이아웃
- 각 카드: 프로젝트 이름, 설명, 소유자, 생성일(상대 표기). 타이머가 없는 프로젝트에만 '타이머 없음'을 표시한다(타이머 상태는 목록 API에 없어 표시하지 않는다)
- 로그인 시 "새 프로젝트" 버튼 표시
- 반응형: 모바일 1열, 태블릿 2열, 데스크톱 3열

### 2. 프로젝트 상세 (`/projects/[id]`)

- 프로젝트 정보 헤더 (이름, 설명, 소유자)
- 프로젝트당 타이머 1개 — 해당 타이머의 상태를 바로 표시
  - 타이머 카드: 제목, 잔여 시간, 상태 뱃지
  - 상태 뱃지 색상: SCHEDULED(보라, '예약됨'), RUNNING(초록, '실행 중'), EXPIRED(빨강, '만료')
  - 잔여 시간은 클라이언트에서 1초마다 갱신 표시
  - 카드 전체가 타이머 상세(`/timers/[id]`)로 가는 링크이다
- 소유자인 경우 타이머가 없을 때 "타이머 만들기" 버튼 표시
- 헤더에 링크 복사 아이콘 버튼. 소유자에게는 통계(타이머가 있을 때)·프로젝트 삭제 버튼도 보인다. 이름·설명은 소유자가 인라인 편집(`EditableText`)
- 목표 섹션: '진행 중' / '종료' 탭으로 나눈 `GoalCard` 목록, 소유자는 '새 목표' 버튼(타이머가 있어야 활성) → '새 목표 설정' 대화상자(`GoalForm`, `FormDialog`). 타이머도 목표도 없으면 섹션을 숨긴다

### 3. 타이머 상세 (`/timers/[id]`)

핵심 페이지. 방송 화면에 띄우는 카운트다운은 별도의 오버레이 페이지(`/timers/[id]/overlay`)이고, 이 화면에서 오버레이 설정과 URL 복사를 한다. 다음 섹션으로 구성:

#### 카운트다운 디스플레이
- 큰 숫자로 잔여 시간 표시: `HH:MM:SS` 또는 `Dd HH:MM:SS`
- 만료 시 `00:00:00` + 만료 뱃지. 예약 시작 전(SCHEDULED)에는 시작 예정 시각을 표시한다
- 1초마다 클라이언트에서 갱신

#### 시간 조작 (소유자만)
- 프리셋 버튼: `+1시간`, `+5시간`, `+10시간` (직접 입력 값에 누적). '빠른 적용' 모드에서는 누르는 즉시 적용된다. 모바일(md 미만)에는 모드와 무관하게 즉시 적용되는 `+1h`/`+5h`/`+10h` 하단 고정 바가 있다
- 직접 입력: 시/분/초 입력 필드 + ADD/SUBTRACT 선택
- 시청자 닉네임 입력 필드 (확인 버튼으로 적용할 때 필수, 빠른 적용은 기본 닉네임으로 대체 가능, 최대 50자, placeholder: "시간 변경을 요청한 시청자", 기본 닉네임이 있으면 "기본: …" — 시간 변경을 요청한 시청자)
- "추가 확인" / "차감 확인" 버튼 (변경량 표시)
- 추가/차감 방향은 페이지가 상태 하나로 소유하고, 세그먼트·프리셋 라벨·키보드 단축키가 공유한다. 빠른 적용 모드에서 차감을 고르면 프리셋 라벨이 `-1시간`처럼 바뀌고, 차감 확인 버튼은 `danger` 스타일이다.
- 키보드 단축키 (소유자, RUNNING/EXPIRED, 입력 필드 밖에서만. 삭제 확인 창·오버레이 설정 모달이 열려 있으면 전부 꺼지고, 도움말이 열려 있으면 숫자키와 X만 꺼진다)

  | 키 | 동작 |
  |---|---|
  | `1` / `5` / `0` | 기본 닉네임으로 1/5/10시간을 선택한 방향(추가·차감)으로 즉시 적용 |
  | `X` | 추가/차감 전환 |
  | `R` | 수동 새로고침 |
  | `G` | 그래프 모드 전환 |
  | `?` | 단축키 도움말 |

  X·R·G는 한국어 IME가 켜져 있어도 동작하도록 문자 대신 `e.code`(`KeyX`/`KeyR`/`KeyG`)로 판별한다. 모든 단축키는 Cmd/Ctrl/Alt 조합을 무시해 브라우저 단축키(Cmd+1 탭 전환, Cmd+R 새로고침)를 막지 않는다. Tab은 포커스 이동에 쓰므로 단축키로 쓰지 않는다. 목록은 `SHORTCUT_HELP`(`src/hooks/useKeyboardShortcuts.ts`)와 맞춘다.

#### 로그 리스트
- 데스크톱(md 이상)은 테이블: 시각, 액션, 시청자, 변경량, 변경 전/후. 모바일은 카드 목록
- 최근 순 정렬
- 액션 타입별 색상 뱃지 (텍스트 병행)
  - CREATE(생성): 파랑
  - ADD(추가): 초록
  - SUBTRACT(차감): 빨강
  - EXPIRE(만료): 회색
  - REOPEN(재시작): 노랑(amber)
  - ACTIVATE(활성화): 청록
  - DELETE(삭제): 짙은 회색
- 페이지네이션 (하단)
- 액션 타입 필터: 토글 버튼 여러 개를 동시에 선택(`aria-pressed`), '초기화' 버튼

#### 소유자 도구
- 헤더 아이콘 버튼: 통계(`/timers/[id]/stats`), 링크 복사, 타이머 삭제. 통계·삭제는 소유자에게만 보인다
- 'OBS 오버레이 설정' 버튼 → `OverlaySettings` 모달

#### 그래프
- 모드 선택 탭: 잔여 시간 추이 | 누적 변경량 | 이벤트 빈도
- Recharts로 구현

### 4. 타이머 통계 (`/timers/[id]/stats`)

- 요약 카드(`StatsCardGrid`), 상위 후원자(`DonorRankingTable`), 시간대별 이벤트 횟수(`HourlyActivityChart`), 일별 활동 최근 30일(`DailyActivityChart`)

### 5. 오버레이 (`/timers/[id]/overlay`)

OBS 브라우저 소스용. 앱 크롬(헤더·푸터) 없이 카운트다운을 렌더링한다. 배경은 기본 투명이고 글꼴 크기·색·배경·위치 등은 쿼리 파라미터로 정한다.

방송 화면에는 오류 문구를 그리지 않는다. 실패는 브라우저 콘솔에 `console.warn`으로만 남기고, 같은 원인(상태 코드·네트워크 오류·해석 실패)은 바뀔 때 한 번만 남긴다.

**폴링** (`src/lib/overlay-polling.ts`): 성공하면 5초 간격. 실패가 이어지면 간격을 두 배씩 늘리고(10초 → 20초 → …) 성공하는 즉시 5초로 돌아간다. 오버레이는 방송 내내 켜져 있어서, 실패한 채 5초마다 두드리면 Workers 무료 요청 한도(하루 10만)를 낭비하기 때문이다. 상한은 원인별로 다르다.

| 원인 | 상한 |
|---|---|
| 404 (타이머 삭제·URL 오류) | 5분 |
| 429, JSON이 아닌 응답(Cloudflare 한도 초과 안내 페이지 등) | 5분 |
| 5xx, 그 밖의 실패 응답(401·403 포함), 네트워크 오류, 응답 처리 중 예외 | 60초 |

200이어도 본문이 JSON이 아니거나 `data`가 없으면 'JSON이 아닌 응답'과 같이 다룬다. `/api/timers/[id]`는 공개 엔드포인트라 401·403에 별도 분기를 두지 않고 그 밖의 실패 응답(60초 상한)으로 다룬다. 재귀 `setTimeout`으로 다음 요청을 예약하고, 언마운트하면 예약을 지우며 응답을 기다리던 중이면 다음 요청을 예약하지 않는다.

**렌더 오류** (`overlay/error.tsx`, `src/lib/overlay-recovery.ts`): 아무것도 그리지 않고 투명 배경과 오버레이 모드(`src/lib/overlay-mode.ts`)를 다시 적용한다. 페이지가 언마운트되며 이를 지우기 때문이다. `reset()`을 5초부터 두 배씩, 최대 60초 간격으로 다시 시도하고, 5번 실패하면 `location.reload()`한다. reload는 `sessionStorage` 카운터로 장애당 2번까지만 하고(저장소를 읽거나 쓸 수 없으면 하지 않는다), 그 뒤에는 60초 간격 `reset()`을 계속한다. 타이머를 그린 뒤 5분 동안 렌더 오류 없이 버텨야 회복으로 보고 횟수와 상한을 되돌린다. 그리기만 하면 바로 되돌리면, 데이터를 그린 다음에야 터지는 오류에서 백오프와 reload 상한이 매번 처음부터 시작돼 끝없이 돈다. 같은 오류가 5분 넘게 정상으로 버틴 뒤에야 다시 난다면 그때마다 새 장애로 보고 reload를 다시 2번까지 한다. `retry()`는 매번 RSC 요청을 보내므로 쓰지 않는다. 루트 레이아웃에서 난 오류는 `global-error.tsx`가 받는데, 오버레이 경로이면 투명한 빈 화면만 그리고 같은 정책(`src/hooks/useOverlayRecovery.ts`)으로 `reset()`·reload를 자동으로 시도한다.

### 6. 로그인 (`/login`, `/callback`)

CHZZK OAuth 로그인 진입 페이지. OAuth 콜백은 `/api/auth/callback`이 처리하고, `/callback` 페이지는 직접 들어오면 `/`로 보내기만 한다.

### 렌더 오류 경계

- `src/app/error.tsx`: 루트 레이아웃 아래 페이지의 렌더 오류. 헤더·푸터는 그대로 두고 본문을 `ErrorState` 안내로 바꾸며, 서버 로그와 맞춰 볼 수 있게 `digest`를 '오류 코드'로 보여 준다. '다시 시도'는 서버 컴포넌트까지 다시 받는 `retry()`를 쓴다.
- `src/app/global-error.tsx`: 루트 레이아웃(Header·Provider)에서 난 오류. 루트 레이아웃을 대신하므로 자체 `html`/`body`와 인라인 스타일을 쓴다. 오버레이 경로에서는 투명한 빈 화면만 보이게 하고, OBS에서는 아무도 버튼을 누르지 않으므로 오버레이 오류 경계와 같은 백오프·reload 상한으로 스스로 복구를 시도한다. 서버 렌더에서도 문구가 비치지 않도록 head 인라인 스크립트(클라이언트 렌더에서는 `useLayoutEffect`)가 `html[data-overlay]`를 붙이고 CSS로 숨긴다.
- 오버레이는 자체 경계를 둔다(5절).
- 렌더 오류는 브라우저에서만 일어나 서버 로그에 남지 않는다.

## 컴포넌트 계층

```
RootLayout (ThemeProvider, ToastProvider, SessionExpiredHandler)
├── Header (로고, 프로젝트 링크, ThemeToggle, 로그인/로그아웃)
│
├── ProjectListPage (/projects)
│   ├── CreateProjectForm
│   └── ProjectCard[]
│
├── ProjectDetailPage (/projects/[id])
│   ├── CreateTimerForm (FormDialog)
│   ├── 타이머 카드 (타이머 화면 링크, 프로젝트당 1개)
│   │   ├── CountdownDisplay (large)
│   │   └── Badge
│   └── GoalSection
│       ├── GoalForm (FormDialog)
│       └── GoalCard[] (GoalProgressBar)
│
├── TimerDetailPage (/timers/[id])
│   ├── CountdownDisplay (large)
│   ├── Badge
│   ├── TimerControls
│   ├── OverlaySettings (모달)
│   ├── 변경 기록 (테이블/카드, 액션 필터, Pagination)
│   └── 그래프
│       ├── GraphModeSelector
│       ├── RemainingChart (LineChart)
│       ├── CumulativeChart (AreaChart)
│       └── FrequencyChart (BarChart)
│
├── TimerStatsPage (/timers/[id]/stats)
│   ├── StatsCardGrid (StatsCard[])
│   ├── DonorRankingTable
│   ├── HourlyActivityChart
│   └── DailyActivityChart
│
└── Footer
```

공용 UI는 `src/components/ui/`(Badge, Button, Input, Pagination, ConfirmDialog, FormDialog, EditableText, ErrorState, Skeleton, Spinner, Toast, ThemeToggle, Icons)에 있다.

## Recharts 그래프 설계

### 모드 1: 잔여 시간 추이 (LineChart)

```tsx
<LineChart data={points}>
  <XAxis dataKey="timestamp" />
  <YAxis label="잔여 시간 (시)" />
  <Tooltip />
  <Line type="stepAfter" dataKey="remainingSeconds" />
</LineChart>
```

- X축: 시간 (로그 발생 시점)
- Y축: 잔여 시간 (초 → 시간 단위 변환 표시)
- stepAfter 보간: 이벤트 시점에 값이 변하고, 자연 감소는 직선으로 표현
- 포인트: 각 로그 이벤트 시점

### 모드 2: 누적 변경량 (AreaChart)

```tsx
<AreaChart data={points}>
  <XAxis dataKey="timestamp" />
  <YAxis label="누적 (시)" />
  <Tooltip />
  <Area type="monotone" dataKey="totalAdded" fill="green" />
  <Area type="monotone" dataKey="totalSubtracted" fill="red" />
</AreaChart>
```

- 누적 추가량 (초록 영역)과 누적 차감량 (빨강 영역)을 겹쳐 표시
- 시간에 따른 총 투입량 대비 차감량 시각화

### 모드 3: 이벤트 빈도 (BarChart)

```tsx
<BarChart data={buckets}>
  <XAxis dataKey="hour" />
  <YAxis label="이벤트 수" />
  <Tooltip />
  <Bar dataKey="adds" fill="green" stackId="a" />
  <Bar dataKey="subtracts" fill="red" stackId="a" />
</BarChart>
```

- 시간대별(1시간 단위) 이벤트 횟수
- ADD와 SUBTRACT를 스택 바로 구분
- 활발한 시간대 파악에 유용

## 반응형 디자인

| 브레이크포인트 | 레이아웃 |
|---------------|---------|
| < 640px (모바일) | 단일 열, 카운트다운 축소, 그래프는 컨테이너 폭에 맞춰 축소(ResponsiveContainer, 가로 스크롤 없음) |
| 640-1024px (태블릿) | 2열 그리드, 그래프 전체 폭 |
| > 1024px (데스크톱) | 3열 그리드, 타이머 상세 사이드바 레이아웃 가능 |

## 접근성 고려사항

- 시맨틱 HTML 사용 (button, nav, main, section)
- 색상만으로 상태를 구분하지 않음 (뱃지 텍스트 병행)
- 키보드 네비게이션 지원
- 적절한 aria-label 사용
