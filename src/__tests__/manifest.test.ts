import manifest from "@/app/manifest";
import { existsSync } from "node:fs";
import { join } from "node:path";

describe("manifest", () => {
  const m = manifest();

  it("설치 앱 기본 정보", () => {
    expect(m.name).toBe("삼루먼타이머");
    expect(m.short_name).toBe("삼루먼타이머");
    expect(m.display).toBe("standalone");
    // "/"는 리다이렉트를 거치므로 목록에서 바로 시작한다
    expect(m.start_url).toBe("/projects");
    expect(m.scope).toBe("/");
  });

  it("192·512 any 아이콘과 maskable 아이콘을 별도 항목으로 둔다", () => {
    const icons = m.icons ?? [];
    expect(icons).toContainEqual(expect.objectContaining({ sizes: "192x192", purpose: "any" }));
    expect(icons).toContainEqual(expect.objectContaining({ sizes: "512x512", purpose: "any" }));
    expect(icons).toContainEqual(expect.objectContaining({ sizes: "512x512", purpose: "maskable" }));
    // "any maskable"처럼 합치면 any 용도에서 로고가 지나치게 작아진다
    for (const icon of icons) expect(icon.purpose?.split(" ")).toHaveLength(1);
  });

  it("아이콘 파일이 public에 있다", () => {
    for (const icon of m.icons ?? []) {
      expect(existsSync(join(process.cwd(), "public", icon.src))).toBe(true);
    }
  });
});
