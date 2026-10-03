# 운영 관측 — 이벤트 카탈로그와 런북

프로덕션 운영 로그(Workers Logs)와 Issues를 읽고, 원인을 좁히고, 고치고, 배포 후 재발 여부를 버전 단위로 확인하는 절차를 다룬다. 사람과 에이전트(Claude Code의 `prod-triage` skill)가 같은 문서를 쓴다.

역할 분담:

- 이 문서: 로그 형식·PII 규칙·이벤트 카탈로그(무엇을 뜻하고 어떻게 조사하나), 조회 CLI(`scripts/obs.mjs`), 폐쇄 루프 절차, 1회성 설정
- `docs/ARCHITECTURE.md` "운영 로그·관측": 구성(`wrangler.toml [observability]`), 무료 한도와 초과 시 동작, `wrangler tail`, invocation log를 켜는 절차, 한계

여기서 "운영 로그"는 Workers Logs의 서버 로그다. 시간 변경 기록인 도메인 테이블 `timer_logs`와는 다르다.

## 로그 형식

앱 로그는 모두 `src/lib/logger.ts`의 `logger.{info,warn,error}(event, fields?)`를 거쳐 한 줄 JSON으로 `console.log`·`console.warn`·`console.error`에 나간다. Workers Logs가 JSON 필드를 인덱싱하므로 `event`, `requestId`, `kind`, `versionTag` 등으로 바로 필터할 수 있다.

```json
{ "requestId": "…", "method": "GET", "path": "/api/projects", "errorName": "Error",
  "error": "D1_ERROR: no such table: projects: SQLITE_ERROR", "kind": "schema_drift",
  "cause": "…", "stack": "…",
  "versionId": "1f0c…", "versionTag": "a0f124601805",
  "level": "error", "event": "api.unhandled", "message": "api.unhandled", "timestamp": "2026-10-03T00:11:29.908Z" }
```

- `level`·`event`·`message`·`timestamp`·`versionId`·`versionTag`는 예약 키라 fields가 덮어쓰지 못한다. `message`는 대시보드 목록의 표시 열이라 `event`와 같은 값을 넣는다
- `versionId`·`versionTag`는 `[version_metadata]` 바인딩(`CF_VERSION_METADATA`)에서 logger가 자동으로 붙인다. `versionTag`는 `pnpm run deploy`가 붙인 git short SHA(12자)다. 요청 컨텍스트 밖(빌드·테스트 등)이거나 태그 없이 배포한 버전이면 해당 필드가 빠진다
- `requestId`는 미들웨어가 만든 UUID다. 같은 값이 응답 헤더 `x-request-id`로 나가므로, 사용자가 알려 준 값으로 로그를 찾는다. 들어온 `x-request-id`나 `cf-ray`는 쓰지 않는다
- `errorFields(err)`는 `{ errorName, error(300자), cause(300자, 있을 때), stack(2000자), kind }`를 만든다. `kind`는 `schema_drift`(`no such table|column`, 원격 마이그레이션 누락), `timeout`(`TimeoutError`, `AbortSignal.timeout`. `ChzzkApiError`처럼 감싼 오류는 `timedOut: true`나 cause의 `TimeoutError`로 판정), `unknown`이다. stack 첫 줄의 메시지도 300자로 잘라 붙이므로 메시지 상한이 stack에서 풀리지 않는다
- invocation log를 껐으므로 `api.unhandled`·`auth.refresh.failed` 같은 오류 로그에는 `method`와 `path`(쿼리스트링 제외 pathname)를 직접 넣는다

## PII 규칙

- 남기지 않는다: 토큰(access·refresh·OAuth code/state), 토큰 해시, 쿠키, nickname, chzzkUserId, actorName, 쿼리스트링, 외부(CHZZK) 응답 본문 원문
- 남겨도 된다: 서버가 만든 내부 ID(userId·timerId·projectId·familyId), requestId, method, pathname, 배포 버전
- CHZZK 실패 응답은 본문을 버리고 JSON `code` 필드만 오류 메시지에 붙인다(`ChzzkApiError`). 200인데 JSON이 아닌 본문도 `invalid JSON` `ChzzkApiError`로 바꾸고, 본문 일부를 인용하는 `SyntaxError`는 cause로 달지 않는다

