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

### 2. 프로젝트 상세 = 타이머 콘솔 (`/projects/[id]`)

핵심 페이지. 프로젝트와 타이머가 1:1이라 이 화면 하나에서 방송 중 조작을 한다. 방송 화면에 띄우는 카운트다운은 별도의 오버레이 페이지(`/timers/[id]/overlay`)이고, 이 화면에서 오버레이 설정과 URL 복사를 한다. 화면의 이름은 프로젝트 이름 하나다(타이머 제목은 오버레이의 '타이틀 표시'에만 쓰인다).

#### 헤더
- 프로젝트 이름·설명. 소유자는 인라인 편집(`EditableText`). 시청자에게는 소유자 닉네임을 함께 보여 준다
- 소유자: `OBS 오버레이`(→ `OverlaySettings` 모달)·`통계`(`/timers/[id]/stats`) 글자 버튼(타이머가 있을 때)과 더보기 버튼(`MoreMenu`: 링크 복사, 타이머 삭제, 프로젝트 삭제)
- 시청자: 링크 복사 아이콘 버튼만
- 더보기는 `aria-expanded` disclosure 패턴이다(`role="menu"` 아님). Escape·바깥 클릭으로 닫히고 포커스는 트리거로 돌아간다
- 타이머만 삭제하면 화면에 남아 '타이머 없음' 상태가 되고 목표 기록은 그대로 보인다

#### 타이머가 없을 때
- '아직 타이머가 없습니다'와 소유자에게 "타이머 만들기" 버튼(`CreateTimerForm`, 오버레이 제목을 프로젝트 이름으로 미리 채운다)
- 목표가 남아 있으면 그 아래 목표 섹션을 보여 준다. 타이머도 목표도 없으면 숨긴다

#### 타이머가 있을 때 (`TimerConsole`)
화면 순서: 카운트다운 → 시간 조작 | 목표 → 최근 변경 | 잔여 시간 추이. 넓은 화면(lg 이상)에서 `|` 양쪽이 3:2로 나란히, 그보다 좁으면 세로로 쌓인다. 시간 조작 카드와 목표를 첫 화면에 함께 두는 것이 목적이다.

- 카운트다운: 큰 숫자 `HH:MM:SS` + 상태 뱃지(SCHEDULED 보라 '예약됨', RUNNING 초록 '실행 중', EXPIRED 빨강 '만료'). 실행 중에는 '종료 예정' 시각을, 예약 상태에는 시작 예정 시각을 보여 준다. 생성 시각부터 잰 경과는 다시 시작한 타이머에서 실제 진행 시간과 어긋나 보여 주지 않는다. 0에 닿으면 다음 폴링을 기다리지 않고 뱃지를 '만료'로 바꾼다
- 동기화: 상세 API를 RUNNING 5초·그 외 15초로 폴링한다(폴링은 콘솔 한 곳에서만). 다른 기기의 조작이나 상태 전이를 감지하면 기록·그래프·목표를 다시 불러온다. 폴링이 404를 받으면(다른 탭·기기에서 타이머 삭제) 알림을 띄우고 '타이머 없음' 상태로 바꾼다
- 목표: 시간 조작 옆 카드. '진행 중' / '종료' 탭으로 나눈 `GoalCard` 목록, 소유자는 '새 목표' 버튼 → '새 목표 설정' 대화상자(`GoalForm`, `FormDialog`). 여기서 시간을 바꾸면 곧바로 목표를 다시 불러온다. 시청자에게는 목표가 있을 때만 보인다
  - 카드에는 상시 버튼을 두지 않고 소유자에게만 카드별 더보기(`MoreMenu`) 하나: 진행 중은 '목표 취소'(종료 탭에 기록으로 남음), 실패·취소로 끝난 목표는 '삭제'(기록에서 사라짐). 달성한 목표는 동작이 없다
  - 진행 중 탭의 카드에는 상태 배지를 두지 않는다(탭 이름과 중복). 종료 탭에서만 달성·실패·취소 배지
  - 방송 시간 목표는 '퍼센트 · 방송 n 경과 / 목표', 데드라인 목표는 퍼센트 대신 마감 시각·남은 기간과, 타이머 종료 예정보다 마감이 늦으면 '종료 예정보다 뒤'

