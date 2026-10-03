---
name: prod-triage
description: 프로덕션 운영 로그·Issues로 장애를 조사하고, 수정 PR을 만들고, 배포 후 재발 여부를 버전 태그로 확인한다. 인자로 Issue ID, requestId(x-request-id), `verify <tag>`, 또는 없음(최근 오류 훑기)을 받는다.
argument-hint: "[<Issue ID> | <requestId> | verify <tag> | (없음)]"
---

프로덕션 문제를 감지 → 원인 → 수정 → 재발 판정까지 닫는 루프다. 절차·이벤트 의미·판정 기준은 `docs/OBSERVABILITY.md`에 있고, 이 skill은 그 문서를 따라 움직이는 순서다. 인자: $ARGUMENTS

조회는 `node scripts/obs.mjs`(읽기 전용, `CF_OBS_TOKEN` 필요)로 한다. 토큰이 없으면 2로 끝나므로 사용자에게 OBSERVABILITY "1회성 설정"을 안내하고 멈춘다. 결과를 대화·PR에 옮길 때도 PII 규칙(토큰·쿠키·nickname·chzzkUserId·쿼리스트링 금지)을 지킨다.

## 인자별 시작점

- 없음: `obs.mjs issues`, `obs.mjs errors --since 24h`, `obs.mjs summary --since 24h`로 지금 무엇이 비정상인지 고른다. 카탈로그의 정상/비정상 기준으로 거르고, 조사할 것이 없으면 그렇게 보고하고 끝낸다
- Issue ID(대시보드 Issues의 ID): `obs.mjs issue <id>`로 occurrence의 경로·오류·버전 태그를 본다
- requestId(사용자가 준 응답 헤더 `x-request-id`): `obs.mjs request <requestId>`. 보관 기간(현재 3일)이 지났으면 0건이다
- `verify <tag>`: 아래 "재발 판정"으로 바로 간다

## 원인

1. 이벤트와 `kind`로 카탈로그의 해당 항목을 찾고, 거기 적힌 코드 위치를 읽는다. `schema_drift`면 코드보다 `npx wrangler d1 migrations list samrumantimer-db --remote`가 먼저다(코드만 배포되고 마이그레이션이 빠진 장애 이력). `timeout`이면 CHZZK 상태가 먼저다
2. `versionTag`로 언제 시작됐는지 본다. 이전 태그와 비교해 `git log <이전>..<현재>`에서 의심 변경을 찾는다
3. 로컬에서 재현한다. 가장 좋은 재현은 실패하는 테스트다(`.claude/rules/testing.md`의 목 전략). 재현하지 못하면 추측으로 고치지 말고, 무엇을 확인했고 무엇이 모자란지 보고한다
4. 원인이 코드 밖(Secret 누락, 원격 마이그레이션, CHZZK 장애, 토큰 권한)이면 고칠 PR이 없다. 사람이 할 조치와 확인 명령을 정리해 넘긴다

## 수정

- main에서 브랜치를 만들고, 실패 테스트 → 수정 → `pnpm test`·`pnpm build` 순으로 진행한다. 커밋은 프로젝트 컨벤션(`.claude/skills/commit`)을 따른다
- 원인과 무관한 정리는 섞지 않는다. 리뷰어가 수정과 원인을 1:1로 대조할 수 있어야 한다
- PR 본문에 근거(이벤트·건수·기간·requestId)와 배포 후 실행할 verify 명령을 적는다
- 로그가 부족해 원인을 좁히기 어려웠다면, 같은 PR이나 별도 PR에서 로그 필드를 보강하고 카탈로그를 갱신한다

## 사람 승인이 필요한 단계

배포(`pnpm run deploy`), 원격 마이그레이션(`pnpm db:migrate:remote`), PR 머지, Secret 변경, Issue resolve는 사람이 한다. 프로덕션에 바로 영향을 주고 되돌리기 어렵기 때문이다. 이 단계에 오면 무엇을 왜 해야 하는지, 실행할 명령, 확인 방법을 정리해 사용자에게 넘기고 멈춘다. 사용자가 이 대화에서 명시적으로 요청한 경우에만 실행한다.

배포는 `scripts/deploy.mjs`가 git short SHA(12자) 태그를 붙인다. 출력된 태그와 배포 시각을 다음 단계에 쓴다.

## 재발 판정

`node scripts/obs.mjs verify --tag <tag> --since <배포 시각 ISO> [--event <event>] [--issue <id>]`

- exit 0(`clean`): 그 버전에서 대상 오류가 없다. Issue resolve를 사용자에게 제안한다
- exit 1(`recurred`): 다시 났다. 출력된 error·occurrence로 "원인"으로 돌아간다
- exit 2: 조회 실패 또는 근거 부족. `insufficient`(태그 로그가 적음)는 배포 직후·조용한 시간대에 흔하다. `npx wrangler versions list`로 그 태그가 실제로 배포됐는지 확인하고, 배포됐으면 시간을 두고 다시 보거나 `--min-events 0`을 쓴다. Issues가 403이면 `--skip-issues`로 로그만 보되, 그 한계를 보고에 적는다

판정 근거(태그, 기간, 건수, notes)를 함께 보고한다. exit 2를 "재발 없음"으로 보고하지 않는다.

## 마무리

카탈로그의 정상/비정상 기준이나 조사 명령이 실제와 달랐다면 `docs/OBSERVABILITY.md`를 고친다. `obs.mjs` 출력이 비어 있는데 대시보드에는 데이터가 있다면 응답 모양이 예상과 다른 것이다. `--json`으로 원문을 보고 `scripts/lib/obs.mjs`의 정규화를 고치는 것을 제안한다.