조사 결과를 PR·이슈·대화에 옮길 때도 같은 규칙을 따른다. 로그에 금지 값이 보이면 그것 자체가 버그다.

## 이벤트 카탈로그

새 이벤트를 만들면 이 표와 아래 상세에 추가한다. 이벤트 키는 영어 dot 표기(`auth.refresh.rejected`)다.

| event | level | 위치 | 주요 필드 |
|-------|-------|------|-----------|
| `api.unhandled` | error | `withErrorHandler` (`lib/db.ts`) | requestId, method, path, 오류 필드 |
| `env.invalid` | error | middleware | requestId, method, path, invalid(변수 이름만) |
| `env.weak_jwt_secret` | warn | `lib/env.ts` | variable, minBytes |
| `auth.refresh.failed` | error | middleware (refresh 중 예외 → 500) | requestId, method, path, 오류 필드 |
| `auth.refresh.reuse_detected` | warn | middleware (이번 요청이 family의 행을 실제로 폐기했을 때만, 보통 사건당 한 번) | requestId, method, path, userId, familyId |
| `auth.refresh.rejected` | info | middleware | requestId, method, path, reason(`not_found`·`expired`·`family_expired`·`revoked`·`user_missing`) |
| `auth.oauth_state_invalid` | warn / info | `/api/auth/callback` | requestId, reason(warn: `missing_state`·`missing_cookie`·`mismatch` / info: `missing_code`) |
| `auth.login.failed` | error | `/api/auth/callback` | requestId, method, path, stage(`token`·`user`·`db`), status, timedOut, durationMs, 오류 필드 |
| `auth.login.succeeded` | info | `/api/auth/callback` | requestId, userId, durationMs |
| `auth.logout.revoke_failed` | error | `/api/auth/logout` | requestId, method, path, 오류 필드 |
| `timer.modify.conflict_exhausted` | warn | `/api/timers/[id]/modify` (409) | requestId, timerId, action |
| `timer.create.unique_race` | warn | `POST /api/projects/[id]/timers` | requestId, projectId |

refresh 쿠키 없이 보호 라우트를 부른 401은 정상 흐름이고 양이 많아 남기지 않는다. 반면 거부된 refresh 쿠키(폐기된 family = `revoked`, `expired`, `family_expired`, `not_found`)는 쿠키를 로그아웃에서만 지우므로 그 브라우저가 페이지를 열 때마다(Header와 페이지가 각각 `/api/auth/me`를 부르므로 한 화면에 1~2건) `auth.refresh.rejected`가 다시 남는다. 쿠키가 만료(최대 30일)되거나 다시 로그인할 때까지 이어진다. 그래서 `auth.refresh.rejected` 건수는 사건 수가 아니라 페이지 조회 수에 가깝고, 사건 수는 `auth.refresh.reuse_detected`로 센다. `env.invalid`는 검증이 성공했을 때만 캐시되므로 설정을 고칠 때까지 요청마다 한 건씩 남는다.

### 이벤트별 판단과 조사

"정상"은 이 이벤트가 보여도 할 일이 없는 수준, "비정상"은 조사를 시작할 기준이다. 수치는 지금 트래픽(소규모) 기준의 출발점이라 운영하며 고친다.

**`api.unhandled`** (error) — 라우트 핸들러에서 잡히지 않은 예외. 사용자는 500 `INTERNAL_ERROR`를 받았다.
- 정상: 0건. 비정상: 1건이라도.
- 먼저 `kind`를 본다(아래 "kind별 대응"). `unknown`이면 `path`로 라우트(`src/app/api/**/route.ts`)를 찾고 `stack`으로 줄을 좁힌다.
- 조사: `obs.mjs events api.unhandled --since 24h`, 한 건은 `obs.mjs request <requestId>`.

**`env.invalid`** (error) — 필수 환경변수(`CHZZK_CLIENT_ID`·`CHZZK_CLIENT_SECRET`·`JWT_SECRET`·`BASE_URL`) 누락·형식 오류. 모든 API가 500을 낸다.
- 정상: 0건. 비정상: 1건이라도(요청마다 남으므로 보통 대량).
- 코드 문제가 아니라 Worker 설정(Secrets) 문제다. `invalid`에 변수 이름이 있다. `src/lib/env.ts`의 검증 규칙과 대시보드 Settings → Variables를 대조한다. Secret 변경은 사람이 한다.
- 조사: `obs.mjs events env.invalid --limit 5`.