#### 시간 조작 (소유자만)
- 시청자 닉네임과 추가/차감 세그먼트는 md 이상에서 한 줄. 닉네임은 확인 버튼으로 적용할 때 필수, 최대 50자, placeholder "시간 변경을 요청한 시청자"(기본 닉네임이 있으면 "기본: …"). 최근 닉네임 칩, 기본 닉네임 설정·해제
- 프리셋 버튼 `+1시간`, `+5시간`, `+10시간`은 시/분/초 입력값에 더하기만 한다. 적용은 확인 버튼으로 한다. 라벨은 늘 동사다: "시간 추가 (1시간 30분)" / "시간 차감 (…)"(변경량 표시, 차감은 `danger` 스타일). 값이 0이면 "시간 추가"로 비활성이고, 입력칸 아래 "시간을 입력하면 추가할 수 있습니다."가 이유를 알린다(`aria-describedby`)
- 분·초에 60 이상을 넣으면 자르지 않고 윗자리로 올린다(90분 → 1시간 30분, 75초 → 1분 15초. `src/lib/timer-input.ts`). 결과는 버튼 라벨이 보여 주므로 범위 안내 문구는 두지 않는다. 새 타이머 만들기의 초기 시간도 같은 규칙이고, 0이면 '타이머 만들기'가 비활성이다
- 입력부는 `<form>`이라 닉네임·시간 입력칸에서 Enter로 제출된다. 한국어 IME 조합 중의 Enter(`isComposing`/keyCode 229)는 제출하지 않는다
- 즉시 적용은 두 곳뿐이다: 모바일(md 미만) 하단 고정 바(`+1h`/`+5h`/`+10h`, 차감이면 `-1h`처럼 바뀌고 기록될 닉네임을 항상 표시)와 숫자 단축키. 두 곳 모두 같은 규칙(`resolveQuickActor`)으로 닉네임을 정한다: 입력란의 시청자 닉네임이 우선이고, 비어 있으면 기본 닉네임. 예전의 '빠른 적용' 모드 토글은 일반 모드와 차이가 직관적이지 않아 없앴다
- 추가/차감 방향은 콘솔이 상태 하나로 소유하고, 세그먼트·하단 바 라벨·키보드 단축키가 공유한다
- 키보드 단축키 (소유자, RUNNING/EXPIRED, 입력 필드 밖에서만. 화면에 모달(`dialog[open]` 또는 `aria-modal="true"`)이 열려 있으면 숫자키와 X는 꺼진다. 목표 폼·삭제 확인·오버레이 설정 위에서 뒤쪽 타이머가 바뀌지 않게 하기 위해서다)

  | 키 | 동작 |
  |---|---|
  | `1` / `5` / `0` | 입력한 시청자 닉네임(비어 있으면 기본 닉네임)으로 1/5/10시간을 선택한 방향(추가·차감)으로 즉시 적용. 둘 다 없으면 안내 토스트만 띄운다 |
  | `X` | 추가/차감 전환 |
  | `R` | 수동 새로고침 |
  | `?` | 단축키 도움말 |

  X·R은 한국어 IME가 켜져 있어도 동작하도록 문자 대신 `e.code`(`KeyX`/`KeyR`)로 판별한다. 모든 단축키는 Cmd/Ctrl/Alt 조합을 무시해 브라우저 단축키(Cmd+1 탭 전환, Cmd+R 새로고침)를 막지 않는다. Tab은 포커스 이동에 쓰므로 단축키로 쓰지 않는다. 목록은 `SHORTCUT_HELP`(`src/hooks/useKeyboardShortcuts.ts`)와 맞춘다.

