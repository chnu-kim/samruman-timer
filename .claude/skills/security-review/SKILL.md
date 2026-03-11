---
name: security-review
description: 보안 취약점을 8개 카테고리로 감사하고, 발견된 이슈를 직접 수정한다
user_invocable: true
---

# 보안 취약점 감사 및 수정

지정된 파일 또는 영역에 대해 보안 취약점을 8개 카테고리로 감사하고, 발견된 이슈를 직접 수정한다.

## 입력

호출 시 다음 중 하나를 지정한다:

- 파일 경로: `src/lib/auth.ts`
- 영역: `auth`, `api`, `middleware`, `config`, `client`
- `all` — 전체 스캔

## 리뷰 카테고리

### 1. 인증/세션 보안
- JWT 서명/만료, 쿠키 속성(httpOnly, secure, sameSite), OAuth state 검증

### 2. 인가/접근 제어
- 소유권 검증, 미들웨어 라우트 매칭, 내부 헤더 위조 방지

### 3. 입력 검증/인젝션
- SQL 바인드 파라미터, XSS 방지, request.json() try/catch, 타입/길이/범위 검증

### 4. 서버/클라이언트 경계
- "use client" 서버 로직 노출, 환경변수 누출, 번들 포함 확인

### 5. 에러 처리/정보 노출
- 스택 트레이스 노출, DB 에러 메시지 노출, 내부 구조 노출 방지

### 6. HTTP 보안 헤더
- CSP, X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy

### 7. 의존성/공급망
- pnpm audit, lockfile 무결성, 외부 스크립트 integrity

### 8. 암호화/시크릿 관리
- 하드코딩 시크릿, .env 노출, NEXT_PUBLIC_ 시크릿, 키 강도

## 심각도

- **🔴 Critical**: 인증 우회, SQL 인젝션, 시크릿 노출, 서버 로직 클라이언트 누출, 에러 원본 노출
- **🟡 Warning**: 보안 헤더 미설정, timeout 없음, 불필요한 console.log, 약한 검증
- **🟢 Info**: 모범 사례 제안, 개선 가능 영역

## 동작 순서

**반드시 `security-reviewer` 에이전트를 Agent 도구로 호출하여 작업을 위임한다.**

스킬 호출 시 아래와 같이 에이전트에 위임한다:

```
Agent 도구 호출:
  subagent_type: general-purpose (또는 기본)
  description: "보안 리뷰 [대상]"
  prompt: |
    You are the security-reviewer agent (.claude/agents/security-reviewer.md).
    대상: [사용자가 지정한 경로/영역]
    위 에이전트 정의의 워크플로우 6단계를 그대로 수행하라.
    반드시 코드를 수정하고, pnpm test + pnpm build 검증까지 완료하라.
```

### 에이전트 위임 규칙

1. 사용자 입력(경로/영역/all)을 그대로 에이전트 프롬프트에 전달한다
2. 에이전트가 반환한 결과(위험도 요약 + 이슈 테이블 + 수정 내역 + 검증 결과)를 사용자에게 그대로 출력한다
3. 에이전트가 수정한 파일 목록을 함께 보여준다

## 출력 형식

에이전트가 반환하는 형식을 그대로 사용한다:

```
## 🔒 보안 리뷰 결과: [대상]

### 위험도 요약
- 🔴 Critical: N건
- 🟡 Warning: N건
- 🟢 Info: N건

### 이슈 요약

| # | 심각도 | 카테고리 | 파일:라인 | 설명 | 상태 |
|---|--------|----------|-----------|------|------|
| 1 | 🔴 | 입력 검증 | src/app/api/timers/[id]/route.ts:25 | request.json() try/catch 없음 | ✅ 수정 |
| 2 | 🟡 | 보안 헤더 | src/middleware.ts:10 | CSP 헤더 미설정 | ✅ 수정 |
| 3 | 🟢 | 의존성 | package.json | pnpm audit 권고 | ℹ️ 권장 |

### 수정 내역

#### 이슈 #1: [제목]
- **파일**: `src/app/api/timers/[id]/route.ts:25`
- **변경**: request.json()을 try/catch로 감싸고 400 반환
- **근거**: 악의적 JSON 페이로드 방어

### 검증 결과
- pnpm test: ✅
- pnpm build: ✅
```