**`env.weak_jwt_secret`** (warn) — `JWT_SECRET`이 32바이트 미만. 서비스는 계속 돈다.
- isolate가 뜰 때마다 남을 수 있다. 보이는 동안은 비정상(보안 부채)이지만 긴급하지 않다. Secret 교체는 모든 세션을 끊으므로 사람이 시점을 정한다.

**`auth.refresh.failed`** (error) — 미들웨어의 refresh 회전 중 예외(대개 D1). 그 요청은 500.
- 정상: 0건. 비정상: 1건이라도. `kind=schema_drift`면 원격 마이그레이션 누락.
- 코드: `src/middleware.ts`의 refresh 분기, `src/lib/auth.ts`의 `rotateRefreshToken`. 원자성은 `docs/AUTH.md` "rotation의 원자성".
- 조사: `obs.mjs events auth.refresh.failed`, `obs.mjs request <requestId>`.

**`auth.refresh.reuse_detected`** (warn) — 이미 쓰인 refresh 토큰이 다시 와서 family 전체를 폐기했다. 탈취 의심 또는 같은 쿠키를 가진 두 탭의 경합.
- 정상: 드물게(주 몇 건). 비정상: 같은 `userId`에 반복되거나 갑자기 늘 때.
- rotation의 DB 쓰기는 원자적이라 `auth.refresh.failed` 뒤에 따라오는 오탐은 없다. 남은 예외는 `docs/AUTH.md` "rotation의 원자성".
- 조사: `obs.mjs events auth.refresh.reuse_detected --since 7d`.

**`auth.refresh.rejected`** (info) — 거부된 refresh 쿠키(사유 `reason`). 위 설명대로 페이지 조회 수에 비례한다.
- 정상: `revoked`·`expired`·`family_expired`가 꾸준히. 비정상: `not_found`나 `user_missing`이 급증(마이그레이션·데이터 삭제 의심), 또는 배포 직후 전체가 급증(쿠키·JWT 설정 변경 의심).
- 조사: `obs.mjs summary --since 24h`로 추세, `obs.mjs events auth.refresh.rejected --limit 200`으로 reason 분포.

**`auth.oauth_state_invalid`** (warn/info) — OAuth 콜백의 state 검증 실패.
- 정상: `missing_code`(info, 동의 화면 취소)와 가끔의 `missing_cookie`(쿠키 만료·다른 브라우저). 비정상: `mismatch`·`missing_state`가 반복(위조 시도 의심), 또는 모든 로그인이 `missing_cookie`(쿠키 속성·도메인 변경 의심).
- 코드: `src/app/api/auth/callback/route.ts`, `src/app/api/auth/login/route.ts`(state 쿠키 발급).

**`auth.login.failed`** (error) — 로그인 실패. 사용자는 `/login?error=auth_failed`로 간다.
- 정상: 드물게(CHZZK 일시 장애). 비정상: 연속 발생, 또는 `stage=db`(우리 쪽 문제).
- `stage=token|user`면 CHZZK 쪽: `status`·`timedOut`을 본다(아래 `timeout`). `stage=db`면 `kind`를 본다.
- 코드: `src/app/api/auth/callback/route.ts`, `src/lib/chzzk.ts`.
- 조사: `obs.mjs events auth.login.failed --since 24h`.

**`auth.login.succeeded`** (info) — 로그인 성공. `durationMs`로 CHZZK 지연을 본다. 배포 후 verify에서 "이 버전이 트래픽을 받았다"는 근거로도 쓴다.

**`auth.logout.revoke_failed`** (error) — 로그아웃 시 refresh 폐기 실패. 쿠키는 지워졌지만 DB 행이 남아 탈취된 토큰이라면 만료까지 쓸 수 있다.
- 정상: 0건. 비정상: 1건이라도. 코드: `src/app/api/auth/logout/route.ts`.