#### 변경 기록
- 기본은 '최근 변경' 5건. '전체 기록'으로 펼치면 '변경 기록'(20건 단위 페이지네이션)과 액션 타입 필터(토글 여러 개 동시 선택, `aria-pressed`, '초기화')가 생긴다
- 각 행: 액션 뱃지, 시청자, 변경량, 시각, 변경 전 → 후. 최근 순
- 액션 타입별 색상 뱃지 (텍스트 병행)
  - CREATE(생성): 파랑
  - ADD(추가): 초록
  - SUBTRACT(차감): 빨강
  - EXPIRE(만료): 회색
  - REOPEN(재시작): 노랑(amber)
  - ACTIVATE(활성화): 청록
  - DELETE(삭제): 짙은 회색

#### 그래프
- 잔여 시간 추이(`RemainingChart`) 하나. 누적 변경량은 통계 화면에 있고, 이벤트 빈도는 통계의 시간대별 이벤트 횟수와 겹쳐 없앴다

#### OBS 오버레이 설정 (`OverlaySettings`)
- '타이틀 표시'를 켜면 '표시할 제목'(타이머 제목, 1~100자)을 고칠 수 있다. 다른 설정과 같은 저장 버튼으로 저장되고 저장 전 변경·닫기 경고에 포함된다. 제목은 오버레이가 폴링으로 다시 읽으므로 URL을 다시 붙여넣지 않아도 반영된다

### 3. 타이머 주소 (`/timers/[id]`)

타이머를 조회해 상위 프로젝트(`/projects/[projectId]`)로 `router.replace`한다. 타이머 조작을 프로젝트 화면으로 합친 뒤에도 예전에 공유한 타이머 주소가 계속 열리게 하기 위해서다. 없는 타이머면 안내(`ErrorState`)를, 일시적 오류면 다시 시도 버튼을 보여 준다. 오버레이(`/timers/[id]/overlay`)와 통계(`/timers/[id]/stats`)는 타이머 주소에 그대로 있다.

### 4. 타이머 통계 (`/timers/[id]/stats`)

- 요약 카드(`StatsCardGrid`), 상위 후원자(`DonorRankingTable`), 누적 변경량(`CumulativeChart`, 불러오지 못하면 이 섹션만 숨긴다), 시간대별 이벤트 횟수(`HourlyActivityChart`), 일별 활동 최근 30일(`DailyActivityChart`)
- 제목은 프로젝트 이름 기준(「프로젝트 이름 통계」), 복귀 링크는 프로젝트 화면

### 5. 오버레이 (`/timers/[id]/overlay`)

OBS 브라우저 소스용. 앱 크롬(헤더·푸터) 없이 카운트다운을 렌더링한다. 배경은 기본 투명이고 글꼴 크기·색·배경·위치 등은 쿼리 파라미터로 정한다.

방송 화면에는 오류 문구를 그리지 않는다. 실패는 브라우저 콘솔에 `console.warn`으로만 남기고, 같은 원인(상태 코드·네트워크 오류·해석 실패)은 바뀔 때 한 번만 남긴다.

실패해도 대개는 마지막으로 받은 값을 유지하고 로컬 카운트를 이어 간다(5xx·네트워크 오류는 곧 회복되는 경우가 많다). 예외는 404·410(타이머 삭제·URL 오류)이다. 이때는 카운트다운을 지워 설정한 배경만 남긴다. 삭제된 타이머의 시간을 계속 세면 거짓 시간이 방송에 나가기 때문이다. 타이머 삭제 확인 창도 "삭제하면 방송 화면의 오버레이가 사라지며"로 이 동작을 알린다.

**폴링** (`src/lib/overlay-polling.ts`): 성공하면 5초 간격. 실패가 이어지면 간격을 두 배씩 늘리고(10초 → 20초 → …) 성공하는 즉시 5초로 돌아간다. 오버레이는 방송 내내 켜져 있어서, 실패한 채 5초마다 두드리면 Workers 무료 요청 한도(하루 10만)를 낭비하기 때문이다. 상한은 원인별로 다르다.

