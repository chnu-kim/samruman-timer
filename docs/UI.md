# UI 설계

## 페이지 구성

### 1. 홈 / 프로젝트 목록 (`/`, `/projects`)

- 프로젝트 카드 그리드 레이아웃
- 각 카드: 프로젝트 이름, 설명, 소유자, 타이머 수, 생성일
- 로그인 시 "새 프로젝트" 버튼 표시
- 반응형: 모바일 1열, 태블릿 2열, 데스크톱 3열

### 2. 프로젝트 상세 (`/projects/[id]`)

- 프로젝트 정보 헤더 (이름, 설명, 소유자)
- 프로젝트당 타이머 1개 — 해당 타이머의 상태를 바로 표시
  - 타이머 카드: 제목, 잔여 시간, 상태 뱃지
  - 상태 뱃지 색상: RUNNING(초록), EXPIRED(빨강)
  - 잔여 시간은 클라이언트에서 1초마다 갱신 표시
- 소유자인 경우 타이머가 없을 때 "새 타이머" 버튼 표시

### 3. 타이머 상세 (`/timers/[id]`)

핵심 페이지. OBS 브라우저 소스로 등록하여 방송 화면에 카운트다운 오버레이로 활용하는 핵심 화면이다. 다음 섹션으로 구성:

#### 카운트다운 디스플레이
- 큰 숫자로 잔여 시간 표시: `HH:MM:SS` 또는 `Dd HH:MM:SS`
- 만료 시 `00:00:00` + EXPIRED 뱃지
- 1초마다 클라이언트에서 갱신

#### 시간 조작 (소유자만)
- 프리셋 버튼: `+1시간`, `+5시간`, `+10시간`
- 직접 입력: 시/분/초 입력 필드 + ADD/SUBTRACT 선택
- 시청자 닉네임 입력 필드 (필수, 최대 50자, placeholder: "시청자 닉네임" — 시간 변경을 요청한 시청자)
- "적용" 버튼

#### 로그 리스트
- 테이블 형태: 시각, 액션, 변경자, 변경량, 변경 전/후
- 최근 순 정렬
- 액션 타입별 색상/아이콘
  - CREATE: 파랑
  - ADD: 초록
  - SUBTRACT: 빨강
  - EXPIRE: 회색
  - REOPEN: 노랑
- 페이지네이션 (하단)
- 액션 타입 필터 (선택)

#### 그래프
- 모드 선택 탭: 잔여 시간 추이 | 누적 변경량 | 이벤트 빈도
- Recharts로 구현

## 컴포넌트 계층

```
App
├── Header
│   ├── Logo
│   ├── Navigation
│   └── UserMenu (로그인/로그아웃)
│
├── ProjectListPage
│   ├── CreateProjectForm (모달 또는 인라인)
│   └── ProjectCard[]
│
├── ProjectDetailPage
│   ├── ProjectHeader
│   ├── CreateTimerForm (모달 또는 인라인)
│   └── TimerCard[]
│       ├── CountdownDisplay (소형)
│       └── StatusBadge
│
├── TimerDetailPage
│   ├── CountdownDisplay (대형)
│   ├── StatusBadge
│   ├── TimerControls
│   │   ├── PresetButtons
│   │   ├── CustomInput
│   │   └── ActorNameInput
│   ├── LogTable
│   │   ├── LogRow[]
│   │   ├── ActionTypeFilter
│   │   └── Pagination
│   └── GraphSection
│       ├── GraphModeSelector
│       ├── RemainingChart (LineChart)
│       ├── CumulativeChart (AreaChart)
│       └── FrequencyChart (BarChart)
│
└── Footer
```

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
| < 640px (모바일) | 단일 열, 카운트다운 축소, 그래프 가로 스크롤 |
| 640-1024px (태블릿) | 2열 그리드, 그래프 전체 폭 |
| > 1024px (데스크톱) | 3열 그리드, 타이머 상세 사이드바 레이아웃 가능 |

## 접근성 고려사항

- 시맨틱 HTML 사용 (button, nav, main, section)
- 색상만으로 상태를 구분하지 않음 (뱃지 텍스트 병행)
- 키보드 네비게이션 지원
- 적절한 aria-label 사용
