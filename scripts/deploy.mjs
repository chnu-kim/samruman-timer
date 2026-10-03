#!/usr/bin/env node
// pnpm run deploy 진입점. git short SHA를 Worker 버전 태그로 붙여 배포한다.
// 태그는 운영 로그의 versionTag가 되어 `node scripts/obs.mjs verify --tag <tag>`로 재발 여부를 가른다.
//
// 사용: node scripts/deploy.mjs [--dry-run] [--allow-dirty] [--allow-off-main]
//   --dry-run         실행할 명령만 출력하고 빌드·배포하지 않는다
//   --allow-dirty     커밋되지 않은 변경이 있어도 배포한다. 태그에 -dirty가 붙는다
//   --allow-off-main  HEAD가 origin/main에 없어도 배포한다(기능 브랜치·push 안 한 커밋)
import { spawnSync } from "node:child_process";
import { resolveDeployTag, deploySteps, checkDeployRef } from "./lib/version-tag.mjs";

const FLAGS = ["--dry-run", "--allow-dirty", "--allow-off-main"];
const USAGE = `사용: node scripts/deploy.mjs [${FLAGS.join("] [")}]`;

const args = new Set(process.argv.slice(2));
const unknown = [...args].filter((a) => !FLAGS.includes(a));
if (unknown.length > 0) {
  console.error(`알 수 없는 인자: ${unknown.join(" ")}`);
  console.error(USAGE);
  process.exit(1);
}
const dryRun = args.has("--dry-run");
const allowDirty = args.has("--allow-dirty");
const allowOffMain = args.has("--allow-off-main");

function git(gitArgs) {
  const r = spawnSync("git", gitArgs, { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(`git ${gitArgs.join(" ")} 실패: ${(r.stderr || "").trim()}`);
    process.exit(1);
  }
  return r.stdout;
}

const result = resolveDeployTag({
  sha: git(["rev-parse", "--short=12", "HEAD"]),
  porcelain: git(["status", "--porcelain"]),
  allowDirty,
});

if (!result.ok) {
  console.error(`배포 중단: ${result.reason}`);
  if (result.files) {
    for (const f of result.files.slice(0, 20)) console.error(`  ${f}`);
    if (result.files.length > 20) console.error(`  … 외 ${result.files.length - 20}개`);
    console.error("커밋하거나 정리한 뒤 다시 실행한다. 꼭 지금 배포해야 하면 --allow-dirty(태그에 -dirty가 붙는다)");
  }
  process.exit(1);
}

// 로컬의 origin/main 기준이다(fetch하지 않는다). 오래됐으면 거부 메시지가 git fetch를 안내한다
const onOriginMain = spawnSync("git", ["merge-base", "--is-ancestor", "HEAD", "origin/main"]).status === 0;
const ref = checkDeployRef({ onOriginMain, allowOffMain });
if (!ref.ok) {
  console.error(`배포 중단: ${ref.reason}`);
  process.exit(1);
}
if (ref.warning) console.warn(`경고: ${ref.warning}`);

console.log(`배포 태그: ${result.tag}${result.dirty ? " (커밋되지 않은 변경 포함)" : ""}`);
// 원격 마이그레이션은 이 스크립트가 적용하지 않는다(사람 승인 대상). 코드만 배포되고 마이그레이션이 빠진 장애 이력이 있다
console.log("배포 전 확인: npx wrangler d1 migrations list samrumantimer-db --remote (적용 안 된 마이그레이션이 있으면 먼저 적용)");

// shell 없이 실행한다. --tag=값은 opennextjs-cloudflare가 unknown-options-as-args로 wrangler deploy에 넘긴다
for (const [cmd, cmdArgs] of deploySteps(result.tag)) {
  console.log(`$ ${cmd} ${cmdArgs.join(" ")}`);
  if (dryRun) continue;
  const r = spawnSync(cmd, cmdArgs, { stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`실패: ${cmd} ${cmdArgs.join(" ")} (exit ${r.status ?? r.signal})`);
    process.exit(r.status ?? 1);
  }
}

if (dryRun) {
  console.log("--dry-run: 빌드·배포하지 않았다");
} else {
  // verify --since에 쓸 배포 시각. 다른 세션에서는 npx wrangler deployments list로 태그·시각을 다시 구한다
  const deployedAt = new Date().toISOString();
  console.log(`배포 완료: ${deployedAt} (태그 ${result.tag})`);
  console.log(`재발 확인: node scripts/obs.mjs verify --tag ${result.tag} --since ${deployedAt} [--event <e>] [--issue <id>] [--expect-event <e>]`);
}
