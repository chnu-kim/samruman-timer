import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// W33: 모서리는 세 단계(컨트롤 8px·카드 12px·pill)만 쓴다. rounded(4px)·rounded-sm·rounded-md(6px)가 다시 들어오면 실패한다.
// 다른 작업이 진행 중인 파일은 그 작업에서 정리할 때까지 예외로 둔다(목록은 줄어들기만 한다)
const PENDING: Record<string, string> = {
  "src/components/timer/OverlaySettings.tsx": "W35 진행 중(미리보기 견본)",
  "src/components/timer/TimerConsole.tsx": "그래프 '다시 시도'는 W31·W25에서 link 변형으로 바꾼다",
};

const BANNED = /(?<![\w-])(?:[a-z-]+:)*rounded(?:-(?:xs|sm|md))?(?=["'`\s])/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "__tests__") walk(p, out);
    } else if (/\.tsx?$/.test(name) && !name.endsWith(".stories.tsx")) {
      out.push(p);
    }
  }
  return out;
}

describe("radius 토큰", () => {
  it("globals.css가 컨트롤·카드 radius 토큰을 정의한다", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toMatch(/--radius-control:\s*0\.5rem;/);
    expect(css).toMatch(/--radius-card:\s*0\.75rem;/);
  });

  it("src에 4px·6px 모서리(rounded·rounded-sm·rounded-md)가 없다", () => {
    const offenders: string[] = [];
    for (const file of walk(join(process.cwd(), "src"))) {
      const rel = relative(process.cwd(), file);
      if (rel in PENDING) continue;
      const hits = readFileSync(file, "utf8").match(BANNED);
      if (hits) offenders.push(`${rel}: ${hits.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });

  it("예외 목록의 파일에는 아직 정리할 것이 남아 있다(정리되면 목록에서 뺀다)", () => {
    for (const rel of Object.keys(PENDING)) {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      expect(src.match(BANNED), rel).not.toBeNull();
    }
  });

  it("Button·Input·다이얼로그는 토큰 유틸리티를 쓴다", () => {
    const read = (f: string) => readFileSync(join(process.cwd(), "src/components/ui", f), "utf8");
    expect(read("Button.tsx")).toContain("rounded-control");
    expect(read("Input.tsx")).toContain("rounded-control");
    expect(read("FormDialog.tsx")).toContain("rounded-card");
    expect(read("ConfirmDialog.tsx")).toContain("rounded-card");
  });
});
