---
name: ui-review
description: UI/UX 품질을 감사하고, 발견된 이슈를 직접 수정한다
user_invocable: true
---

# UI/UX 품질 감사 및 수정

## 입력

- 컴포넌트 경로: `src/components/timer/TimerCard.tsx`
- 페이지 경로: `src/app/timers/[id]/page.tsx`
- 영역: `timer`, `project`, `graph`, `layout`, `ui`
- `all` — 전체 스캔

## 동작

**반드시 `ui-ux-reviewer.md` 에이전트를 Agent 도구로 호출하여 위임한다.**

에이전트 프롬프트에 사용자가 지정한 대상(경로/영역)을 전달하고,
에이전트가 반환한 결과(이슈 요약 테이블 + 수정 내역 + 검증 결과)를 그대로 출력한다.

## 출력 형식

에이전트가 반환하는 형식을 그대로 사용한다:

```
## 🎨 UI/UX 리뷰 결과: [대상]

### 이슈 요약 (테이블)
### 수정 내역
### 검증 결과
```