| 원인 | 상한 |
|---|---|
| 404·410 (타이머 삭제·URL 오류) | 5분 |
| 429, 200인데 JSON이 아니거나 `data`가 없는 응답 | 5분 |
| 5xx, 그 밖의 실패 응답(401·403 포함), 네트워크 오류, 응답 처리 중 예외 | 60초 |

200이어도 본문이 JSON이 아니거나 `data`가 없으면 5분 상한으로 다룬다. 실패 상태 코드는 본문 형식과 무관하게 상태 코드로만 판정한다(프록시·CDN의 HTML 502/503/504는 60초 상한). `/api/timers/[id]`는 공개 엔드포인트라 401·403에 별도 분기를 두지 않고 그 밖의 실패 응답(60초 상한)으로 다룬다. 재귀 `setTimeout`으로 다음 요청을 예약하고, 언마운트하면 예약을 지우며 응답을 기다리던 중이면 다음 요청을 예약하지 않는다.

**렌더 오류** (`overlay/error.tsx`, `src/lib/overlay-recovery.ts`): 아무것도 그리지 않고 투명 배경과 오버레이 모드(`src/lib/overlay-mode.ts`)를 다시 적용한다. 페이지가 언마운트되며 이를 지우기 때문이다. `reset()`을 5초부터 두 배씩, 최대 60초 간격으로 다시 시도하고, 5번 실패하면 `location.reload()`한다. reload는 `sessionStorage` 카운터로 장애당 2번까지만 하고(저장소를 읽거나 쓸 수 없으면 하지 않는다), 그 뒤에는 60초 간격 `reset()`을 계속한다. 타이머를 그린 뒤 5분 동안 렌더 오류 없이 버텨야 회복으로 보고 횟수와 상한을 되돌린다. 그리기만 하면 바로 되돌리면, 데이터를 그린 다음에야 터지는 오류에서 백오프와 reload 상한이 매번 처음부터 시작돼 끝없이 돈다. 같은 오류가 5분 넘게 정상으로 버틴 뒤에야 다시 난다면 그때마다 새 장애로 보고 reload를 다시 2번까지 한다. `retry()`는 매번 RSC 요청을 보내므로 쓰지 않는다. 루트 레이아웃에서 난 오류는 `global-error.tsx`가 받는데, 오버레이 경로이면 투명한 빈 화면만 그리고 같은 정책(`src/hooks/useOverlayRecovery.ts`)으로 `reset()`·reload를 자동으로 시도한다.

PWA 서비스워커는 OBS 브라우저 소스에서 등록하지 않는다. 이미 SW가 있는 브라우저(설정 화면의 iframe 미리보기, 오버레이 URL을 직접 연 탭)에서도 오버레이 문서 요청과 그 문서가 보낸 청크 요청(referrer가 오버레이)은 가로채지 않는다. 예외로 CSS가 부르는 폰트는 referrer가 CSS 파일이라 해시 정적 자산 캐시를 탈 수 있다. 방송 화면에 오프라인 안내나 오래된 시간이 나가지 않게 하기 위해서다 (`docs/ARCHITECTURE.md`의 PWA 절).

### 6. 로그인 (`/login`, `/callback`)

CHZZK OAuth 로그인 진입 페이지. OAuth 콜백은 `/api/auth/callback`이 처리하고, `/callback` 페이지는 직접 들어오면 `/`로 보내기만 한다.

### 렌더 오류 경계

- `src/app/error.tsx`: 루트 레이아웃 아래 페이지의 렌더 오류. 헤더·푸터는 그대로 두고 본문을 `ErrorState` 안내로 바꾸며, 서버 로그와 맞춰 볼 수 있게 `digest`를 '오류 코드'로 보여 준다. '다시 시도'는 서버 컴포넌트까지 다시 받는 `retry()`를 쓴다.
- `src/app/global-error.tsx`: 루트 레이아웃(Header·Provider)에서 난 오류. 루트 레이아웃을 대신하므로 자체 `html`/`body`와 인라인 스타일을 쓴다. 오버레이 경로에서는 투명한 빈 화면만 보이게 하고, OBS에서는 아무도 버튼을 누르지 않으므로 오버레이 오류 경계와 같은 백오프·reload 상한으로 스스로 복구를 시도한다. 서버 렌더에서도 문구가 비치지 않도록 head 인라인 스크립트(클라이언트 렌더에서는 `useLayoutEffect`)가 `html[data-overlay]`를 붙이고 CSS로 숨긴다.
- 오버레이는 자체 경계를 둔다(5절).
- 렌더 오류는 브라우저에서만 일어나 서버 로그에 남지 않는다.

