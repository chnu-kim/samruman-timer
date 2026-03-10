---
name: integration-test
description: 특정 API 또는 기능 흐름의 통합 테스트를 작성하고 실행한다
user_invocable: true
---

# 통합 테스트 작성 및 실행

지정된 API 엔드포인트 또는 기능 흐름에 대한 통합 테스트를 작성하고 실행한다.

## 입력

호출 시 다음 중 하나를 지정한다:

- 엔드포인트: `POST /api/projects`, `GET /api/timers/[id]/logs` 등
- 기능 흐름: `auth-flow`, `timer-lifecycle`, `project-crud` 등
- `all` — 전체 통합 테스트 실행

## 기능 흐름 정의

### `auth-flow` — 인증 전체 흐름
1. `GET /api/auth/login` → CHZZK 리다이렉트 URL 생성 + state 쿠키
2. `GET /api/auth/callback` → state 검증 → 토큰 교환 → DB upsert → JWT 쿠키
3. `GET /api/auth/me` → JWT로 사용자 정보 조회
4. `POST /api/auth/logout` → 세션 쿠키 삭제
5. `GET /api/auth/me` → 401 (로그아웃 확인)

### `project-crud` — 프로젝트 CRUD
1. `POST /api/projects` → 프로젝트 생성 (인증 필요)
2. `GET /api/projects` → 목록에 새 프로젝트 포함 확인
3. `GET /api/projects/[id]` → 상세 조회 (소유자 정보 포함)

### `timer-lifecycle` — 타이머 전체 생명주기
1. `POST /api/projects/[id]/timers` → 타이머 생성 (CREATE 로그)
2. `GET /api/timers/[id]` → 상세 조회 (remaining 계산 확인)
3. `POST /api/timers/[id]/modify` (ADD) → 시간 추가 (ADD 로그)
4. `POST /api/timers/[id]/modify` (SUBTRACT) → 시간 차감
5. `GET /api/timers/[id]/logs` → 로그 목록 확인 (CREATE, ADD, SUBTRACT)
6. `GET /api/timers/[id]/graph?mode=remaining` → 그래프 데이터
7. SUBTRACT로 만료 → EXPIRED 전환 + EXPIRE 로그
8. ADD로 재오픈 → RUNNING 전환 + REOPEN + ADD 로그

## 동작 순서

### 1단계: 대상 확인

지정된 흐름 또는 엔드포인트를 파악하고, 관련 설계 문서를 읽는다:
- `docs/API.md` — 요청/응답 스펙
- `docs/TIMER-LOGIC.md` — 타이머 상태 전이
- `docs/AUTH.md` — 인증 흐름

### 2단계: 기존 테스트 확인

```bash
find src/__tests__ -name "*.test.ts" -type f
```

이미 해당 흐름의 테스트가 있는지 확인한다. 있다면 기존 테스트에 추가, 없으면 새 파일 생성.

### 3단계: 테스트 작성

**테스트 파일 위치:** `src/__tests__/integration/`

**작성 규칙:**
- D1 Database는 Mock (`createMockDB` from `src/__tests__/helpers.ts`)
- `getDB`는 `vi.mock("@/lib/db")`로 모킹
- 외부 API (CHZZK)는 `global.fetch` 모킹
- JWT는 실제 `signJwt`/`verifyJwt` 사용 (`vi.stubEnv("JWT_SECRET", ...)`)
- 각 단계별 DB mock 응답을 순서대로 설정 (`mockResolvedValueOnce`)
- 이전 단계의 응답 데이터를 다음 단계에서 검증

**테스트 구조:**
```typescript
describe("[흐름명] 통합 테스트", () => {
  // 공통 setup
  let db: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    db = createMockDB();
    vi.mocked(getDB).mockResolvedValue(db);
  });

  it("전체 흐름이 정상 동작한다", async () => {
    // Step 1: ...
    // Step 2: 이전 결과를 기반으로 ...
    // ...
  });

  // 엣지 케이스
  it("인증 없이 보호 엔드포인트 접근 시 401", async () => { ... });
  it("소유자가 아닌 사용자의 수정 시도 시 403", async () => { ... });
});
```

### 4단계: 실행 및 검증

```bash
npm test -- --reporter=verbose src/__tests__/integration/
```

### 5단계: 결과 출력

```
## 🔗 통합 테스트 결과: [흐름명]

### 테스트 시나리오
1. ✅ 프로젝트 생성 → 201
2. ✅ 타이머 생성 → 201 + CREATE 로그
3. ✅ 시간 추가 → ADD 로그, remaining 증가
...

### 검증 항목
- [x] 응답 형식 (`{ data }` / `{ error }`)
- [x] 상태 코드 (201, 200, 401, 403, 404)
- [x] DB 호출 순서 및 파라미터
- [x] 상태 전이 (RUNNING → EXPIRED → RUNNING)
- [x] 로그 기록 (action_type, before/after_seconds)

| 테스트 | 상태 |
|--------|------|
| 전체 흐름 정상 동작 | ✅ |
| 인증 없이 접근 시 401 | ✅ |
| 소유자 아닌 사용자 403 | ✅ |
```
