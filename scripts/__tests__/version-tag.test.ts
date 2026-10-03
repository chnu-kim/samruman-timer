import { describe, it, expect } from "vitest";
import { resolveDeployTag, TAG_PATTERN, SHA_LENGTH } from "../lib/version-tag.mjs";

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
