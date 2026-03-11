---
name: ui-review
description: UI/UX 품질을 감사하고, 발견된 이슈를 직접 수정한다
user_invocable: true
---

# UI/UX 품질 감사 및 수정

지정된 컴포넌트 또는 페이지에 대해 UI/UX 품질을 8개 카테고리로 감사하고, 발견된 이슈를 직접 수정한다.

## 입력

호출 시 다음 중 하나를 지정한다:

- 컴포넌트 경로: `src/components/timer/TimerCard.tsx`
- 페이지 경로: `src/app/timers/[id]/page.tsx`
- 영역: `timer`, `project`, `graph`, `layout`, `ui`
- `all` — 전체 스캔

## 리뷰 카테고리

### 1. 색상 대비 & 다크/라이트 모드
- CSS 변수 사용 여부, `dark:` 변형 커버리지, 하드코딩 금지
- `bg-white`/`bg-black`/`text-gray-*` 단독 사용 금지 → `bg-background`/`text-foreground` 사용

### 2. 타이포그래피
- 폰트 계층 일관성 (제목/섹션/본문), 줄 높이, 말줄임 처리
- 한국어 `font-sans`, 타이머 `font-mono`

### 3. 간격 & 레이아웃
- Tailwind spacing 일관성, 매직넘버 금지
- 유사 컨텍스트에서 `gap-2` vs `gap-3` 같은 불일치 감지

### 4. 반응형
- 3단계 브레이크포인트 (모바일/태블릿/데스크톱)
- 터치 타겟 44px, 텍스트 overflow 처리

### 5. 인터랙션 & 피드백
- hover/focus/active/disabled 4가지 상태
- 트랜지션, 로딩 중 버튼 비활성, Tab/Enter/Space 도달성

### 6. 상태 처리
- 로딩 → Skeleton/Spinner, 에러 → ErrorState, 빈 상태 → 메시지
- 폼 검증 + 제출 + 성공 상태

### 7. 접근성 (a11y)
- 시맨틱 HTML, aria 속성, 키보드 내비게이션, 색상 비의존
- `<dialog>` aria-modal/aria-labelledby, Toast role 분리, 아이콘 버튼 aria-label

### 8. 시각적 일관성
- 아이콘 stroke-width 통일, 애니메이션 중복 방지
- 그림자/라운딩 스케일, `globals.css` 키프레임 사용

## 심각도

- **🔴 Critical**: 접근성 차단(aria 누락), 대비 0, 반응형 깨짐, 로딩/에러 상태 없음
- **🟡 Warning**: 다크모드 불일치, 간격 비일관, hover/focus 누락, 하드코딩 색상
- **🟢 Info**: 경미한 스타일 비일관, 최적화 제안

## 동작 순서

**반드시 `ui-ux-reviewer` 에이전트를 Agent 도구로 호출하여 작업을 위임한다.**

스킬 호출 시 아래와 같이 에이전트에 위임한다:

```
Agent 도구 호출:
  subagent_type: general-purpose (또는 기본)
  description: "UI/UX 리뷰 [대상]"
  prompt: |
    You are the ui-ux-reviewer agent (.claude/agents/ui-ux-reviewer.md).
    대상: [사용자가 지정한 경로/영역]
    위 에이전트 정의의 워크플로우 6단계를 그대로 수행하라.
    반드시 코드를 수정하고, pnpm build + pnpm build-storybook 검증까지 완료하라.
```

### 에이전트 위임 규칙

1. 사용자 입력(경로/영역/all)을 그대로 에이전트 프롬프트에 전달한다
2. 에이전트가 반환한 결과(이슈 요약 테이블 + 수정 내역 + 검증 결과)를 사용자에게 그대로 출력한다
3. 에이전트가 수정한 파일 목록을 함께 보여준다

## 출력 형식

에이전트가 반환하는 형식을 그대로 사용한다:

```
## 🎨 UI/UX 리뷰 결과: [대상]

### 이슈 요약

| # | 심각도 | 카테고리 | 파일 | 설명 | 상태 |
|---|--------|----------|------|------|------|
| 1 | 🔴 | 접근성 | src/components/ui/ConfirmDialog.tsx | aria-modal 누락 | ✅ 수정 |
| 2 | 🟡 | 다크모드 | src/components/ui/Badge.tsx | dark: variant 누락 | ✅ 수정 |
| 3 | 🟢 | 타이포 | src/components/timer/TimerCard.tsx | 줄 높이 비일관 | ℹ️ 권장 |

### 수정 내역

#### 이슈 #1: [제목]
- **파일**: `src/components/ui/ConfirmDialog.tsx:15`
- **변경**: aria-modal="true" aria-labelledby 추가
- **근거**: WAI-ARIA dialog 패턴 준수

#### 이슈 #2: [제목]
...

### 검증 결과
- pnpm build: ✅
- pnpm build-storybook: ✅
```
