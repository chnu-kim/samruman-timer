import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { TRIAGE_RULES, classifyEvents, routePattern } from "../lib/obs-rules.mjs";

type Ev = Record<string, unknown>;
type Group = Record<string, any>;

const ev = (event: string, level: string, over: Ev = {}): Ev => ({ event, level, versionTag: "abcdef012345", ...over });
const times = (n: number, make: (i: number) => Ev) => Array.from({ length: n }, (_, i) => make(i));

/** 분류 결과에서 그 이벤트의 묶음이 어느 칸에 들어갔는지 */
function bucketOf(events: Ev[], event: string): { bucket: string; group: Group } {
  const r = classifyEvents(events);
  for (const bucket of ["abnormal", "normal", "unknown"] as const) {
    const g = (r[bucket] as Group[]).find((x) => x.event === event);
    if (g) return { bucket, group: g };
  }
  return { bucket: "none", group: {} };
}

describe("이벤트별 규칙(경계값: 임계 - 1은 정상, 임계는 비정상)", () => {
  it.each(["api.unhandled", "env.invalid", "auth.refresh.failed", "auth.logout.revoke_failed", "health.schema_drift"])(
    "%s는 1건이라도 비정상",
    (event) => {
      expect(bucketOf([], event).bucket).toBe("none");
      const r = bucketOf([ev(event, "error", { kind: "unknown" })], event);
      expect(r.bucket).toBe("abnormal");
      expect(r.group.count).toBe(1);
    }
  );

  it("env.weak_jwt_secret은 1건이라도 비정상이고 severity=debt(긴급하지 않은 보안 부채)", () => {
    const r = bucketOf([ev("env.weak_jwt_secret", "warn", { variable: "JWT_SECRET" })], "env.weak_jwt_secret");
    expect(r.bucket).toBe("abnormal");
    expect(r.group.severity).toBe("debt");
  });

  describe("auth.login.failed", () => {
    const failed = (over: Ev) => ev("auth.login.failed", "error", { kind: "unknown", ...over });
    it("stage=token·user는 1건 정상, 2건(합계) 비정상", () => {
      expect(bucketOf([failed({ stage: "token" })], "auth.login.failed").bucket).toBe("normal");
      expect(bucketOf([failed({ stage: "token" }), failed({ stage: "user" })], "auth.login.failed").bucket).toBe("abnormal");
    });
    it("stage=db는 1건이라도 비정상", () => {
      expect(bucketOf([failed({ stage: "db" })], "auth.login.failed").bucket).toBe("abnormal");
    });
    it("kind=schema_drift는 stage와 무관하게 1건이라도 비정상", () => {
      expect(bucketOf([failed({ stage: "token", kind: "schema_drift" })], "auth.login.failed").bucket).toBe("abnormal");
    });
    it("stage가 없거나 모르는 값이면 error라 비정상", () => {
      expect(bucketOf([failed({})], "auth.login.failed").bucket).toBe("abnormal");
      expect(bucketOf([failed({ stage: "other" })], "auth.login.failed").bucket).toBe("abnormal");
    });
  });

  describe("auth.oauth_state_invalid", () => {
    const st = (reason: string) => ev("auth.oauth_state_invalid", "warn", { reason });
    it("missing_cookie는 2건까지 정상, 3건 비정상(1건은 쿠키 만료·다른 브라우저로 정상)", () => {
      expect(bucketOf([st("missing_cookie")], "auth.oauth_state_invalid").bucket).toBe("normal");
      expect(bucketOf(times(2, () => st("missing_cookie")), "auth.oauth_state_invalid").bucket).toBe("normal");
      expect(bucketOf(times(3, () => st("missing_cookie")), "auth.oauth_state_invalid").bucket).toBe("abnormal");
    });
    it("mismatch·missing_state는 합쳐 1건 정상, 2건 비정상(반복 = 위조 시도 의심)", () => {
      expect(bucketOf([st("mismatch")], "auth.oauth_state_invalid").bucket).toBe("normal");
      expect(bucketOf([st("missing_state")], "auth.oauth_state_invalid").bucket).toBe("normal");
      expect(bucketOf([st("mismatch"), st("missing_state")], "auth.oauth_state_invalid").bucket).toBe("abnormal");
    });
    it("목록에 없는 reason의 warn은 규칙으로 판단할 수 없어 unknown", () => {
      const r = bucketOf([st("brand_new")], "auth.oauth_state_invalid");
      expect(r.bucket).toBe("unknown");
      expect(r.group.why).toContain("reason");
    });
  });

  describe("auth.refresh.reuse_detected", () => {
    const reuse = (userId: string) => ev("auth.refresh.reuse_detected", "warn", { userId, familyId: `f-${userId}` });
    it("서로 다른 사용자 2건은 정상, 3건은 비정상(주 몇 건 수준을 넘음)", () => {
      expect(bucketOf([reuse("u1"), reuse("u2")], "auth.refresh.reuse_detected").bucket).toBe("normal");
      expect(bucketOf([reuse("u1"), reuse("u2"), reuse("u3")], "auth.refresh.reuse_detected").bucket).toBe("abnormal");
    });
    it("같은 userId 2건이면 비정상. 키는 내보내지 않고 최대 건수만", () => {
      const r = bucketOf([reuse("u-sentinel"), reuse("u-sentinel")], "auth.refresh.reuse_detected");
      expect(r.bucket).toBe("abnormal");
      const check = r.group.checks.find((c: Group) => c.id === "same_user");
      expect(check).toMatchObject({ count: 2, min: 2, exceeded: true });
      expect(JSON.stringify(r.group)).not.toContain("u-sentinel");
    });
  });

  describe("timer.modify.conflict_exhausted", () => {
    const c = (timerId: string) => ev("timer.modify.conflict_exhausted", "warn", { timerId, action: "add" });
    it("서로 다른 타이머 2건 정상, 같은 timerId 2건 비정상, 합계 3건 비정상", () => {
      expect(bucketOf([c("t1"), c("t2")], "timer.modify.conflict_exhausted").bucket).toBe("normal");
      expect(bucketOf([c("t1"), c("t1")], "timer.modify.conflict_exhausted").bucket).toBe("abnormal");
      expect(bucketOf([c("t1"), c("t2"), c("t3")], "timer.modify.conflict_exhausted").bucket).toBe("abnormal");
    });
  });

  it("timer.create.unique_race는 2건 정상, 3건 비정상", () => {
    const r = (n: number) => bucketOf(times(n, (i) => ev("timer.create.unique_race", "warn", { projectId: `p${i}` })), "timer.create.unique_race");
    expect(r(2).bucket).toBe("normal");
    expect(r(3).bucket).toBe("abnormal");
  });
});

