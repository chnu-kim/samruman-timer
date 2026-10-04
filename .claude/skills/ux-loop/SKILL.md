---
name: ux-loop
description: 서비스 전체 UI/UX 개선 루프(평가 → 백로그 → worktree 병렬 구현 → 리뷰 → 머지·배포 → 재평가)를 이어 가거나 한 차수를 돌릴 때. 백로그·결정은 docs/UX-LOOP.md.
argument-hint: "[next | eval | status]"
---

목표는 사용자가 Apple 수준의 완성도를 느끼는 것이다. 사용자는 미니멀·추상화를 중시하고, 요소를 더하기보다 줄이는 쪽을 고른다. 모든 지적과 완료 판정은 직접 본 근거(스크린샷, Playwright 측정값, axe, 콘솔 오류)로 한다. 인자: $ARGUMENTS

- `status`: `docs/UX-LOOP.md`의 남은 작업과 사용자 결정 대기를 요약한다.
- `next`(기본): 남은 작업에서 다음 차수를 편성해 구현부터 배포까지 돌린다.
- `eval`: 현재 main을 재평가해 새 백로그 항목을 만든다.

## 자료

- `docs/UX-LOOP.md` — 지금까지 한 것, 남은 작업(완료 판정·주요 파일 포함), 충돌 권고에 대한 결정, 지켜야 할 것. 새 지적이 여기 결정과 부딪히면 결정을 따른다.
- `docs/ux/RUBRIC.md`(논문·표준 근거, 심각도 S1~S4), `docs/ux/APPLE-HIG.md`(측정 방법이 붙은 체크리스트).
- `.claude/workflows/ux-impl-wave.js`, `ux-reeval.js` — 차수 구현과 재평가 워크플로. 인자 형식은 파일 머리 주석에 있다.

## 비용

2026-10-04 세션은 사용량 대부분이 워크플로 하위 에이전트와 8시간 넘는 세션, 150k 넘는 컨텍스트에서 나왔다. 품질 게이트는 그대로 두고 규모를 줄인다.

- 명세(완료 판정·주요 파일)가 분명한 구현은 Sonnet, 상태 처리·입력 규칙처럼 로직이 얽힌 항목만 Opus. 디자인 판단(평가 종합, 백로그 작성)은 Fable.
- 리뷰는 PR당 한 번, Codex 우선. Codex를 못 쓰면 Claude 리뷰 하나.
- 재평가는 화면 묶음 기준 8명 이하. 같은 화면을 여러 관점이 겹쳐 보면 지적이 대부분 중복된다(2회차 149건 → 37개).
- 동기화·게이트·프로덕션 확인 같은 기계적 단계는 Sonnet, effort low.
- 프롬프트에는 해당 백로그 절만 넣는다. 차수가 끝나면 메모리에 상태를 남기고 세션을 정리한다.

## 환경 사실

- **Playwright**: 저장소 의존성이 아니다. 세션 scratchpad에 `npm i playwright @axe-core/playwright && npx playwright install chromium`으로 깐다. 디렉터리 이름에 `eval`을 쓰지 않는다. 권한 deny 규칙 `Bash(eval:*)` 때문에 경로에 `eval`이 든 명령이 거부된 적이 있다.
- **로그인**: `node scripts/dev-tokens.mjs --out <dir> --count N`이 로컬 D1에 토큰을 만든다. 토큰 하나는 브라우저 컨텍스트 하나에서만 쓴다. 재사용 탐지 때문이다. 에이전트마다 번호 범위를 겹치지 않게 나눠 준다. 끝나면 `--clean`.
- **로컬 D1**: 평가·구현 전에 `pnpm db:migrate:local`. 2회차 재평가는 0010이 빠진 로컬 DB에서 돌아 goals·logs·graph가 500이었고, 노이즈 24건 대부분이 여기서 나왔다.
- **dev 서버**: 평가는 지금 main을 띄운 서버로 한다. 오래 띄워 둔 서버가 옛 커밋을 보여 줘 이미 고친 지적이 다시 나온 적이 있다.
- **worktree**: 원 저장소의 `.wrangler`(로컬 D1 사본)와 `.env*`·`.dev.vars`를 복사하고 `pnpm install --frozen-lockfile`. `node_modules`를 저장소 밖으로 symlink하면 Turbopack 빌드가 'points out of the filesystem root'로 죽는다. 테스트는 돌지만 빌드 확인에는 쓸 수 없다. 토큰은 복사 전에 원 저장소 D1에 만들어 둔다.
- **부하**: 병렬 차수 중에는 load average가 크게 올라가 jsdom 페이지 테스트가 5초 타임아웃으로 떨어진다. 실패한 파일만 단독으로 다시 돌려 확인하고, 그렇게 했다고 적는다.

