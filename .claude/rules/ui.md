---
paths:
  - src/components/**
  - src/app/**/*.tsx
  - src/app/globals.css
  - src/hooks/**
  - .storybook/**
---

# UI

설계: `docs/UI.md`. 디자인 토큰·키프레임·`dark` variant는 `src/app/globals.css`가 기준이다. 새 값을 만들기 전에 거기 있는 것을 먼저 찾아 쓴다.

## 스타일

- 색은 토큰 클래스(`bg-background`, `text-foreground`, `border-border`, `bg-muted`, `text-muted-foreground` 등)로. 상태색처럼 토큰이 없는 색을 쓸 때는 `dark:` 변형을 함께 지정한다.
- 상태를 색만으로 구분하지 않는다. 텍스트나 아이콘을 함께 쓴다 (예: RUNNING/EXPIRED 뱃지).
- 애니메이션은 `globals.css`에 `@keyframes`로 정의하고 재사용한다. 컴포넌트 인라인으로 중복 정의하지 않는다.
- 아이콘은 `ui/Icons.tsx`를 쓴다. stroke 기반, `stroke-width` 2.

## 접근성·반응형

- 아이콘 전용 버튼에는 `aria-label`, 폼 요소에는 연결된 `<label>`.
- 다이얼로그는 `ui/ConfirmDialog`·`ui/FormDialog`를 재사용한다 (native `<dialog>`, `aria-modal`, Escape 처리 포함).
- Toast: 에러는 토스트마다 `role="alert"`. 성공·정보는 토스트 자체에 role을 두지 않고, `ToastProvider`가 항상 렌더해 두는 `role="status"` live region(sr-only)에 문구를 넣는다. 토스트와 함께 새로 삽입된 status 노드는 스크린리더가 읽지 않을 수 있기 때문이다.
- 모바일 우선. 터치 타겟은 최소 44px, 차트는 `ResponsiveContainer`로 감싼다.

## 상태

데이터를 불러오는 화면은 로딩(`ui/Skeleton`, `ui/Spinner`), 에러(`ui/ErrorState`), 빈 상태를 모두 처리한다.

## 오버레이 (`src/app/timers/[id]/overlay/`)

OBS 브라우저 소스에서 투명 배경으로 렌더링된다. 페이지 배경·헤더 같은 앱 크롬을 넣지 않는다. 폴링 주기를 바꾸거나 애니메이션을 추가하면 방송 중 장시간 켜져 있어도 문제가 없는지(메모리 누수, 타이머 정리) 확인한다.

## 클라이언트/서버 경계

- `"use client"` 파일에서 `process.env`를 직접 읽지 않고, `src/lib/db.ts`·`src/lib/auth.ts` 같은 서버 모듈을 import하지 않는다.
- 클라이언트의 API 호출은 `authFetch()`를 거친다.

## 텍스트

사용자에게 보이는 문구는 한국어. Storybook 데모 텍스트도 한국어.

## Storybook

- `ui/` 등 재사용 컴포넌트는 같은 디렉토리에 `Component.stories.tsx` (CSF3, `satisfies Meta<typeof Component>`, `tags: ["autodocs"]`).
- variant·상태별 스토리를 두고, 이벤트 핸들러는 `fn()`(`@storybook/test`).
- props를 바꾸면 기존 스토리도 맞춰 고치고 `pnpm build-storybook`으로 확인한다.