describe("규칙에 없는 이벤트", () => {
  it("등록되지 않은 error 이벤트는 비정상", () => {
    const r = bucketOf([ev("brand.new_failure", "error")], "brand.new_failure");
    expect(r.bucket).toBe("abnormal");
    expect(r.group.rule).toBe(false);
  });

  it("등록되지 않은 warn 이벤트는 unknown", () => {
    const r = bucketOf([ev("brand.new_warning", "warn")], "brand.new_warning");
    expect(r.bucket).toBe("unknown");
  });

  it("등록된 이벤트라도 규칙에 없는 level로 나오면 미등록과 같게 본다(error는 비정상)", () => {
    expect(bucketOf([ev("timer.create.unique_race", "error")], "timer.create.unique_race").bucket).toBe("abnormal");
    expect(bucketOf([ev("api.unhandled", "warn")], "api.unhandled").bucket).toBe("unknown");
  });

  it("앱 이벤트 이름이 아닌 값(런타임 예외 메시지 등)은 원문을 내보내지 않고 묶는다. error면 비정상", () => {
    const secret = "TypeError: Cannot read user nick-SENTINEL of undefined";
    const r = classifyEvents([{ level: "error", event: secret }]);
    expect(r.abnormal).toHaveLength(1);
    expect(r.abnormal[0].event).toBe("(앱 이벤트 아님)");
    expect(JSON.stringify(r)).not.toContain("SENTINEL");
  });
});