### 찾을 수 없음·권한 없음

`ErrorState`는 두 톤을 쓴다. 다시 시도로 풀릴 수 있는 실패(불러오기 실패, 렌더 오류)는 빨간 아이콘과 '다시 시도'(`tone="error"`, 기본). 다시 시도해도 결과가 같은 안내(없는 경로, 없는 프로젝트·타이머, 비소유자 통계)는 중립 아이콘·h1·돌아갈 링크 하나(`tone="neutral"`, `title`, `action`)다. 로그인 버튼은 헤더에 있으므로 본문에 두지 않는다.

- `src/app/not-found.tsx`: 없는 경로. 루트 레이아웃 안이라 헤더·푸터·앱 배경이 그대로다. h1 '페이지를 찾을 수 없습니다' + '프로젝트 목록으로'.
- 없는 프로젝트(`/projects/[id]`)·타이머(`/timers/[id]`): '…를 찾을 수 없습니다' + '프로젝트 목록으로'.
- 통계(`/timers/[id]/stats`): 401·403이면 '통계를 볼 수 없습니다' + '프로젝트로 돌아가기'(타이머 조회가 실패하면 '프로젝트 목록으로'), 404면 '타이머를 찾을 수 없습니다'.

## 컴포넌트 계층

```
RootLayout (ThemeProvider, ToastProvider, SessionExpiredHandler)
├── Header (로고, 프로젝트 링크, ThemeToggle, 로그인/로그아웃)
│
├── ProjectListPage (/projects)
│   ├── CreateProjectForm
│   └── ProjectCard[]
│
├── ProjectDetailPage (/projects/[id])  — 조작 콘솔
│   ├── 헤더 (EditableText, OBS 오버레이·통계 버튼, MoreMenu)
│   ├── CreateTimerForm (FormDialog, 타이머가 없을 때)
│   ├── OverlaySettings (모달, 표시할 제목 포함)
│   └── TimerConsole
│       ├── CountdownDisplay (large) + Badge
│       ├── TimerControls (소유자)
│       ├── GoalSection (aside)
│       │   ├── GoalForm (FormDialog)
│       │   └── GoalCard[] (GoalProgressBar)
│       ├── 변경 기록 (최근 5건 / 펼치면 필터·Pagination)
│       └── RemainingChart (LineChart)
│
├── TimerRedirectPage (/timers/[id])  — 상위 프로젝트로 replace
│
├── TimerStatsPage (/timers/[id]/stats)
│   ├── StatsCardGrid (StatsCard[])
│   ├── DonorRankingTable
│   ├── CumulativeChart (AreaChart)
│   ├── HourlyActivityChart
│   └── DailyActivityChart
│
└── Footer
```

공용 UI는 `src/components/ui/`(Badge, Button, Input, Pagination, ConfirmDialog, FormDialog, EditableText, ErrorState, MoreMenu, Skeleton, Spinner, Toast, ThemeToggle, Icons)에 있다.

테마는 `src/lib/theme.ts`의 `applyTheme` 하나로 정한다. 저장값(`localStorage.theme`)이 `light`·`dark`면 그대로, `system`이거나 없으면 OS 설정을 따라 html에 `dark`·`light` 중 정확히 하나만 붙인다. 레이아웃의 첫 페인트 전 인라인 스크립트도 같은 함수 소스를 실행한다. `ThemeToggle`은 라이트 → 다크 → 시스템 순으로 돌고, 이름은 "테마: 다크 (눌러서 시스템으로)"처럼 지금 상태와 다음 동작을 함께 알린다.

