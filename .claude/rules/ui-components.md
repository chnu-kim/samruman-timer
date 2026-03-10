---
paths:
  - src/components/**
---

# UI 컴포넌트 규칙

컴포넌트 작업 시 반드시 아래 설계 문서를 참조한다:

- `docs/UI.md` — 컴포넌트 계층, 그래프 설계, 반응형/접근성 가이드

## 핵심 규칙

- 컴포넌트 디렉토리: `timer/`, `project/`, `graph/`, `layout/`, `ui/`
- 그래프: Recharts 사용 (LineChart, AreaChart, BarChart)
- 로그 액션 색상: CREATE(파랑), ADD(초록), SUBTRACT(빨강), EXPIRE(회색), REOPEN(노랑)
- 접근성: 시맨틱 HTML, 색상만으로 상태 구분하지 않음, aria-label 사용
- 스타일링: Tailwind CSS v4
- 반응형 디자인 고려 (모바일/태블릿/데스크톱)