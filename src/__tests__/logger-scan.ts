/**
 * logger 호출 소스 스캐너. observability-catalog.test.ts가 쓰고, 우회 형태는 logger-scan.test.ts가 픽스처로 검사한다.
 * 정규식 기반이라 AST처럼 완전하지 않다. 대신 호출을 못 찾게 만드는 형태(별칭·참조·구조분해·네임스페이스 import 등)를 problems로 실패시킨다.
 */

export const LEVELS = ["info", "warn", "error"];

export type LogCall = { event: string; levels: string[]; file: string; line: number };

/** 주석(줄·블록·줄 끝 인라인, JSX 주석 포함)에 적힌 예시 호출이 호출로 잡히지 않도록 지운다. 줄 번호는 유지한다 */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ""))
    .replace(/\/\/.*$/gm, (c, offset: number) => (source[offset - 1] === ":" ? c : ""));
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const LEVEL_LITERAL = /["'](info|warn|error)["']/g;

/** `const level = cond ? "info" : "warn";` 같은 선언문에서 레벨 리터럴을 모은다. 같은 이름의 선언이 여럿이면 합집합 */
function dynamicLevels(source: string, name: string): string[] {
  const decl = new RegExp(`\\b(?:const|let)\\s+${escapeRegExp(name)}\\b[^;]*;`, "g");
  return [...source.matchAll(decl)].flatMap((d) => [...d[0].matchAll(LEVEL_LITERAL)].map((m) => m[1]));
}

/** logger 모듈 경로: `@/lib/logger`, `./logger`, `../lib/logger.ts` 등 */
const LOGGER_PATH = `["'](?:[^"']*\\/)?logger(?:\\.tsx?)?["']`;
const NAMESPACE_IMPORT = new RegExp(`\\bimport\\s*\\*\\s*as\\s+[\\w$]+\\s+from\\s*${LOGGER_PATH}`);
const DEFAULT_IMPORT = new RegExp(`\\bimport\\s+[\\w$]+\\s*(?:,[^;]*?)?\\s+from\\s*${LOGGER_PATH}`);
const REEXPORT = new RegExp(`\\bexport\\s+(?:\\*|\\{[^}]*\\})(?:\\s+as\\s+[\\w$]+)?\\s*from\\s*${LOGGER_PATH}`);
const REQUIRE_LIKE = new RegExp(`\\b(?:require|import)\\s*\\(\\s*${LOGGER_PATH}\\s*\\)`);
const IMPORT_STATEMENT = /\bimport\b[^;"']*?\bfrom\s*["'][^"']*["'];?/g;

/** 소스 한 파일을 스캔해 logger 호출과 정적으로 대조할 수 없는 형태(problems)를 돌려준다. rel은 메시지에 쓸 경로 */
export function scanLoggerSource(rawSource: string, rel: string): { calls: LogCall[]; problems: string[] } {
  const calls: LogCall[] = [];
  const problems: string[] = [];
  const source = stripComments(rawSource);

  // lib/logger.ts 정의 파일은 우회 검사에서 제외한다
  if (!/lib\/logger\.tsx?$/.test(rel)) {
    const bypass = (what: string) =>
      problems.push(`${rel}: ${what} 이 테스트가 호출을 찾지 못하므로 \`logger.<level>("event", ...)\`로 직접 호출하라.`);

    if (/\blogger\s+as\b/.test(source)) bypass("logger를 별칭 import했다.");
    if (NAMESPACE_IMPORT.test(source)) bypass("logger 모듈을 `import * as X`로 가져왔다. `import { logger } from`으로 가져와서");
    if (DEFAULT_IMPORT.test(source)) bypass("logger 모듈을 default import로 가져왔다. `import { logger } from`으로 가져와서");
    if (REEXPORT.test(source)) bypass("logger 모듈을 re-export한다. 쓰는 파일에서 `import { logger } from`으로 가져와서");
    if (REQUIRE_LIKE.test(source)) bypass("`require`/동적 `import()`로 logger 모듈을 가져왔다. `import { logger } from`으로 가져와서");

    // import 문을 걷어낸 뒤, 뒤에 `.`·`[`·`?.`가 붙지 않은 logger는 값으로 넘기거나 대입한 것이다(구조분해 포함)
    const body = source.replace(IMPORT_STATEMENT, (s) => s.replace(/[^\n]/g, ""));
    for (const m of body.matchAll(/(?<![\w$.'"/-])logger\b(?!\s*(?:\?\.|\.|\[))/g)) {
      problems.push(
        `${rel}:${lineOf(body, m.index!)}: logger 객체를 값으로 쓰고 있다(대입·인자 전달·구조분해). ` +
          `이 테스트가 호출을 찾지 못하므로 \`logger.<level>("event", ...)\`로 직접 호출하라.`,
      );
    }
    // logger.warn 처럼 호출 없이 메서드만 참조(`const w = logger.warn`, `fn(logger.error)`, `.bind`/`.call`, `logger?.info()`)
    for (const m of body.matchAll(/\blogger\s*(?:\?\.\s*\w+\b|\.\s*\w+\b|\[[^\]]+\])(?!\s*\()/g)) {
      problems.push(
        `${rel}:${lineOf(body, m.index!)}: \`${m[0].replace(/\s+/g, "")}\`를 호출 없이 참조했다. ` +
          `이 테스트가 호출을 찾지 못하므로 \`logger.<level>("event", ...)\`로 직접 호출하라.`,
      );
    }
    for (const m of body.matchAll(/\blogger\s*\?\.\s*(?:\w+|\[[^\]]+\])\s*\(/g)) {
      problems.push(
        `${rel}:${lineOf(body, m.index!)}: 옵셔널 체이닝 호출(\`${m[0].replace(/\s+/g, "")}\`)은 이 테스트가 찾지 못한다. ` +
          `\`logger.<level>("event", ...)\`로 직접 호출하라.`,
      );
    }
  }

  // logger.info( / logger["info"]( / logger[level]( / 줄바꿈 체인(logger\n .info()
  const re = /\blogger\s*(?:\.\s*(\w+)|\[([^\]]+)\])\s*\(\s*([^),]*)/g;
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
      const inline = [...expr.matchAll(LEVEL_LITERAL)].map((x) => x[1]);
      levels = quoted ? [quoted[1]] : inline.length > 0 ? inline : dynamicLevels(source, expr);
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
  return { calls, problems };
}