describe("묶음 내용(PII 규칙)", () => {
  it("reason·stage·kind 분포, versionTag, 라우트 패턴만 싣고 ID·오류 원문·경로 원문은 싣지 않는다", () => {
    const hex = "0123456789abcdef0123456789abcdef";
    const r = classifyEvents([
      ev("api.unhandled", "error", {
        requestId: "req-SENTINEL",
        userId: "user-SENTINEL",
        timerId: hex,
        path: `/api/timers/${hex}/modify`,
        error: "boom SENTINEL message",
        stack: "Error: SENTINEL",
        kind: "schema_drift",
        errorName: "Error",
      }),
    ]);
    const g = r.abnormal[0];
    expect(g.breakdown.kind).toEqual({ schema_drift: 1 });
    expect(g.versionTags).toEqual({ abcdef012345: 1 });
    expect(g.routes).toEqual({ "/api/timers/[id]/modify": 1 });
    expect(JSON.stringify(r)).not.toContain("SENTINEL");
    expect(JSON.stringify(r)).not.toContain(hex);
  });

  it("규칙의 모든 조건을 건수와 함께 싣는다(정상 판단의 근거)", () => {
    const r = classifyEvents([ev("timer.create.unique_race", "warn")]);
    expect(r.normal[0].checks).toEqual([{ id: "total", min: 3, count: 1, exceeded: false }]);
  });
});

describe("routePattern", () => {
  it.each([
    ["/api/timers/0123456789abcdef0123456789abcdef/modify", "/api/timers/[id]/modify"],
    ["/api/projects/123e4567-e89b-12d3-a456-426614174000", "/api/projects/[id]"],
    ["/api/x/42", "/api/x/[id]"],
    ["/api/auth/me?token=secret", "/api/auth/me"],
    ["/api/<script>/a b", "/api/[?]/[?]"],
    [`/api/${"a".repeat(80)}`, "/api/[?]"],
  ])("%s → %s", (input, expected) => {
    expect(routePattern(input)).toBe(expected);
  });

  it("세그먼트가 많으면 앞부분만 남긴다", () => {
    expect(routePattern("/a/b/c/d/e/f/g/h/i/j")).toBe("/a/b/c/d/e/f/…");
  });

  it("문자열이 아니면 undefined", () => {
    expect(routePattern(undefined)).toBeUndefined();
  });
});

describe("규칙표와 카탈로그", () => {
  /** docs/OBSERVABILITY.md 이벤트 카탈로그 표의 `| \`event\` | level | ...` 행 */
  function catalogRows() {
    const doc = readFileSync(path.resolve(__dirname, "../../docs/OBSERVABILITY.md"), "utf8");
    const rows = new Map<string, string[]>();
    for (const line of doc.split("\n")) {
      const m = /^\|\s*`([a-z0-9_.]+)`\s*\|\s*([^|]+)\|/.exec(line);
      if (m) rows.set(m[1], m[2].split("/").map((s) => s.trim()));
    }
    return rows;
  }

  it("규칙표의 이벤트는 모두 카탈로그 표에 있고, 규칙의 level은 표에 적힌 level 안에 있다", () => {
    const rows = catalogRows();
    expect(rows.size).toBeGreaterThan(0);
    for (const rule of TRIAGE_RULES) {
      expect(rows.has(rule.event), `${rule.event}가 카탈로그 표에 없다`).toBe(true);
      for (const level of rule.levels) expect(rows.get(rule.event), `${rule.event}의 level ${level}`).toContain(level);
    }
  });

  it("규칙표에 같은 이벤트가 두 번 나오지 않는다", () => {
    const names = TRIAGE_RULES.map((r: { event: string }) => r.event);
    expect(new Set(names).size).toBe(names.length);
  });
});