## Recharts 그래프 설계

### 공통 축·접근성

- X축: 로그 발생 시각(ms)을 `type="number" scale="time"`으로 그린다. 기록 순번(category 축)으로 그리면 같은 분에 몰린 기록과 몇 시간 뒤 기록이 같은 간격이 되고, 눈금 라벨이 같은 값으로 되풀이된다. 눈금은 `buildTimeAxis`(`src/lib/utils.ts`)가 로컬 시각의 깔끔한 경계(5분·1시간·3시간·자정 등)에 최대 5개 두고, 라벨은 `HH:mm`이다. 눈금이 여러 날에 걸치면 첫 눈금과 날짜가 바뀌는 눈금에만 `MM. DD.`를 붙인다
- Y축: `durationAxisTicks`가 0부터 정수 시간(1·2·3·4·5·6·10·12·…·25·50·100시간) 또는 분(1·2·5·10·15·30분) 간격으로 최대 4칸을 만들고, 라벨은 `4시간`·`30분`처럼 한국어 한 단위다
- 접근성: Recharts `accessibilityLayer={false}`로 내부 Tab 정지점·눈금 나열 이름을 없애고, 감싸는 `role="img"`의 `aria-label`에 요약을 넣는다(잔여: 기록 수·마지막 기록·최고값, 누적: 누적 추가·차감)

### 잔여 시간 추이 (LineChart, 콘솔)

```tsx
<LineChart data={points} accessibilityLayer={false}>
  <XAxis dataKey="t" type="number" scale="time" ticks={...} />
  <YAxis ticks={durationAxisTicks(max)} />
  <Tooltip />
  <Line type="stepAfter" dataKey="remainingSeconds" stroke="var(--color-accent)" />
</LineChart>
```

- 점: 각 로그 이벤트 시점의 변경 후 잔여 시간(`after_seconds`)
- stepAfter 보간: 이벤트 시점에 값이 바뀐다. 실행 중 자연 감소는 그리지 않는다(점 사이가 평평하다)
- 선 색은 앱 강조색 토큰(`--color-accent`)

### 누적 변경량 (AreaChart, 통계 화면)

```tsx
<AreaChart data={points} accessibilityLayer={false}>
  <XAxis dataKey="t" type="number" scale="time" ticks={...} />
  <YAxis ticks={durationAxisTicks(max)} />
  <Tooltip />
  <Area type="stepAfter" dataKey="totalAdded" fill="green" />
  <Area type="stepAfter" dataKey="totalSubtracted" fill="red" />
</AreaChart>
```

- 누적 추가량 (초록 영역)과 누적 차감량 (빨강 영역)을 겹쳐 표시
- 누적량은 이벤트 시점에만 바뀌므로 stepAfter로 그린다. 곡선(monotone)은 이벤트 사이에 없는 중간값을 그린다

그래프 API(`/api/timers/[id]/graph`)는 `mode=frequency`(시간대별 이벤트 횟수)도 계속 지원하지만, 화면에서는 통계의 `HourlyActivityChart`가 같은 정보를 보여 주므로 쓰지 않는다.

## 반응형 디자인

| 브레이크포인트 | 레이아웃 |
|---------------|---------|
| < 640px (모바일) | 단일 열, 카운트다운 축소, 그래프는 컨테이너 폭에 맞춰 축소(ResponsiveContainer, 가로 스크롤 없음) |
| 640-1024px (태블릿) | 2열 그리드, 그래프 전체 폭 |
| > 1024px (데스크톱) | 3열 그리드, 콘솔의 시간 조작·목표와 기록·그래프를 3:2로 나란히 |

## 접근성 고려사항

- 시맨틱 HTML 사용 (button, nav, main, section)
- 색상만으로 상태를 구분하지 않음 (뱃지 텍스트 병행)
- 키보드 네비게이션 지원
- 적절한 aria-label 사용
