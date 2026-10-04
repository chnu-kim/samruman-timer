import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * 실제 SQLite(node:sqlite)에 migrations/를 모두 적용하고 D1 API 일부(prepare·bind·first·all·run·batch)를 흉내 낸다.
 * mock DB는 SQL을 실행하지 않아 `reverted_at IS NULL` 같은 조건이나 CAS(`changes()`) 연쇄를 검증하지 못한다.
 * 그런 SQL 정확성이 핵심인 흐름 테스트에서만 쓴다. batch는 D1처럼 한 트랜잭션으로 실행한다.
 */
export function createSqliteD1() {
  const sqlite = new DatabaseSync(":memory:");
  const dir = path.resolve(__dirname, "../../migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(path.join(dir, file), "utf8"));
  }

  type Value = string | number | null;

  class Statement {
    constructor(readonly sql: string, readonly args: Value[] = []) {}
    bind(...args: unknown[]) {
      return new Statement(this.sql, args.map((a) => (a === undefined ? null : (a as Value))));
    }
    async first<T>() {
      return (sqlite.prepare(this.sql).get(...this.args) as T | undefined) ?? null;
    }
    async all<T>() {
      return { results: sqlite.prepare(this.sql).all(...this.args) as T[] };
    }
    async run() {
      return this.runSync();
    }
    runSync() {
      const r = sqlite.prepare(this.sql).run(...this.args);
      return { meta: { changes: Number(r.changes) } };
    }
  }

  const db = {
    prepare: (sql: string) => new Statement(sql),
    async batch(statements: Statement[]) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((s) => s.runSync());
        sqlite.exec("COMMIT");
        return results;
      } catch (err) {
        sqlite.exec("ROLLBACK");
        throw err;
      }
    },
    /** 테스트에서 직접 조회·시드할 때 */
    raw: sqlite,
  };
  return db as unknown as D1Database & { raw: DatabaseSync };
}
