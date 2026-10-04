import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const SRC = resolve(__dirname, "../../..");
const css = readFileSync(join(SRC, "app/globals.css"), "utf8");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : tsxFiles(path);
    return path.endsWith(".tsx") && !path.endsWith(".stories.tsx") ? [path] : [];
  });
}

// C005: 포커스 링은 globals.css의 :focus-visible 규칙 하나다. 컴포넌트가 따로 링을 달거나 outline을 지우면 모양이 다시 갈린다
describe("포커스 링 단일 규칙", () => {
  it("globals.css가 :focus-visible에 --ring 2px outline과 2px 간격을 준다", () => {
    const start = css.indexOf(":focus-visible {");
    expect(start).toBeGreaterThanOrEqual(0);
    const block = css.slice(start, css.indexOf("}", start));
    expect(block).toContain("outline: 2px solid var(--ring);");
    expect(block).toContain("outline-offset: 2px;");
  });

  it("컴포넌트에 focus ring·outline-none 클래스가 없다", () => {
    const offenders = tsxFiles(SRC).filter((file) =>
      /focus(-visible)?:ring|focus(-visible)?:outline-none|ring-offset|(^|[\s"'`])outline-none/m.test(readFileSync(file, "utf8")),
    );
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });
});

// C012: 동작 줄이기에서는 등장·퇴장 키프레임이 이동 없이 투명도만 바꾼다
describe("동작 줄이기", () => {
  it("reduced-motion 블록이 fade-in·toast-in·toast-out을 transform 없이 다시 정의한다", () => {
    const start = css.indexOf("@media (prefers-reduced-motion: reduce)");
    expect(start).toBeGreaterThanOrEqual(0);
    const block = css.slice(start, css.indexOf("\n}\n", start));
    for (const name of ["fade-in", "toast-in", "toast-out"]) {
      expect(block).toContain(`@keyframes ${name} {`);
    }
    expect(block).not.toMatch(/transform/);
  });
});
