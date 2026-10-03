#!/usr/bin/env node
// 프로덕션 운영 로그(Workers Logs)와 Issues를 읽기 전용으로 조회한다. 에이전트 폐쇄 루프용(docs/OBSERVABILITY.md).
// 사용법: node scripts/obs.mjs help
import { run } from "./lib/obs.mjs";

const code = await run(process.argv.slice(2), {
  fetch: globalThis.fetch,
  env: process.env,
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
});
process.exitCode = code;
