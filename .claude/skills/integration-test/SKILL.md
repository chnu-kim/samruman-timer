---
name: integration-test
description: 특정 API 또는 기능 흐름의 통합 테스트를 작성하고 실행한다
user_invocable: true
---

# 통합 테스트 작성 및 실행

## 입력

- 엔드포인트: `POST /api/projects`, `GET /api/timers/[id]/logs` 등
- 기능 흐름: `auth-flow`, `timer-lifecycle`, `project-crud` 등
- `all` — 전체 통합 테스트 실행

## 기능 흐름 정의

- `auth-flow` — 로그인 → 콜백 → me → 로그아웃 → 401 확인
- `project-crud` — 프로젝트 생성 → 목록 → 상세 조회
- `timer-lifecycle` — 생성 → 조회 → ADD → SUBTRACT → 로그 → 그래프 → 만료 → 재오픈

## 동작

**반드시 `integration-test-writer` 에이전트를 Agent 도구로 호출하여 위임한다.**

에이전트 프롬프트에 사용자가 지정한 대상(엔드포인트/흐름)을 전달하고,
에이전트가 반환한 결과(테스트 시나리오 + 검증 항목 + 실행 결과)를 그대로 출력한다.

## 출력 형식

에이전트가 반환하는 형식을 그대로 사용한다:

```
## 🔗 통합 테스트 결과: [흐름명]

### 테스트 시나리오
### 검증 항목
### 실행 결과 (테이블)
```
