---
name: code-review
description: 코드 리뷰를 수행하고, 발견된 이슈를 TDD 방식으로 수정한다
user_invocable: true
---

# 코드 리뷰 및 TDD 수정

## 입력

- 파일 경로: `src/app/api/projects/route.ts` 등
- 영역: `auth`, `api`, `timer-logic`, `proxy` 등
- `all` — 전체 `src/` 코드 리뷰

## 동작

**반드시 `code-reviewer` 에이전트를 Agent 도구로 호출하여 위임한다.**

에이전트 프롬프트에 사용자가 지정한 대상(경로/영역)을 전달하고,
에이전트가 반환한 결과(이슈 목록 + TDD 수정 내역 + 테스트 결과)를 그대로 출력한다.

## 출력 형식

에이전트가 반환하는 형식을 그대로 사용한다:

```
## 🔍 코드 리뷰 결과: [대상]

### 이슈 요약 (테이블)
### TDD 수정 내역
### 테스트 결과
```
