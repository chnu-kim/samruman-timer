---
paths:
  - src/app/api/**
  - src/middleware.ts
  - src/lib/db.ts
---

# API 라우트

설계: `docs/API.md`. 새 엔드포인트를 만들거나 응답 형태를 바꾸면 이 문서도 갱신한다.

## 구조

- 핸들러는 `withErrorHandler()`(`src/lib/db.ts`)로 감싼다. 예외 원문·스택·SQL이 클라이언트로 나가지 않게 하는 장치다.
- 에러 코드: `BAD_REQUEST`(400), `UNAUTHORIZED`(401), `FORBIDDEN`(403), `NOT_FOUND`(404), `INTERNAL_ERROR`(500)
- 사용자 식별은 미들웨어가 넣은 `x-user-id` 헤더로만 한다. 미들웨어는 클라이언트가 보낸 `x-user-*` 헤더를 먼저 제거하므로 이 헤더는 신뢰할 수 있다.

## 인증·인가

- 로그인이 필요한 엔드포인트는 `src/middleware.ts`의 `PROTECTED_ROUTES`에 메서드+패턴으로 등록해야 헤더가 주입된다. 등록을 빠뜨리면 `x-user-id`가 비어 핸들러가 401을 내거나, 더 나쁘게는 인가 검사가 우회된다.
- 수정·삭제는 리소스 소유자인지 확인한다 (프로젝트 `owner_user_id` 대조). 타이머·목표는 상위 프로젝트를 거쳐 소유권을 확인한다.
- `DELETED` 상태 리소스는 조회·수정 대상에서 제외한다.

## 입력 검증

- `request.json()`은 try/catch로 감싸고 파싱 실패 시 400.
- 경로 파라미터 ID는 32자 hex인지 검증한다.
- 문자열 길이·숫자 범위 상한을 둔다.
- SQL은 항상 `?` 바인딩. 템플릿 리터럴로 값을 쿼리에 끼우지 않는다.
- 여러 쓰기는 `db.batch()`로 원자적으로 실행한다 (D1에는 대화형 트랜잭션이 없다).

## 외부 호출

- CHZZK API fetch에는 `AbortSignal.timeout()`을 건다.
- 외부 응답은 검증 후 사용하고, 외부 에러 메시지를 그대로 클라이언트에 넘기지 않는다.
- 토큰·사용자 데이터를 로그에 남기지 않는다.

## 운영 로그

규칙의 근거, 이벤트 카탈로그, 조회·조사 절차는 `docs/OBSERVABILITY.md`에 있다. 구성과 무료 한도는 `docs/ARCHITECTURE.md` "운영 로그·관측".

- `console.*`을 직접 쓰지 않고 `logger.{info,warn,error}(event, fields)`(`src/lib/logger.ts`)를 쓴다. Workers Logs가 JSON 필드로 검색하려면 한 줄 JSON이어야 한다.
- 이벤트 키는 영어 dot 표기(`auth.refresh.rejected`)로 쓴다. 새 이벤트를 만들면 OBSERVABILITY의 이벤트 카탈로그(표와 이벤트별 판단·조사)에 추가한다. 프로덕션에서 조사할 때 그 문서가 유일한 참고이기 때문이다.
- `requestId`(`request.headers.get("x-request-id")`)를 넣는다. invocation log를 꺼 두었으므로 error 로그에는 `method`와 `path`(`nextUrl.pathname`, 쿼리스트링 제외)도 넣는다.
- 예외는 `...errorFields(err)`로 펼친다. 메시지 길이를 묶고 `schema_drift`·`timeout`을 분류해 준다.
- 금지: 토큰·토큰 해시·쿠키·nickname·chzzkUserId·actorName·쿼리스트링·외부 응답 본문. 허용: 내부 userId·timerId·projectId·familyId.
- `versionId`·`versionTag`는 logger가 붙이는 예약 키다. fields로 넣어도 무시된다.
- lib 함수는 로깅하지 않고 실패 사유를 반환값으로 돌려준다(`rotateRefreshToken`의 `reason`처럼). 로깅은 라우트·미들웨어가 한다.
- 정상 흐름이면서 양이 많은 경우(비로그인 401 등)는 남기지 않는다. 무료 로그 한도를 함께 쓴다.

## 테스트

라우트를 추가·변경하면 `src/__tests__/api/`에 대응 테스트를 추가한다. 401/403/404/400 경로를 포함한다.