**`timer.modify.conflict_exhausted`** (warn) — 시간 변경의 낙관적 잠금 재시도를 모두 소진해 409를 냈다.
- 정상: 드물게(같은 타이머를 여러 탭·사람이 동시에 조작). 비정상: 같은 `timerId`에 반복(재시도 로직·버전 갱신 버그 의심).
- 코드: `src/app/api/timers/[id]/modify/route.ts`, `src/lib/timer.ts`. 규칙은 `docs/TIMER-LOGIC.md`.

**`timer.create.unique_race`** (warn) — 타이머 생성 경합을 부분 UNIQUE 인덱스(0009)가 막았다. 사용자는 400을 받았고 데이터는 안전하다.
- 정상: 드물게(더블 클릭). 비정상: 잦으면 클라이언트 중복 제출 방지 확인.

### kind별 대응

- **`schema_drift`** (`no such table|column`): 코드가 원격 D1에 없는 스키마를 쓴다. 코드만 배포되고 마이그레이션이 빠진 장애 이력이 있다(`0007`).
  1. `npx wrangler d1 migrations list samrumantimer-db --remote`로 적용 안 된 마이그레이션을 확인한다(읽기 전용)
  2. 있으면 사람에게 `pnpm db:migrate:remote` 실행을 요청한다. 원격 마이그레이션은 사람 승인 대상이다
  3. 적용 후 `obs.mjs verify --tag <현재 태그> --since <적용 시각>`으로 그친 것을 확인한다
- **`timeout`** (`TimeoutError`, `timedOut: true`): 외부 호출(CHZZK)이 `AbortSignal.timeout`을 넘었다. 우리 코드보다 CHZZK 상태를 먼저 본다(CHZZK 개발자 센터 공지·상태). 여러 사용자에 걸쳐 짧게 몰려 있으면 외부 장애, 한 경로에서 꾸준하면 타임아웃 값이나 호출 방식을 의심한다(`src/lib/chzzk.ts`)
- **`unknown`**: `errorName`·`error`·`stack`으로 코드 위치를 좁힌다

## 조회 CLI — `scripts/obs.mjs`

Workers Observability API를 읽기 전용으로 부르는 의존성 없는 Node 스크립트(Node 18+). 기본 출력은 한 줄에 JSON 하나(JSON lines, stdout)이고 요약·안내는 `#`로 시작하는 줄(stderr)이다.

```bash
node scripts/obs.mjs errors [--since 1h]                    # level=error 이벤트
node scripts/obs.mjs events <event> [--since 1h] [--level error]
node scripts/obs.mjs request <requestId> [--since 3d]       # 한 요청의 모든 앱 로그(stack 앞부분 포함)
node scripts/obs.mjs summary [--since 24h]                  # event×level 건수
node scripts/obs.mjs issues [--status active]
node scripts/obs.mjs issue <id>                             # 상세와 최근 occurrence
node scripts/obs.mjs verify --tag <sha> [--since 24h] [--event <e>] [--issue <id>] [--min-events 1] [--skip-issues]
```

- 공통: `--json`(API 응답 원문, verify는 판정 객체), `--limit N`(기본 100, 최대 2000), `--since`(기간 `15m`·`1h`·`3d` 또는 ISO 시각)
- 환경변수: `CF_OBS_TOKEN`(필수), `CLOUDFLARE_ACCOUNT_ID`(선택, 기본값은 이 서비스 계정. 계정 ID는 대시보드 URL에도 드러나는 값이고 토큰 없이는 쓸 수 없어 비밀로 보지 않는다)
- 종료 코드: 0 성공, 2 조회 실패(인자 오류, 네트워크, 401/403, API 오류). 401/403이면 토큰 권한 안내를 낸다. 토큰은 어떤 출력에도 나오지 않는다
- 보관 기간이 지나면(현재 3일, 2026-12-01부터 7일) 조회되지 않는다

API 응답의 정확한 모양은 확인되지 않은 채로 만들었다. 정규화가 이상하면(필드가 비거나 0건인데 대시보드에는 있음) `--json`으로 원문을 보고 `scripts/lib/obs.mjs`의 정규화 함수를 고친다. 앱 필드의 필터 키 형식이 다르면 `APP_FIELD_PREFIX` 한 줄을 고친다.

### verify 판정

`verify --tag <sha>`는 그 태그로 배포된 버전에서 문제가 다시 났는지 판정한다.

