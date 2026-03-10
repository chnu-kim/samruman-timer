---
paths:
  - src/components/**/*.stories.tsx
  - .storybook/**
---

# Storybook 규칙

스토리 파일 작성 시 아래 규칙을 따른다.

## 형식

- CSF3 (Component Story Format 3) 사용
- `satisfies Meta<typeof Component>` 타입 안전성 확보
- `tags: ["autodocs"]`로 자동 문서 생성

## 파일 위치

- 컴포넌트와 같은 디렉토리에 co-locate: `Component.stories.tsx`

## 스토리 구성

- 각 variant/state별 개별 스토리 작성
- `AllVariants` 스토리로 모든 변형을 한 화면에 표시
- 이벤트 핸들러는 `fn()` from `@storybook/test` 사용

## 스타일

- `globals.css`가 `.storybook/preview.ts`에서 import됨
- Tailwind CSS v4 클래스 그대로 사용 가능
