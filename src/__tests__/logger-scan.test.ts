import { describe, expect, it } from "vitest";
import { scanLoggerSource } from "./logger-scan";

const scan = (source: string, rel = "src/lib/sample.ts") => scanLoggerSource(source, rel);
const IMPORT = `import { logger } from "@/lib/logger";\n`;

describe("scanLoggerSource: 정상 형태", () => {
  it("직접 호출·문자열 레벨·줄바꿈 체인을 호출로 센다", () => {
    const { calls, problems } = scan(
      `${IMPORT}logger.info("a.b", {});\nlogger["warn"]("c.d");\nlogger\n  .error("e.f");\n`,
    );
    expect(problems).toEqual([]);
    expect(calls.map((c) => [c.event, c.levels[0]])).toEqual([
      ["a.b", "info"],
      ["c.d", "warn"],
      ["e.f", "error"],
    ]);
  });

  it("주석에 적힌 예시와 import 문은 문제가 아니다", () => {
    const { problems } = scan(`${IMPORT}// const w = logger.warn;\n/* const { warn } = logger; */\nlogger.info("a.b");\n`);
    expect(problems).toEqual([]);
  });
});

describe("scanLoggerSource: 우회 형태는 problems로 실패한다", () => {
  const cases: Record<string, string> = {
    "메서드 대입": `${IMPORT}const w = logger.warn;\n`,
    "메서드를 인자로 전달": `${IMPORT}run(logger.error);\n`,
    "bracket 참조": `${IMPORT}const w = logger["warn"];\n`,
    "bind": `${IMPORT}const w = logger.warn.bind(logger);\n`,
    "구조분해": `${IMPORT}const { warn } = logger;\n`,
    "객체 인자 전달": `${IMPORT}run(logger);\n`,
    "변수 대입": `${IMPORT}const l = logger;\n`,
    "옵셔널 체이닝 호출": `${IMPORT}logger?.info("a.b");\n`,
    "별칭 import": `import { logger as log } from "@/lib/logger";\nlog.info("a.b");\n`,
    "네임스페이스 import(별칭 경로)": `import * as L from "@/lib/logger";\nL.logger.info("a.b");\n`,
    "네임스페이스 import(상대 경로)": `import * as L from "../lib/logger";\n`,
    "default import": `import L from "./logger";\n`,
    "require": `const L = require("@/lib/logger");\n`,
    "동적 import": `const L = await import("@/lib/logger");\n`,
    "re-export": `export { logger } from "@/lib/logger";\n`,
    "export *": `export * from "./logger";\n`,
  };
  for (const [name, source] of Object.entries(cases)) {
    it(name, () => {
      const { problems } = scan(source);
      expect(problems.length).toBeGreaterThan(0);
      expect(problems.join("\n")).toContain("직접 호출하라");
    });
  }
});

describe("scanLoggerSource: 정의 파일 제외", () => {
  it("lib/logger.ts는 우회 검사를 하지 않는다", () => {
    const { problems } = scan(`export const logger = {};\nconst l = logger;\nconst w = logger.warn;\n`, "src/lib/logger.ts");
    expect(problems).toEqual([]);
  });
});
