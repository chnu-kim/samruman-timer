---
name: create-pr
description: 변경 분석 → PR 제목/본문 생성 → gh pr create
user_invocable: true
---

# PR 생성

현재 브랜치의 변경 사항을 분석하여 PR 제목과 본문을 자동 생성하고 GitHub PR을 생성한다.

## 동작

**반드시 `pr-creator` 에이전트를 Agent 도구로 호출하여 위임한다.**

에이전트가 다음을 수행한다:
1. 브랜치 확인 (main/master에서는 거부)
2. `git log main..HEAD`로 포함 커밋 확인
3. `git diff main...HEAD`로 전체 변경 분석
4. PR 제목(영어) + 본문(한국어) 생성
5. 미푸시 커밋 자동 푸시
6. `gh pr create` 실행

## 출력 형식

```
## PR 생성 완료

| 항목 | 내용 |
|------|------|
| PR URL | https://github.com/... |
| 제목 | feat: add timer settings |
| 브랜치 | feature/timer-settings → main |
| 커밋 수 | 5개 |
```
