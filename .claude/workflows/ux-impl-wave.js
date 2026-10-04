export const meta = {
  name: 'ux-impl-wave',
  description: 'UX 루프 한 차수: docs/UX-LOOP.md 항목을 worktree에서 병렬 구현·검증·PR·리뷰까지(머지는 메인 루프)',
  whenToUse: 'ux-loop 스킬의 구현 차수. 서로 다른 파일을 고치는 항목 여러 개를 동시에 진행할 때',
  phases: [{ title: 'Implement', detail: '항목마다 worktree 하나, PR 하나' }],
}
// args = {
//   repo: 원 저장소 절대 경로,
//   playwrightDir: Playwright가 설치된 scratchpad 폴더(스크립트·스크린샷도 여기 아래 impl/<wid>/),
//   tokenDir: scripts/dev-tokens.mjs로 만든 토큰 폴더, tokensPerItem: 항목당 토큰 수(기본 20),
//   portBase: dev 포트 시작(예: 3201),
//   items: [{ wid: 'W32', title: '...', files: '주요 파일 요약', model: 'sonnet' | 'opus', note?: '추가 지시' }],
// }
// 메인 저장소의 dev 서버(:3000)가 수정 전(main) 화면이다. 실행 전에 띄워 둔다.
const REPO = args.repo // 원 저장소 절대 경로
const per = args.tokensPerItem || 20
const REPORT = {
  type: 'object',
  properties: {
    wid: { type: 'string' }, pr: { type: 'number' }, branch: { type: 'string' }, worktree: { type: 'string' },
    summary: { type: 'string' }, verification: { type: 'string' }, review: { type: 'string' },
    unresolved: { type: 'string', description: '반영하지 않은 리뷰 지적과 이유, 다른 항목으로 넘긴 것' },
    gates: { type: 'string' },
  },
  required: ['wid', 'pr', 'branch', 'worktree', 'summary', 'verification', 'review', 'unresolved', 'gates'],
}
phase('Implement')
const res = await parallel(args.items.map((b, i) => () => agent(`ux-loop 스킬(.claude/skills/ux-loop/SKILL.md)의 '환경 사실'과 '구현 차수'를 따라 UX 백로그 항목 하나를 구현해 PR까지 만든다.

담당: ${b.wid} — ${b.title}
명세: ${REPO}/docs/UX-LOOP.md 의 '${b.wid}' 절(변경 사항·완료 판정·주요 파일). 같은 문서 §3 결정과 §4 지켜야 할 것을 바꾸지 않는다. '사용자 결정'으로 표시된 소항목은 적힌 기본안으로 한다.
${b.note ? `추가 지시: ${b.note}\n` : ''}같은 차수의 다른 항목(범위를 건드리지 않는다): ${args.items.filter((x) => x.wid !== b.wid).map((x) => `${x.wid}(${x.files})`).join(' / ') || '없음'}

준비(worktree 안):
  git fetch -q origin && git checkout -b ux/${b.wid.toLowerCase()}-<짧은-영문> origin/main
  cp -R ${REPO}/.wrangler ./ ; cp ${REPO}/.env* ${REPO}/.dev.vars ./ 2>/dev/null ; pnpm install --frozen-lockfile
dev 포트: ${args.portBase + i} (끝나면 종료). 수정 전 화면은 http://localhost:3000.
로그인 토큰: ${args.tokenDir}/${i * per + 1}.txt ~ ${(i + 1) * per}.txt (브라우저 컨텍스트 하나에 토큰 하나. 수정 전·후 확인에도 서로 다른 번호를 쓴다)
Playwright: ${args.playwrightDir} (스크립트·결과는 ${args.playwrightDir}/impl/${b.wid}/)

순서: 구현 → 테스트·스토리·문서 → 수정 전/후 측정(완료 판정) → pnpm test, pnpm build, UI 변경 시 pnpm build-storybook → 커밋(Conventional Commits 한국어, 끝에 Co-Authored-By) → push → gh pr create --base main(본문에 근거·변경·전후 측정·남은 것, 끝에 🤖 Generated with [Claude Code](https://claude.com/claude-code)) → 리뷰 한 번(Codex companion review --wait --base main, 못 쓰면 code-review 스킬) → 타당한 지적 반영·게이트 재통과. 머지·배포는 하지 않는다.`,
  { label: `impl:${b.wid}`, phase: 'Implement', schema: REPORT, model: b.model || 'sonnet', isolation: 'worktree' })))
return res
