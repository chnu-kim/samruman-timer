import { readFileSync } from "node:fs";
import { join } from "node:path";

// next.config.ts가 import 때 실행하는 dev용 초기화를 막는다
vi.mock("@opennextjs/cloudflare", () => ({ initOpenNextCloudflareForDev() {} }));

/** public/_headers를 { 경로: { 헤더: 값 } }로 읽는다 */
function parseHeadersFile(text: string) {
  const rules: Record<string, Record<string, string>> = {};
  let current: Record<string, string> | null = null;
  for (const line of text.split("\n")) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      current = rules[line.trim()] = {};
    } else if (current) {
      const idx = line.indexOf(":");
      current[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return rules;
}

describe("public/_headers", () => {
  const rules = parseHeadersFile(readFileSync(join(process.cwd(), "public/_headers"), "utf8"));

  it("/* 보안 헤더가 next.config.ts의 /:path* 공통 헤더와 같다", async () => {
    const { default: config } = await import("../../next.config");
    const entries = await config.headers!();
    const common = entries.find((e) => e.source === "/:path*")!;
    const expected = Object.fromEntries(common.headers.map((h) => [h.key, h.value]));
    expect(rules["/*"]).toEqual(expected);
  });

  it("/sw.js는 HTTP 캐시에 묶이지 않는다", () => {
    expect(rules["/sw.js"]["Cache-Control"]).toBe("no-cache");
  });

  it("오프라인 페이지는 프레이밍을 막는다", () => {
    for (const path of ["/offline", "/offline.html"]) {
      expect(rules[path]["X-Frame-Options"]).toBe("DENY");
      expect(rules[path]["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    }
  });
});
