export const meta = {
  name: 'ux-reeval',
  description: 'UX 루프 재평가: 화면 묶음별 실측 평가(8명 이하) → 현재 코드로 검증 → 백로그 초안',
  whenToUse: 'ux-loop 스킬의 eval. 한 차수를 배포한 뒤 새 S2 이상이 남았는지 볼 때',
  phases: [{ title: 'Evaluate' }, { title: 'Verify' }, { title: 'Draft' }],
}
// args = {
//   repo: 원 저장소 절대 경로,
//   playwrightDir: Playwright가 설치된 scratchpad 폴더(결과는 reeval/<group>/),
//   tokenDir, tokensPerGroup(기본 10),
//   head: 평가 대상 커밋(짧은 SHA). :3000 dev 서버가 이 커밋의 main을 띄우고 로컬 D1 마이그레이션이 끝난 상태여야 한다,
//   groups: [{ key: 'console', screens: '콘솔 실행 중·예약·만료·타이머 없음, 모바일 하단 바' }, ...]  // 8개 이하
// }
const REPO = args.repo // 원 저장소 절대 경로
const per = args.tokensPerGroup || 10
const FINDINGS = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: {
      title: { type: 'string' }, severity: { type: 'string', enum: ['S1', 'S2', 'S3', 'S4'] },
      screens: { type: 'string' }, observation: { type: 'string' }, evidence: { type: 'array', items: { type: 'string' } },
      criteria: { type: 'array', items: { type: 'string' } }, recommendation: { type: 'string' },
    }, required: ['title', 'severity', 'screens', 'observation', 'evidence', 'criteria', 'recommendation'] } },
    praise: { type: 'array', items: { type: 'string' } },
  },
  required: ['findings', 'praise'],
}
phase('Evaluate')
const evals = await parallel(args.groups.map((g, i) => () => agent(`삼루먼타이머(${REPO}, main ${args.head})를 http://localhost:3000에서 실측 평가한다. 코드는 원인 위치를 찾을 때만 읽고 수정하지 않는다.
담당 화면: ${g.screens}
기준: docs/ux/RUBRIC.md, docs/ux/APPLE-HIG.md. 이미 내린 결정과 지켜야 할 것: docs/UX-LOOP.md §3·§4 — 여기 결정과 부딪히는 지적은 내지 않는다. 남은 작업(§2)에 이미 있는 것은 '이미 백로그'로 표시만.
방법: Playwright(${args.playwrightDir}, 결과는 reeval/${g.key}/). 데스크톱 1440·모바일 390, 다크·라이트 중 해당하는 조합. 소유자 로그인 토큰 ${args.tokenDir}/${i * per + 1}.txt ~ ${(i + 1) * per}.txt(컨텍스트 하나에 하나). 데이터를 바꾸는 실험은 새 프로젝트를 만들어서 한다.
모든 지적에 증거(스크린샷 경로·측정값·axe·콘솔 오류)와 기준 ID를 단다. 500 같은 환경 오류는 원인을 확인하고 환경 탓이면 지적하지 않는다.`,
  { label: `eval:${g.key}`, phase: 'Evaluate', schema: FINDINGS, model: 'opus' })))
const all = evals.map((e, i) => (e ? e.findings.map((f) => ({ ...f, group: args.groups[i].key })) : [])).flat()
log(`지적 ${all.length}건`)
const serious = all.filter((f) => f.severity !== 'S4')
phase('Verify')
const VERDICT = { type: 'object', properties: { verdicts: { type: 'array', items: { type: 'object', properties: {
  idx: { type: 'number' }, status: { type: 'string', enum: ['real', 'fixed-already', 'noise', 'duplicate'] },
  severity: { type: 'string' }, evidence: { type: 'string' } }, required: ['idx', 'status', 'severity', 'evidence'] } } }, required: ['verdicts'] }
const v = serious.length === 0 ? { verdicts: [] } : await agent(`아래 UX 지적(S1~S3)이 현재 main(${args.head}) 코드에서 실제로 존재하는지 회의적으로 확인한다. 코드를 직접 읽고(필요하면 :3000에서 확인), 서로 중복이면 duplicate로. 근거는 파일:줄 또는 측정값.
${JSON.stringify(serious.map((f, idx) => ({ idx, ...f })), null, 1)}`, { label: 'verify', phase: 'Verify', schema: VERDICT, model: 'sonnet' })
const keep = (v?.verdicts || []).filter((x) => x.status === 'real').map((x) => ({ ...serious[x.idx], verified: x }))
phase('Draft')
const draft = await agent(`검증된 UX 지적으로 docs/UX-LOOP.md §2(남은 작업)에 넣을 항목 초안을 쓴다. 기존 항목 형식(변경 사항, 완료 판정, 주요 파일)을 따르고, 같은 파일을 고치는 지적은 한 항목으로 묶는다. 새 번호는 문서의 마지막 W 번호 다음부터. 기존 항목과 겹치면 그 항목에 합친다고 적는다. S4 관찰은 '다듬기' 한 항목으로 모은다. 문서는 고치지 말고 마크다운 텍스트로만 반환한다.
검증된 지적: ${JSON.stringify(keep, null, 1)}
S4 관찰: ${JSON.stringify(all.filter((f) => f.severity === 'S4').map((f) => f.title + ' — ' + f.recommendation))}`, { label: 'draft', phase: 'Draft', model: 'fable' })
return { counts: { total: all.length, serious: serious.length, real: keep.length }, draft }