## 구현 차수

1. **편성**: 같은 파일을 고치는 항목은 다른 차수로 나눈다. 텍스트 충돌이 없어도 의미가 부딪힐 수 있다. 차수마다 항목 하나가 PR 하나다.
2. **구현**(worktree, 항목별 dev 포트): 수정 전(main)과 수정 후를 같은 조건으로 찍고 완료 판정을 측정한다. 완료 판정은 가능하면 테스트로 고정한다. 원격 마이그레이션이 필요한 변경은 멈추고 사용자 확인을 받는다.
3. **리뷰**: 워크플로 하위 에이전트에게는 Agent 도구가 없다. 그래서 "리뷰 서브에이전트를 띄워라"는 지시는 실패한다. 구현 에이전트는 Codex(`codex-pr-review` 스킬이 쓰는 companion 런타임, `--wait`)나 `code-review` 스킬로 리뷰하고, 타당한 지적을 반영한다. 반영하지 않은 지적은 PR 본문과 `docs/UX-LOOP.md`에 남긴다. 리뷰에서 나온 지적이 머지 뒤 사라지는 일이 있었다.
4. **누적 병합 확인**: 병렬 PR은 하나씩 보면 main과 충돌이 없어도, 합치면 개수를 고정한 테스트(radius·터치 대상 예외 목록 등)가 깨진다. 머지 전에 메인 루프에서 확인한다.
   ```bash
   cur=$(git rev-parse origin/main)
   for b in <브랜치들>; do t=$(git merge-tree --write-tree $cur origin/$b | head -1) && cur=$(git commit-tree "$t" -p $cur -p origin/$b -m sim); done
   git worktree add --detach <scratchpad>/sim $cur   # 여기서 pnpm install 후 pnpm test
   ```
   zsh에서 `$var:src/...`는 `:s` 수식자로 해석된다. `"${var}:path"`로 쓴다. 깨지면 별도 통합 PR로 맞춘다.
5. **머지·배포**: 메인 루프가 직접 한다. 하위 에이전트가 하면 분류기가 `gh pr merge`를 막고, 에이전트도 스스로 배포를 거부한다. 명령은 단독으로 실행한다. `gh pr merge <n> --merge`, `pnpm -C <repo> run deploy`. 배포 전에 `npx wrangler d1 migrations list samrumantimer-db --remote`로 확인한다.
6. **배포 확인**: `/api/health`와 주요 페이지를 브라우저(Playwright)로 연다. curl은 권한에서 막혀 있다. 배포 직후 몇십 초는 이전 빌드 청크가 404로 보일 수 있으니, 새 컨텍스트로 다시 열어 확인한다. 운영 로그는 `prod-triage` 스킬 방식(`--print-plugin-code` → 플러그인 execute → `--input`)으로 본다.
7. **기록**: `docs/UX-LOOP.md`에서 끝난 항목을 '지금까지'로 옮기고, 남은 지적과 사용자 결정을 갱신한다.

## 워크플로 다루기

- 실행 중인 워크플로 에이전트에게 SendMessage를 보내지 않는다. 같은 worktree에 인스턴스가 하나 더 떠 작업이 겹친 적이 있다.
- 결과가 크면 워크플로 출력 파일을 직접 읽지 말고, 필요한 필드만 뽑아 본다.
- 조직 설정이나 한도로 중간에 죽은 에이전트는 같은 worktree에서 이어서 하게 하고, 처음부터 다시 돌리지 않는다.
