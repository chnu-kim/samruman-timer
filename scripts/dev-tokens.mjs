#!/usr/bin/env node
// 로컬 D1에 테스트용 refresh 토큰을 만든다. Playwright 같은 브라우저 자동화가 CHZZK 로그인 없이
// 소유자 화면을 보려고 쓴다. 원격 DB에는 절대 쓰지 않는다(--local 고정).
//
//   node scripts/dev-tokens.mjs --out <dir> [--count 20] [--start 1] [--user <userId>]
//   node scripts/dev-tokens.mjs --clean
//
// - 토큰 하나 = 브라우저 컨텍스트 하나. 같은 토큰을 두 컨텍스트에서 쓰면 refresh rotation의
//   재사용 탐지로 family가 폐기돼 로그아웃된다. 그래서 토큰마다 family를 따로 둔다.
// - <dir>/<n>.txt 에 원문 토큰을 쓴다. 쿠키: { name: "refresh", value, domain: "localhost", path: "/" }
// - --user를 생략하면 프로젝트가 가장 많은 사용자를 고른다.
// - worktree는 원 저장소의 .wrangler를 복사해 쓰므로, 복사하기 전에 원 저장소에서 만든다.
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseArgs } from "node:util";

const FAMILY_PREFIX = "devtok";
const DB = "samrumantimer-db";

const { values } = parseArgs({
  options: {
    out: { type: "string" },
    count: { type: "string", default: "20" },
    start: { type: "string", default: "1" },
    user: { type: "string" },
    days: { type: "string", default: "5" },
    clean: { type: "boolean", default: false },
  },
});

function d1(args) {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", DB, "--local", "--json", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  return JSON.parse(out);
}

if (values.clean) {
  d1(["--command", `DELETE FROM refresh_tokens WHERE family_id LIKE '${FAMILY_PREFIX}%'`]);
  console.log("로컬 테스트 토큰을 지웠습니다.");
  process.exit(0);
}

if (!values.out) {
  console.error("--out <dir>이 필요합니다.");
  process.exit(2);
}

let userId = values.user;
if (!userId) {
  const rows = d1(["--command", "SELECT owner_user_id AS id, count(*) AS c FROM projects GROUP BY owner_user_id ORDER BY c DESC LIMIT 1"])[0]
    ?.results;
  userId = rows?.[0]?.id;
  if (!userId) {
    console.error("로컬 D1에 프로젝트를 가진 사용자가 없습니다. 한 번 로그인해 데이터를 만든 뒤 다시 실행하세요.");
    process.exit(1);
  }
}
if (!/^[0-9a-f]{32}$/.test(userId)) {
  console.error(`사용자 ID 형식이 아닙니다: ${userId}`);
  process.exit(2);
}

const count = Number(values.count);
const start = Number(values.start);
const now = new Date();
const expires = new Date(now.getTime() + Number(values.days) * 86400_000).toISOString();
mkdirSync(values.out, { recursive: true });

const rows = [];
for (let n = start; n < start + count; n++) {
  const raw = randomBytes(32).toString("hex");
  writeFileSync(join(values.out, `${n}.txt`), raw);
  const hash = createHash("sha256").update(raw).digest("hex");
  const family = FAMILY_PREFIX + randomBytes(13).toString("hex");
  rows.push(`('${randomBytes(16).toString("hex")}','${userId}','${hash}','${family}','ACTIVE','${expires}','${now.toISOString()}','${expires}')`);
}
const sqlDir = mkdtempSync(join(tmpdir(), "dev-tokens-"));
const sqlFile = join(sqlDir, "tokens.sql");
writeFileSync(
  sqlFile,
  `INSERT INTO refresh_tokens (id,user_id,token_hash,family_id,status,expires_at,created_at,family_expires_at) VALUES ${rows.join(",")};`,
);
d1(["--file", sqlFile]);
console.log(`${values.out}/${start}.txt ~ ${start + count - 1}.txt (사용자 ${userId}, ${values.days}일 유효)`);
