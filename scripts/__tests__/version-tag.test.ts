import { describe, it, expect } from "vitest";
import { resolveDeployTag, normalizeVerifyTag, deploySteps, checkDeployRef, TAG_PATTERN, SHA_LENGTH } from "../lib/version-tag.mjs";

describe("resolveDeployTag", () => {
  it("깨끗한 트리는 12자 short SHA를 태그로 쓴다", () => {
    const r = resolveDeployTag({ sha: "abcdef0123456789\n", porcelain: "" });
    expect(r).toEqual({ ok: true, tag: "abcdef012345", dirty: false });
    expect(SHA_LENGTH).toBe(12);
  });

  it("dirty 트리(추적 안 되는 파일 포함)는 기본으로 거부한다", () => {
    const r = resolveDeployTag({ sha: "abcdef012345", porcelain: " M src/a.ts\n?? new.ts\n" });
    expect(r).toEqual({
      ok: false,
      reason: expect.stringContaining("커밋되지 않은 변경"),
      files: [" M src/a.ts", "?? new.ts"],
    });
  });

  it("allowDirty면 -dirty를 붙인다", () => {
    const r = resolveDeployTag({ sha: "abcdef012345", porcelain: "?? x\n", allowDirty: true });
    expect(r).toEqual({ ok: true, tag: "abcdef012345-dirty", dirty: true });
  });

  it("SHA가 hex가 아니면 거부한다(셸 메타문자 차단)", () => {
    expect(resolveDeployTag({ sha: "abc; rm -rf /", porcelain: "" }).ok).toBe(false);
    expect(resolveDeployTag({ sha: "", porcelain: "" }).ok).toBe(false);
  });

  it("TAG_PATTERN은 공백·메타문자를 허용하지 않는다", () => {
    expect(TAG_PATTERN.test("abcdef012345")).toBe(true);
    expect(TAG_PATTERN.test("abcdef012345-dirty")).toBe(true);
    expect(TAG_PATTERN.test("abc def")).toBe(false);
    expect(TAG_PATTERN.test("abcdef0$(x)")).toBe(false);
  });
});

describe("normalizeVerifyTag", () => {
  it("12자 태그와 -dirty는 그대로 받는다", () => {
    expect(normalizeVerifyTag("abcdef012345")).toEqual({ ok: true, tag: "abcdef012345" });
    expect(normalizeVerifyTag("abcdef012345-dirty")).toEqual({ ok: true, tag: "abcdef012345-dirty" });
  });

  it("전체 SHA는 deploy와 같은 12자로 자른다", () => {
    expect(normalizeVerifyTag("abcdef0123456789abcdef0123456789abcdef01")).toEqual({ ok: true, tag: "abcdef012345" });
  });

  it("7자 SHA(git log --oneline)는 rev-parse 안내와 함께 거부한다", () => {
    const r = normalizeVerifyTag("abcdef0");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain("git rev-parse --short=12");
  });

  it("hex가 아니거나 문자열이 아니면 거부한다", () => {
    expect(normalizeVerifyTag("abc; rm").ok).toBe(false);
    expect(normalizeVerifyTag(true).ok).toBe(false);
  });

  it("deploy가 만드는 태그는 verify가 그대로 받는다", () => {
    const deployed = resolveDeployTag({ sha: "abcdef0123456789", porcelain: "" });
    expect(deployed.ok && normalizeVerifyTag(deployed.tag)).toEqual({ ok: true, tag: "abcdef012345" });
  });
});

describe("deploySteps", () => {
  it("태그를 --tag=값 한 인자로 넘긴다(yargs가 1234567890e3 같은 값을 숫자로 바꾸지 못하게)", () => {
    for (const tag of ["abcdef012345", "1234567890e3", "123456789e05-dirty"]) {
      const [, deploy] = deploySteps(tag);
      expect(deploy).toEqual(["npx", ["opennextjs-cloudflare", "deploy", `--tag=${tag}`]]);
      expect(deploy[1]).not.toContain("--tag");
    }
    expect(deploySteps("abcdef012345")[0]).toEqual(["npx", ["opennextjs-cloudflare", "build"]]);
  });
});

describe("checkDeployRef", () => {
  it("HEAD가 origin/main에 있으면 통과", () => {
    expect(checkDeployRef({ onOriginMain: true })).toEqual({ ok: true });
  });

  it("없으면 git fetch·머지 안내와 함께 거부하고, --allow-off-main이면 경고만 한다", () => {
    const r = checkDeployRef({ onOriginMain: false });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain("git fetch");
    expect(!r.ok && r.reason).toContain("--allow-off-main");
    const allowed = checkDeployRef({ onOriginMain: false, allowOffMain: true });
    expect(allowed).toEqual({ ok: true, warning: expect.stringContaining("origin/main") });
  });
});
