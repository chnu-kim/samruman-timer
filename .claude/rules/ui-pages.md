---
paths:
  - "src/app/(auth)/**"
  - src/app/projects/**
  - src/app/timers/**
---

# UI 페이지 규칙

페이지 작업 시 반드시 아래 설계 문서를 참조한다:

- `docs/UI.md` — 페이지 구성, 컴포넌트 계층, 그래프 설계
- `docs/ARCHITECTURE.md` — 디렉토리 구조, 데이터 흐름

## 핵심 규칙

- 페이지 구성: 홈/프로젝트 목록, 프로젝트 상세, 타이머 상세, 로그인
- 반응형: 모바일 1열, 태블릿 2열, 데스크톱 3열
- 카운트다운: 클라이언트에서 1초마다 갱신, 주기적으로 서버 재조회 동기화
- 잔여 시간 표시: `HH:MM:SS` 또는 `Dd HH:MM:SS`
- 상태 뱃지: RUNNING(초록), EXPIRED(빨강) — 색상 + 텍스트 병행
- 접근성: 시맨틱 HTML, 키보드 네비게이션, aria-label
- 스타일링: Tailwind CSS v4 (CSS-first, `globals.css`에서 설정)