| exit | verdict | 조건 |
|------|---------|------|
| 1 | `recurred` | 기간 안에 그 태그의 error 이벤트(`--event`로 좁힐 수 있다)나 active Issue occurrence(`worker.scriptVersion.tag`가 그 태그)가 있다 |
| 2 | `insufficient` | 그 태그로 남은 로그가 `--min-events`(기본 1)보다 적다. 또는 버전 태그를 읽지 못한 occurrence가 있다 |
| 2 | (조회 실패) | 어느 하위 조회든 실패했다(Issues 403 포함) |
| 0 | `clean` | 위에 해당하지 않는다 |

설계 이유:

- 조회가 실패하거나 근거가 없을 때 "재발 없음"(0)으로 넘어가면 루프가 잘못 닫힌다. 그래서 애매하면 2로 기운다
- 태그 로그 0건은 배포가 안 됐거나, 태그가 틀렸거나, 트래픽이 없다는 뜻이다. 앱 로그는 로그인·거부·오류 때만 남으므로 조용한 시간대에는 정상 배포에서도 0건일 수 있다. `npx wrangler versions list`로 그 태그가 배포됐는지 확인했다면 `--min-events 0`으로 판정할 수 있다
- `--event`만 주면 Issues는 보지 않는다(Issue와 event를 대응시킬 방법이 없다). 특정 Issue를 함께 보려면 `--issue <id>`
- Issues 권한이 없는 토큰이면 `--skip-issues`로 로그만 보고 판정한다. 출력의 `notes`에 남는다
- `--since`는 배포 시각(ISO)으로 주는 것이 가장 정확하다. 태그로 거르므로 더 넓게 줘도 이전 버전의 오류는 섞이지 않는다

## 폐쇄 루프 절차

배포·원격 마이그레이션·PR 머지는 사람 승인이 필요하다. 에이전트는 조회, 원인 분석, 브랜치·커밋·PR 작성, verify까지 하고, 승인이 필요한 단계에서는 근거를 정리해 넘긴다.

1. **감지**: `obs.mjs issues`, `obs.mjs errors --since 24h`, `obs.mjs summary --since 24h`. 사용자 신고라면 받은 `x-request-id`로 시작한다
2. **재현·원인**: `obs.mjs request <requestId>`로 한 요청의 로그를 모으고, 위 카탈로그의 코드 위치와 `kind`별 대응을 따라 원인을 좁힌다. `versionTag`로 어느 배포에서 시작됐는지 보고 `git log <이전 태그>..<태그>`로 의심 변경을 찾는다. 로컬 재현은 `pnpm db:migrate:local` 후 `pnpm dev` 또는 테스트로 한다
3. **수정 PR**: 실패를 재현하는 테스트를 먼저 쓰고 고친다. `pnpm test`, `pnpm build`를 통과시킨다. PR 본문에 근거(이벤트·건수·requestId, PII 제외)와 verify 계획을 적는다
4. **배포(사람 승인)**: 머지 후 사람이 `pnpm run deploy`를 실행한다. 스크립트가 배포 태그(git short SHA 12자)를 출력한다. 스키마 변경이 있으면 원격 마이그레이션을 먼저 적용한다(사람)
5. **재발 판정**: 충분한 시간이 지난 뒤 `obs.mjs verify --tag <태그> --since <배포 시각> [--event <e>] [--issue <id>]`. 0이면 다음 단계, 1이면 2로 돌아간다, 2면 원인(조회 실패·근거 부족)을 해소하고 다시 본다
6. **정리**: 해당 Issue를 대시보드에서 resolve하고(사람 또는 권한 있는 도구), 카탈로그의 정상/비정상 기준이 틀렸으면 이 문서를 고친다

### 배포 태그

`pnpm run deploy`는 `scripts/deploy.mjs`를 실행한다.

- 태그 = `git rev-parse --short=12 HEAD`. `opennextjs-cloudflare deploy --tag <태그>`로 wrangler에 넘어가 Worker 버전 태그가 되고, 런타임에 `CF_VERSION_METADATA.tag` → 로그의 `versionTag`가 된다
- 커밋되지 않은 변경(추적 안 되는 파일 포함)이 있으면 배포를 거부한다. verify가 태그를 커밋에 대응시키는데, dirty 빌드는 어느 커밋과도 맞지 않기 때문이다. 급하면 `--allow-dirty`(태그에 `-dirty`가 붙는다)
- `pnpm run deploy --dry-run`은 태그와 실행할 명령만 출력한다
- 원격 마이그레이션은 적용하지 않고 확인 명령(`npx wrangler d1 migrations list samrumantimer-db --remote`)만 안내한다. 두 명령은 별개이므로 스키마 변경이 있으면 둘 다 실행했는지 확인한다

