---
name: code-review
description: 코드 리뷰를 수행하고, 발견된 이슈를 TDD 방식으로 수정한다
user_invocable: true
---

# 코드 리뷰 및 TDD 수정

지정된 파일 또는 변경 범위에 대해 코드 리뷰를 수행하고, 발견된 이슈를 TDD 방식(실패 테스트 → 코드 수정)으로 해결한다.

## 입력

호출 시 다음 중 하나를 지정한다:

- 파일 경로: `src/app/api/projects/route.ts` 등
- 영역: `auth`, `api`, `timer-logic`, `proxy` 등
- `all` — 전체 `src/` 코드 리뷰

## 리뷰 카테고리

### 1. 보안 (Security)
- 헤더 인젝션 (내부 헤더 스트리핑 여부)
- JSON 파싱 에러 처리 (`request.json()` try/catch)
- 런타임 타입 검증 (`typeof` 체크)
- 입력값 상한 제한 (`MAX_SECONDS` 등)
- 쿠키 속성 (HttpOnly, Secure, SameSite)
- SQL 인젝션 (바인드 파라미터 사용 여부)
- 에러 메시지 내부 정보 노출 (`withErrorHandler` 적용 여부)

### 2. 설계 일치 (Design Compliance)
- `docs/API.md` — 엔드포인트, 메서드, 요청/응답 구조
- `docs/TIMER-LOGIC.md` — 잔여 시간 계산, 상태 전이, 로그 규칙
- `docs/AUTH.md` — OAuth 플로우, JWT 페이로드, 쿠키 옵션
- `docs/DATABASE.md` — 테이블/컬럼명, ID 형식, 날짜 형식

### 3. 에러 처리 (Error Handling)
- `withErrorHandler` 래핑 여부
- 적절한 HTTP 상태 코드 반환
- 에러 응답 형식: `{ "error": { "code", "message" } }`
- 엣지 케이스 처리 (404, 403, 400)

### 4. 타입 안전성 (Type Safety)
- `as` 캐스팅 대신 런타임 검증
- nullable 처리
- 외부 입력에 대한 방어적 코딩

### 5. 성능 (Performance)
- 불필요한 DB 쿼리
- N+1 쿼리 패턴
- 적절한 인덱스 활용 여부

## 동작 순서

### 1단계: 대상 코드 읽기

지정된 파일 또는 영역의 소스 코드를 모두 읽는다.

### 2단계: 설계 문서 대조

관련 설계 문서(`docs/*.md`)를 읽고, 리뷰 카테고리별로 이슈를 식별한다.

### 3단계: 이슈 목록 작성

발견된 이슈를 심각도별로 분류한다:

- **🔴 Critical**: 보안 취약점, 데이터 손실 가능성
- **🟡 Warning**: 설계 불일치, 에러 처리 누락
- **🟢 Info**: 개선 권장 사항, 코드 스타일

### 4단계: TDD 수정 (Critical/Warning만)

**각 이슈에 대해 반드시 아래 순서를 따른다:**

1. **실패 테스트 작성**: 이슈를 재현하는 테스트를 작성한다
   - 테스트 파일 위치: `src/__tests__/api/*.test.ts` 또는 `src/lib/__tests__/*.test.ts`
   - Mock 패턴: `src/__tests__/helpers.ts`의 `createMockDB`, `createGetRequest`, `createPostRequest` 활용
2. **테스트 실패 확인**: `npm test`로 테스트가 실패하는지 확인한다
3. **코드 수정**: 이슈를 해결하는 최소한의 코드 변경을 적용한다
4. **테스트 통과 확인**: `npm test`로 모든 테스트가 통과하는지 확인한다

```
이슈 발견 → 실패 테스트 작성 → npm test (❌ 실패) → 코드 수정 → npm test (✅ 통과)
```

### 5단계: 결과 출력

```
## 🔍 코드 리뷰 결과: [대상]

### 이슈 요약

| # | 심각도 | 카테고리 | 파일 | 설명 | 상태 |
|---|--------|----------|------|------|------|
| 1 | 🔴 | 보안 | src/app/api/.../route.ts | ... | ✅ 수정 |
| 2 | 🟡 | 설계 | src/lib/timer.ts | ... | ✅ 수정 |
| 3 | 🟢 | 성능 | src/app/api/.../route.ts | ... | ℹ️ 권장 |

### TDD 수정 내역

#### 이슈 #1: [제목]
- **테스트**: `src/__tests__/api/xxx.test.ts` > "[테스트명]"
- **수정**: `src/app/api/.../route.ts:42` — [변경 내용]
- **검증**: npm test ✅ (전체 N개 통과)

#### 이슈 #2: [제목]
...

### 테스트 결과
- 기존 테스트: N개 통과
- 추가 테스트: M개 추가
- 전체: N+M개 통과 ✅
```
