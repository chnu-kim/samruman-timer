import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { EXPECTED_LATEST_MIGRATION, compareSchema } from "@/lib/health";
import { SITE_URL } from "@/lib/site";

describe("EXPECTED_LATEST_MIGRATION", () => {
  // Workers 런타임은 migrations/를 읽을 수 없어 상수로 둔다. 새 마이그레이션을 추가하고 상수를 안 바꾸면 여기서 깨진다
  it("migrations/의 최신 파일명과 같다(wrangler가 d1_migrations.name에 넣는 값)", () => {
    const files = readdirSync(join(process.cwd(), "migrations"))
      .filter((f) => /^\d{4}_.*\.sql$/.test(f))
      .sort();
    expect(files.length).toBeGreaterThan(0);
    expect(EXPECTED_LATEST_MIGRATION).toBe(files[files.length - 1]);
  });
});

describe("compareSchema", () => {
  const expected = "0009_b.sql";

  it("같은 이름 → current(정상)", () => {
    expect(compareSchema("0009_b.sql", expected)).toEqual({ ok: true, state: "current" });
  });

  it("원격 번호가 더 크면 ahead(정상). 마이그레이션을 먼저 적용하고 배포하는 사이의 상태다", () => {
    expect(compareSchema("0010_c.sql", expected)).toEqual({ ok: true, state: "ahead" });
  });

  it("원격 번호가 더 작으면 behind(드리프트)", () => {
    expect(compareSchema("0007_a.sql", expected)).toEqual({ ok: false, state: "behind" });
  });

  it("번호는 같은데 이름이 다르면 mismatch(드리프트)", () => {
    expect(compareSchema("0009_other.sql", expected)).toEqual({ ok: false, state: "mismatch" });
  });

  it("적용 기록이 없으면 missing(드리프트)", () => {
    expect(compareSchema(null, expected)).toEqual({ ok: false, state: "missing" });
  });

  it("번호를 읽을 수 없는 이름은 mismatch(드리프트)", () => {
    expect(compareSchema("init.sql", expected)).toEqual({ ok: false, state: "mismatch" });
  });

  it("기본 기대값은 EXPECTED_LATEST_MIGRATION", () => {
    expect(compareSchema(EXPECTED_LATEST_MIGRATION)).toEqual({ ok: true, state: "current" });
  });
});

describe(".github/workflows/health.yml", () => {
  const workflow = readFileSync(join(process.cwd(), ".github/workflows/health.yml"), "utf8");

  // 도메인을 바꾸면 SITE_URL과 함께 프로브 주소도 바뀌어야 한다. 어긋나면 옛 주소를 계속 찔러 알림이 엉뚱하게 온다
  it("프로브 주소가 SITE_URL의 /api/health다", () => {
    expect(workflow).toContain(`${SITE_URL}/api/health`);
  });

  it("GITHUB_TOKEN 권한을 비운다", () => {
    expect(workflow).toMatch(/^permissions: \{\}$/m);
  });
});
