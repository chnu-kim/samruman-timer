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
