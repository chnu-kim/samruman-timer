# UI 품질 규칙

UI 코드 수정 시 모든 에이전트가 적용하는 규칙.

## 색상

- 하드코딩 금지 → `bg-background`/`text-foreground`/`border-border` 등 디자인 토큰 사용
- 상태 색상은 반드시 `dark:` 변형 포함
- 색상만으로 상태 구분 금지 — 텍스트 또는 아이콘 병행 필수

## 접근성

- `<dialog>` → `aria-modal="true"`, `aria-labelledby` 필수
- 아이콘 버튼 → `aria-label` 필수
- Toast → 에러: `role="alert"`, 성공/정보: `role="status"`
- 폼 요소 → `<label>` 연결 필수
- 모달/다이얼로그 → focus trap, Escape 닫기

## 반응형

- 카드 그리드 → 3단계 (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`)
- 터치 타겟 → 최소 44px (`min-h-11 min-w-11`)
- 차트 → `<ResponsiveContainer>` 래핑

## 상태 처리

- 로딩 → `<Skeleton>` 또는 `<Spinner>` 사용
- 에러 → `<ErrorState>` 사용
- 빈 상태 → 안내 메시지 표시

## 애니메이션

- `globals.css`에 `@keyframes` 정의, 인라인 중복 금지
- 기존 키프레임 재사용: `fade-in`, `toast-in`, `toast-out`

## 아이콘

- `stroke-width` 2 통일
- 컨텍스트별 일관된 크기 (버튼 내 16px, 독립 24px 등)
- stroke vs fill 혼용 금지