## 1회성 설정

### 조회용 API 토큰

1. Cloudflare 대시보드 → My Profile(또는 Manage Account) → API Tokens → Create Token → Custom token
2. 권한: Workers 역할 "Metadata Read-Only"(읽기 전용), 범위는 이 계정의 `samrumantimer` Worker로 한정한다. 쓰기 권한은 주지 않는다. CLI는 조회만 한다
3. 확인:
   - `node scripts/obs.mjs errors --since 1h` → 0으로 끝나면 로그 쿼리 권한이 있다
   - `node scripts/obs.mjs issues` → 403이면 이 권한으로 Issues API가 열리지 않는 것이다. 토큰 편집 화면에서 Observability·Issues 관련 읽기 권한을 찾아 추가하거나, verify에 `--skip-issues`를 쓴다. (2026-10 기준 Issues API까지 되는지 확인되지 않았다. 확인하면 이 단락을 고친다)
4. 저장: 셸 프로필(`~/.zshrc`의 `export CF_OBS_TOKEN=...`) 또는 1Password(`op run`·환경 주입). 저장소·`.env*`·`.dev.vars`에는 넣지 않는다. 노출되면 대시보드에서 즉시 roll한다

### Issues → Claude Code 자동화 (선택)

Issues의 알림 목적지로 Claude Code Routine(Routine ID + 토큰)이나 Generic webhook을 지정하면, 새 Issue가 생길 때 에이전트가 이 런북으로 조사를 시작하게 할 수 있다. 계정 설정이라 코드로 두지 않는다.

- Claude Code Routine은 research preview이고 Claude 구독이 필요하다. Routine 실행은 구독 사용량을 쓴다. Cloudflare 쪽(Free 플랜)은 추가 과금이 없다
- Routine 프롬프트에는 `prod-triage` skill로 Issue ID를 넘기게 하고, 배포·마이그레이션·머지는 하지 않도록 둔다(이 문서의 승인 규칙)
- 알림 폭주를 막으려면 새 Issue에만 걸고, 재발(regression) 알림은 사람이 보는 채널로 둔다

### invocation log

켜면 요청마다 상태 코드·지연이 남아 조사가 쉬워지지만 `Cookie` 헤더가 남을 수 있다. 켜기 전 마스킹 확인 절차는 `docs/ARCHITECTURE.md` "invocation log를 켜는 절차"를 따른다. 켜기 전에는 5xx를 Issues가 http-status로 잡는지 확인되지 않았다. 앱은 5xx를 낼 때 level=error 로그를 남기므로 structured-log 경로(`errors`, `verify`)로 잡힌다.

### 무료 한도

Workers Logs·Issues는 Free 한도 안에서만 쓴다. 한도와 초과 시 동작(1% 샘플링 또는 수집 중단, 과금 없음)은 `docs/ARCHITECTURE.md` "무료 한도와 초과 시 동작". 한도를 넘긴 날에는 로그가 빠지므로 verify가 `insufficient`나 거짓 `clean`이 될 수 있다. 대시보드 사용량을 함께 본다.

## 대시보드에서 찾기

CLI 대신 Cloudflare 대시보드 → Workers & Pages → `samrumantimer` → Observability(Logs)의 쿼리 빌더로도 같은 필터를 쓸 수 있다.

- 사용자 신고 추적: `requestId` = 응답 헤더 `x-request-id` 값
- 서버 오류 전체: `level` = `error`
- 특정 배포: `versionTag` = 배포 태그
- 마이그레이션 누락 의심: `kind` = `schema_drift`
- 로그인 장애: `event` = `auth.login.failed`, `stage`·`status`·`timedOut`로 나눠 본다
- 세션 탈취 의심: `event` = `auth.refresh.reuse_detected`
- 묶인 오류는 Issues 탭에서 본다
