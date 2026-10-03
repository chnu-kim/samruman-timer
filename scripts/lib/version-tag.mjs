// 배포 버전 태그 규칙. deploy.mjs(태그 붙이기)와 obs.mjs(verify --tag)가 같은 문자열을 만들도록 한곳에 둔다.

/** 짧은 SHA 길이. 저장소가 커져도 충돌하지 않을 만큼 길게, wrangler 태그로 읽기 쉬울 만큼 짧게 */
export const SHA_LENGTH = 12;

/** 태그는 OpenNext가 shell:true로 wrangler에 넘기므로 셸 메타문자가 없는 값만 허용한다 */
export const TAG_PATTERN = /^[0-9a-f]{7,40}(-dirty)?$/;

/**
 * git 상태로 배포 태그를 정한다.
 * dirty 트리는 기본으로 거부한다. verify는 태그 → 커밋 대응에 기대는데, 커밋되지 않은 변경이 섞인 빌드는
 * 어느 커밋과도 맞지 않기 때문이다. allowDirty면 `-dirty`를 붙여 깨끗한 빌드와 구분되게 한다.
 *
 * @param {{ sha: string, porcelain: string, allowDirty?: boolean }} input
 *   sha: `git rev-parse --short=12 HEAD` 출력, porcelain: `git status --porcelain` 출력(추적 안 되는 파일 포함)
 * @returns {{ ok: true, tag: string, dirty: boolean } | { ok: false, reason: string, files?: string[] }}
 */
export function resolveDeployTag({ sha, porcelain, allowDirty = false }) {
  const short = String(sha).trim().slice(0, SHA_LENGTH);
  if (!/^[0-9a-f]{7,40}$/.test(short)) {
    return { ok: false, reason: `git SHA를 읽지 못했다: ${JSON.stringify(String(sha).trim())}` };
  }
  const files = String(porcelain)
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  const dirty = files.length > 0;
  if (dirty && !allowDirty) {
    return { ok: false, reason: "커밋되지 않은 변경이 있다(추적 안 되는 파일 포함)", files };
  }
  const tag = dirty ? `${short}-dirty` : short;
  if (!TAG_PATTERN.test(tag)) {
    return { ok: false, reason: `태그 형식이 맞지 않다: ${tag}` };
  }
  return { ok: true, tag, dirty };
}

/**
 * verify --tag 입력을 배포 태그 형식(SHA_LENGTH자 hex, 선택적 -dirty)으로 맞춘다.
 * 더 긴 SHA(전체 40자 등)는 앞 SHA_LENGTH자로 자른다. 더 짧은 SHA(`git log --oneline`의 7자 등)는
 * 어떤 로그의 versionTag와도 맞지 않아 "로그 0건"으로 보이므로 거부하고 바른 명령을 알려 준다.
 *
 * @param {unknown} input
 * @returns {{ ok: true, tag: string } | { ok: false, reason: string }}
 */
export function normalizeVerifyTag(input) {
  const m = typeof input === "string" ? /^([0-9a-f]+)(-dirty)?$/.exec(input.trim().toLowerCase()) : null;
  if (!m) {
    return { ok: false, reason: `태그 형식이 아니다: ${JSON.stringify(input)} (git short SHA ${SHA_LENGTH}자, pnpm run deploy 출력)` };
  }
  const [, hex, dirty = ""] = m;
  if (hex.length < SHA_LENGTH || hex.length > 40) {
    return {
      ok: false,
      reason: `배포 태그는 SHA ${SHA_LENGTH}자다(받은 값 ${hex.length}자). git rev-parse --short=${SHA_LENGTH} <commit>으로 구한다`,
    };
  }
  return { ok: true, tag: `${hex.slice(0, SHA_LENGTH)}${dirty}` };
}

/**
 * 배포 명령. 태그는 `--tag=<값>` 한 인자로 넘긴다.
 * opennextjs-cloudflare는 yargs `unknown-options-as-args`로 모르는 옵션을 위치 인자 `args..`에 모으는데,
 * `--tag <값>`처럼 값을 따로 주면 그 값이 숫자로 바뀐다(`1234567890e3` → `1234567890000`). 그러면 커밋과 다른 태그로
 * 배포된다. `--tag=<값>`은 한 문자열로 그대로 넘어간다(wrangler도 이 형식을 받는다).
 * @param {string} tag
 * @returns {[string, string[]][]}
 */
export function deploySteps(tag) {
  return [
    ["npx", ["opennextjs-cloudflare", "build"]],
    ["npx", ["opennextjs-cloudflare", "deploy", `--tag=${tag}`]],
  ];
}

/**
 * 배포할 커밋이 공유 이력(origin/main)에 있는지 확인한다.
 * 기능 브랜치나 push 안 한 커밋을 배포하면 태그가 다른 머신·Routine에 없는 커밋을 가리켜
 * `git log <이전 태그>..<태그>` 조사가 막힌다.
 * @param {{ onOriginMain: boolean, allowOffMain?: boolean }} input
 *   onOriginMain: `git merge-base --is-ancestor HEAD origin/main` 성공 여부
 * @returns {{ ok: true, warning?: string } | { ok: false, reason: string }}
 */
export function checkDeployRef({ onOriginMain, allowOffMain = false }) {
  if (onOriginMain) return { ok: true };
  if (allowOffMain) {
    return {
      ok: true,
      warning: "HEAD가 origin/main에 없다. 이 태그의 커밋은 다른 머신에서 찾을 수 없을 수 있다(--allow-off-main)",
    };
  }
  return {
    ok: false,
    reason:
      "HEAD가 origin/main에 없다(기능 브랜치이거나 push하지 않은 커밋). main에 머지·push한 뒤 배포한다. 원격 상태가 오래됐다면 git fetch origin 후 다시 실행한다. 꼭 이 커밋을 배포해야 하면 --allow-off-main",
  };
}
