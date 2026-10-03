/**
 * 운영 로그 이벤트 카탈로그(docs/OBSERVABILITY.md "이벤트 카탈로그")와 코드의 일관성 검사.
 *
 * 에이전트(prod-triage)는 카탈로그를 믿고 조사한다. logger 호출이 생기거나 사라졌는데 표가 안 바뀌면
 * 런북이 조용히 틀어지므로, 코드의 logger 호출과 문서를 양방향으로 대조한다.
 * 특정 이벤트 목록은 하드코딩하지 않는다. 소스와 문서에서 매번 추출한다.
 *
 * 소스 스캔은 정규식 기반이다. 이벤트 이름이 리터럴이 아닌 호출(`logger.info(name)` 등)은
 * 정적으로 카탈로그와 대조할 수 없어 조용히 넘어가면 바로 이 테스트가 막으려는 누락이 되므로 실패시킨다.
 * 단 레벨이 동적인 `logger[level]("literal")`은 이벤트가 리터럴이면 허용한다(auth/callback이 쓴다).
 * 이때 레벨은 `const level = ...` 선언문 안의 "info"|"warn"|"error" 리터럴로 추출하고, 못 찾으면 실패한다.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(ROOT, "src");
const DOC = path.join(ROOT, "docs/OBSERVABILITY.md");
const DOC_REL = "docs/OBSERVABILITY.md";
const LEVELS = ["info", "warn", "error"];

type LogCall = { event: string; levels: string[]; file: string; line: number };

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "__tests__" || name === "node_modules" ? [] : walk(full);
    return [full];
  });
}

function isProductionSource(file: string): boolean {
  return /\.tsx?$/.test(file) && !/\.(test|stories)\.tsx?$/.test(file);
}

/** 주석 줄(`//`, 블록 주석의 `/*`·`*` 줄)에 적힌 예시 호출이 호출로 잡히지 않도록 지운다. 줄 번호는 유지한다 */
function stripCommentLines(source: string): string {
  return source
    .split("\n")
    .map((l) => (/^\s*(\/\/|\/\*|\*)/.test(l) ? "" : l))
    .join("\n");
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

/** `const level = cond ? "info" : "warn";` 같은 선언문에서 레벨 리터럴을 모은다 */
function dynamicLevels(source: string, name: string): string[] {
  const decl = new RegExp(`\\b(?:const|let)\\s+${name}\\b[^;]*;`).exec(source);
  if (!decl) return [];
  return [...decl[0].matchAll(/["'](info|warn|error)["']/g)].map((m) => m[1]);
}

function collectCalls(): { calls: LogCall[]; problems: string[] } {
  const calls: LogCall[] = [];
  const problems: string[] = [];
  const files = walk(SRC).filter(isProductionSource);
  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const source = stripCommentLines(readFileSync(file, "utf8"));
    // logger.info( / logger["info"]( / logger[level](
    const re = /\blogger(?:\.(\w+)|\[([^\]]+)\])\s*\(\s*([^),]*)/g;
    for (const m of source.matchAll(re)) {
      const line = lineOf(source, m.index!);
      const where = `${rel}:${line}`;
      const lit = /^(["'`])([^"'`$]*)\1$/.exec(m[3].trim());
      if (!lit) {
        problems.push(
          `${where}: logger 호출의 이벤트 이름이 문자열 리터럴이 아니다(\`${m[0].trim()}\`). ` +
            `카탈로그와 정적으로 대조할 수 없으므로 리터럴로 쓰거나, 이 테스트의 스캔 방식을 확장하라.`,
        );
        continue;
      }
      let levels: string[];
      if (m[1]) {
        levels = [m[1]];
      } else {
        const expr = m[2].trim();
        const quoted = /^["'](\w+)["']$/.exec(expr);
        levels = quoted ? [quoted[1]] : dynamicLevels(source, expr);
        if (levels.length === 0) {
          problems.push(
            `${where}: logger[${expr}]의 레벨을 알 수 없다. \`const ${expr} = cond ? "info" : "warn";\`처럼 ` +
              `같은 파일의 선언문에 레벨 리터럴을 두어라.`,
          );
          continue;
        }
      }
      if (!levels.every((l) => LEVELS.includes(l))) {
        problems.push(`${where}: logger.${levels.join("/")}는 지원하는 레벨(${LEVELS.join("·")})이 아니다.`);
        continue;
      }
      calls.push({ event: lit[2], levels, file: rel, line });
    }
  }
  return { calls, problems };
}

function parseCatalog(): { table: Map<string, string[]>; detailed: Set<string> } {
  const doc = readFileSync(DOC, "utf8");
  const start = doc.indexOf("## 이벤트 카탈로그");
  expect(start, `${DOC_REL}에 "## 이벤트 카탈로그" 절이 없다`).toBeGreaterThanOrEqual(0);
  const rest = doc.slice(start + 1);
  const next = rest.search(/^## /m);
  const section = next < 0 ? rest : rest.slice(0, next);

  const table = new Map<string, string[]>();
  for (const row of section.matchAll(/^\|\s*`([^`]+)`\s*\|\s*([^|]*?)\s*\|/gm)) {
    const levels = row[2].split("/").map((s) => s.trim());
    table.set(row[1], levels);
  }
  const detailed = new Set([...section.matchAll(/^\*\*`([^`]+)`\*\*/gm)].map((m) => m[1]));
  return { table, detailed };
}

describe("운영 로그 이벤트 카탈로그 일관성", () => {
  const { calls, problems } = collectCalls();
  const { table, detailed } = parseCatalog();
  const codeEvents = new Map<string, LogCall[]>();
  for (const c of calls) codeEvents.set(c.event, [...(codeEvents.get(c.event) ?? []), c]);

  it("logger 호출과 표 행을 한 건 이상 찾는다(스캔이 깨지지 않았다는 안전장치)", () => {
    expect(calls.length).toBeGreaterThan(0);
    expect(table.size).toBeGreaterThan(0);
  });

  it("모든 logger 호출의 이벤트 이름이 정적으로 추출된다", () => {
    expect(problems, problems.join("\n")).toEqual([]);
  });

  it("코드의 모든 이벤트가 카탈로그 표에 있다", () => {
    const missing = [...codeEvents.keys()].filter((e) => !table.has(e));
    const msg = missing
      .map((e) => {
        const c = codeEvents.get(e)![0];
        return `\`${e}\` (${c.file}:${c.line}, level ${c.levels.join(" / ")}): ${DOC_REL} "이벤트 카탈로그" 표에 행을, "이벤트별 판단과 조사"에 상세 절을 추가하라`;
      })
      .join("\n");
    expect(missing, msg).toEqual([]);
  });

  it("카탈로그 표의 모든 이벤트가 코드에 있다", () => {
    const stale = [...table.keys()].filter((e) => !codeEvents.has(e));
    const msg = stale
      .map(
        (e) =>
          `\`${e}\`: 표에는 있지만 src/ 어디에도 logger 호출이 없다. 이벤트를 지웠다면 ${DOC_REL}의 표 행과 상세 절도 지워라`,
      )
      .join("\n");
    expect(stale, msg).toEqual([]);
  });

  it("표의 level 열이 코드의 레벨과 같다", () => {
    const wrong: string[] = [];
    for (const [event, docLevels] of table) {
      const callList = codeEvents.get(event);
      if (!callList) continue; // 위 테스트가 보고한다
      const codeLevels = [...new Set(callList.flatMap((c) => c.levels))];
      const unknown = docLevels.filter((l) => !LEVELS.includes(l));
      const same = docLevels.length === codeLevels.length && codeLevels.every((l) => docLevels.includes(l));
      if (unknown.length > 0 || !same) {
        wrong.push(
          `\`${event}\`: 표 level은 "${docLevels.join(" / ")}"인데 코드는 "${codeLevels.join(" / ")}"(${callList
            .map((c) => `${c.file}:${c.line}`)
            .join(", ")}). ${DOC_REL} 표의 level 열을 코드에 맞춰라`,
        );
      }
    }
    expect(wrong, wrong.join("\n")).toEqual([]);
  });

  it("표의 모든 이벤트에 상세 절이 있다", () => {
    const noDetail = [...table.keys()].filter((e) => !detailed.has(e));
    expect(
      noDetail,
      noDetail
        .map(
          (e) =>
            `\`${e}\`: ${DOC_REL} "이벤트별 판단과 조사"에 굵은 글씨 이벤트 이름과 level로 시작하는 절(정상·비정상 기준, 조사 방법)을 추가하라`,
        )
        .join("\n"),
    ).toEqual([]);
  });

  it("상세 절은 표에 있는 이벤트만 다룬다", () => {
    const orphan = [...detailed].filter((e) => !table.has(e));
    expect(
      orphan,
      orphan.map((e) => `\`${e}\`: 상세 절은 있지만 카탈로그 표에 행이 없다. 표에 추가하거나 상세 절을 지워라`).join("\n"),
    ).toEqual([]);
  });
});
