import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { buttonClassName } from "../Button";

// W33: 모서리는 세 단계(컨트롤 8px·카드 12px·pill)만 쓴다. rounded(4px)·rounded-sm·rounded-md(6px)가 다시 들어오면 실패한다.
// 다른 작업이 진행 중인 파일은 그 작업에서 정리할 때까지 지금 남은 개수만 허용한다(새로 늘면 실패, 줄면 숫자를 낮춘다)
const PENDING: Record<string, { max: number; why: string }> = {
  "src/components/timer/OverlaySettings.tsx": { max: 9, why: "W35 진행 중(미리보기 견본·체크박스)" },
  "src/components/timer/TimerConsole.tsx": { max: 1, why: "그래프 '다시 시도'는 W31·W25에서 link 변형으로 바꾼다" },
};

// rounded, rounded-xs/sm/md, 16px 이상(2xl·3xl·4xl), 방향 지정(rounded-t-md·rounded-tl 등), 임의값(rounded-[4px])
const SIDE = "(?:t|r|b|l|s|e|tl|tr|br|bl|ss|se|es|ee)";
const BANNED = new RegExp(
  `(?<![\\w-])(?:[a-z-]+:)*rounded(?:-${SIDE})?(?:-(?:xs|sm|md|2xl|3xl|4xl)|-\\[[^\\]]+\\])?(?=["'\`\\s;])`,
  "g",
);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "__tests__") walk(p, out);
    } else if (/\.(tsx?|css)$/.test(name) && !name.endsWith(".stories.tsx")) {
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
      const hits = readFileSync(file, "utf8").match(BANNED) ?? [];
      const allowed = PENDING[rel]?.max ?? 0;
      if (hits.length > allowed) offenders.push(`${rel}: ${hits.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });

  it("예외 개수는 실제로 남은 개수와 같다(정리하면 숫자를 낮추고 0이 되면 목록에서 뺀다)", () => {
    for (const [rel, { max }] of Object.entries(PENDING)) {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      expect(src.match(BANNED)?.length ?? 0, rel).toBe(max);
    }
  });

  it("금지 패턴이 4·6px 변형을 잡고 토큰·8px 이상은 통과시킨다", () => {
    const bad = ['"rounded"', '"rounded-md"', '"p-1 rounded-t-md"', '"rounded-tl"', '"rounded-[6px]"', '"hover:rounded-sm"', '"rounded-2xl"', "@apply rounded-md;"];
    const ok = ['"rounded-lg"', '"rounded-xl"', '"rounded-full"', '"rounded-control"', '"rounded-card"', '"rounded-t-lg"', '"max-md:rounded-b-none"'];
    for (const s of bad) expect(s.match(BANNED), s).not.toBeNull();
    for (const s of ok) expect(s.match(BANNED), s).toBeNull();
  });

  it("Button·buttonClassName은 렌더된 클래스에 컨트롤 토큰을 쓴다", () => {
    expect(buttonClassName().split(/\s+/)).toContain("rounded-control");
    expect(buttonClassName({ variant: "secondary" }).split(/\s+/)).toEqual(
      expect.arrayContaining(["h-10", "pointer-coarse:min-h-11", "border-border", "hover:bg-foreground/5"]),
    );
  });

  it("Input·다이얼로그 파일은 토큰 유틸리티를 쓴다", () => {
    const read = (f: string) => readFileSync(join(process.cwd(), "src/components/ui", f), "utf8");
    expect(read("Input.tsx")).toContain("rounded-control");
    expect(read("FormDialog.tsx")).toContain("rounded-card");
    expect(read("ConfirmDialog.tsx")).toContain("rounded-card");
  });
});
