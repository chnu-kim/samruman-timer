import { describe, it, expect, vi } from "vitest";
import {
  run,
  buildTriageQueries,
  buildTriagePluginCode,
  evaluateTriage,
  fetchTriageBundle,
  createClient,
  slimIssue,
  issueListQuery,
  TRIAGE_INPUT_FORMAT,
  MAX_LIMIT,
  EXIT,
  SERVICE,
} from "../lib/obs.mjs";

const NOW = Date.parse("2026-10-03T12:00:00.000Z");
const TOKEN = "SENTINEL-TOKEN-must-not-leak-0123456789";
const TAG = "abcdef012345";
// 테스트용 합성 계정 ID. 플러그인 sandbox가 주입하는 accountId를 흉내 낸다
const ACCT = "0".repeat(32);
const SINCE = "2026-10-02T12:00:00.000Z";
const UNTIL = new Date(NOW).toISOString();
const WINDOW = ["--since", SINCE, "--until", UNTIL];
const INPUT_NOTE = "조회 결과 파일로 판정했다";

type Route = (url: URL, init: RequestInit) => { status?: number; body: unknown } | undefined;

function mockFetch(route: Route) {
  const calls: { url: URL; method: string; body: any }[] = [];
  const fetch = vi.fn(async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, method: init.method ?? "GET", body });
    const res = route(url, init);
    if (!res) return new Response(JSON.stringify({ success: false, errors: [{ code: 404, message: "no route" }] }), { status: 404 });
    return new Response(JSON.stringify(res.body), { status: res.status ?? 200 });
  });
  return { fetch, calls };
}

type Deps = { env?: Record<string, string | undefined>; files?: Record<string, string>; route?: Route };

async function exec(argv: string[], { env = { CF_OBS_TOKEN: TOKEN }, files = {}, route = () => undefined }: Deps = {}) {
  const { fetch, calls } = mockFetch(route);
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(argv, {
    fetch: fetch as unknown as typeof globalThis.fetch,
    env,
    now: () => NOW,
    out: (l: string) => out.push(l),
    err: (l: string) => err.push(l),
    readFile: (p: string) => {
      if (!(p in files)) throw new Error(`ENOENT: ${p}`);
      return files[p];
    },
  });
  return { code, out, err, calls, fetch };
}

/** API 응답 모양(2026-10-03 실측): 앱 필드는 source 안 */
function rawEvent(source: Record<string, unknown>) {
  return {
    dataset: "cloudflare-workers",
    timestamp: Date.parse(String(source.timestamp ?? "2026-10-03T11:00:00.000Z")),
    source: { versionTag: TAG, versionId: "ver-1", ...source },
    $metadata: { service: SERVICE, level: source.level, message: source.event },
    $workers: { scriptVersion: { id: "ver-1", tag: TAG } },
  };
}
const warn = (event: string, over: Record<string, unknown> = {}) => rawEvent({ level: "warn", event, ...over });
const error = (event: string, over: Record<string, unknown> = {}) => rawEvent({ level: "error", event, ...over });

/** level 필터로 응답을 고르고, Issue 목록은 쪽 메타데이터(total_pages)까지 준다 */
function route(opts: { errors?: unknown[]; warns?: unknown[]; issuePages?: unknown[][]; issuesStatus?: number }): Route {
  return (url, init) => {
    if (url.pathname.endsWith("/telemetry/query")) {
      const body = JSON.parse(String(init.body));
      const level = body.parameters.filters.find((f: { key: string }) => f.key === "level")?.value;
      const events = level === "error" ? (opts.errors ?? []) : level === "warn" ? (opts.warns ?? []) : [];
      return { body: { success: true, errors: [], messages: [], result: { events: { events } } } };
    }
    if (url.pathname.endsWith("/issues")) {
      if (opts.issuesStatus) return { status: opts.issuesStatus, body: { success: false, errors: [{ code: 10000, message: "Authentication error" }] } };
      const pages = opts.issuePages ?? [[]];
      const page = Number(url.searchParams.get("page") ?? 1);
      const result = pages[page - 1] ?? [];
      return {
        body: { success: true, errors: [], messages: [], result, result_info: { page, per_page: 100, count: result.length, total_pages: pages.length } },
      };
    }
    return undefined;
  };
}

/** 플러그인 execute의 cloudflare.request를 라우트로 흉내 낸다 */
function fakeCloudflare(r: Route) {
  const calls: { method: string; path: string; body: any }[] = [];
  const cloudflare = {
    request: async ({ method, path, query, body }: { method: string; path: string; query?: Record<string, unknown>; body?: unknown }) => {
      const url = new URL(`https://api.cloudflare.com/client/v4${path}`);
      for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
      calls.push({ method, path: url.pathname, body });
      const res = r(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
      if (!res) return { success: false, status: 404, result: null, errors: [{ code: 404, message: "no route" }], messages: [] };
      return { status: res.status ?? 200, ...(res.body as object) };
    },
  };
  return { cloudflare, calls };
}

async function runPluginCode(code: string, r: Route) {
  const { cloudflare, calls } = fakeCloudflare(r);
  const fn = new Function("cloudflare", "accountId", `"use strict"; return (${code});`)(cloudflare, ACCT);
  return { bundle: JSON.parse(JSON.stringify(await fn())), calls };
}

/** --print-plugin-code → 플러그인 실행 → --input 판정 */
async function viaPlugin(args: string[], r: Route) {
  const printed = await exec(["triage", ...args, "--print-plugin-code"], { env: {} });
  expect(printed.code).toBe(EXIT.OK);
  const { bundle, calls } = await runPluginCode(printed.out.join("\n"), r);
  const judged = await exec(["triage", "--input", "b.json", ...args], { env: {}, files: { "b.json": JSON.stringify(bundle) } });
  return { judged, bundle, calls, printed };
}

const summary = (r: { out: string[] }) => JSON.parse(r.out[0]);
const full = (r: { out: string[] }) => JSON.parse(r.out.join("\n"));

describe("triage 조회", () => {
  it("error·warn을 따로 묻는 쿼리 둘(서비스 필터, limit 2000, dry)과 active Issue 목록을 보낸다", async () => {
    const r = await exec(["triage"], { route: route({}) });
    expect(r.code).toBe(EXIT.OK);
    const queries = r.calls.filter((c) => c.url.pathname.endsWith("/telemetry/query"));
    expect(queries).toHaveLength(2);
    for (const q of queries) {
      expect(q.body.limit).toBe(MAX_LIMIT);
      expect(q.body.dry).toBe(true);
      expect(q.body.parameters.filters[0]).toMatchObject({ key: "$metadata.service", value: SERVICE });
      // 기본 기간 24h
      expect(q.body.timeframe).toEqual({ from: NOW - 86_400_000, to: NOW });
    }
    expect(queries.map((q) => q.body.parameters.filters[1].value).sort()).toEqual(["error", "warn"]);
    const issues = r.calls.find((c) => c.url.pathname.endsWith("/issues"));
    expect(issues?.url.searchParams.get("status")).toBe("active");
  });

  it("buildTriageQueries는 level 필터만 다른 두 쿼리다", () => {
    const { errorQuery, warnQuery } = buildTriageQueries({ from: 1, to: 2 }) as Record<string, any>;
    expect(errorQuery.parameters.filters[1]).toMatchObject({ key: "level", value: "error" });
    expect(warnQuery.parameters.filters[1]).toMatchObject({ key: "level", value: "warn" });
  });

  it("토큰이 없으면 2(--input·--print-plugin-code 제외)", async () => {
    const r = await exec(["triage"], { env: {} });
    expect(r.code).toBe(EXIT.FAILED);
    expect(r.err.join("\n")).toContain("CF_OBS_TOKEN");
  });

  it("Issues가 403이면 조회 실패 2, --skip-issues면 로그만 보고 notes에 남긴다", async () => {
    const failed = await exec(["triage"], { route: route({ issuesStatus: 403 }) });
    expect(failed.code).toBe(EXIT.FAILED);
    const skipped = await exec(["triage", "--skip-issues"], { route: route({ issuesStatus: 403 }) });
    expect(skipped.code).toBe(EXIT.OK);
    expect(summary(skipped).notes.join("\n")).toContain("--skip-issues");
  });
});

describe("triage 판정과 exit code", () => {
  it("아무것도 없으면 0(normal)", async () => {
    const r = await exec(["triage"], { route: route({}) });
    expect(r.code).toBe(EXIT.OK);
    expect(summary(r)).toMatchObject({ verdict: "normal", exitCode: 0, abnormal: 0, normal: 0, unknown: 0 });
  });

  it("정상 규칙만 걸리면 0이고 normal에 근거가 남는다(예: missing_cookie 1건)", async () => {
    const r = await exec(["triage", "--json"], { route: route({ warns: [warn("auth.oauth_state_invalid", { reason: "missing_cookie" })] }) });
    expect(r.code).toBe(EXIT.OK);
    const rep = full(r);
    expect(rep.normal).toHaveLength(1);
    expect(rep.normal[0]).toMatchObject({ type: "event", event: "auth.oauth_state_invalid", count: 1, breakdown: { reason: { missing_cookie: 1 } } });
  });

  it("비정상이 있으면 1", async () => {
    const r = await exec(["triage"], { route: route({ errors: [error("api.unhandled", { kind: "schema_drift" })] }) });
    expect(r.code).toBe(EXIT.RECURRED);
    expect(summary(r)).toMatchObject({ verdict: "abnormal", exitCode: 1, abnormal: 1 });
    expect(r.out.slice(1).map((l) => JSON.parse(l))).toContainEqual({ abnormal: expect.objectContaining({ event: "api.unhandled" }) });
  });

  it("unknown만 있으면 근거 부족 2(규칙 없는 warn을 정상으로 넘기지 않는다)", async () => {
    const r = await exec(["triage"], { route: route({ warns: [warn("brand.new_warning")] }) });
    expect(r.code).toBe(EXIT.FAILED);
    expect(summary(r)).toMatchObject({ verdict: "insufficient", reason: "unknown", unknown: 1 });
  });

  it("조회가 2000건에서 잘리면 근거 부족 2. 잘려도 찾은 비정상은 1", async () => {
    const many = Array.from({ length: MAX_LIMIT }, () => warn("auth.oauth_state_invalid", { reason: "missing_cookie" }));
    // 잘린 묶음 안의 missing_cookie는 이미 임계를 넘었다 → 1
    expect((await exec(["triage"], { route: route({ warns: many }) })).code).toBe(EXIT.RECURRED);
    const normalMany = Array.from({ length: MAX_LIMIT }, (_, i) => warn("timer.modify.conflict_exhausted", { timerId: `t${i}` }));
    // 정상 이벤트만으로 잘렸어도(이 이벤트는 합계 임계로 비정상) 판단은 비정상
    expect((await exec(["triage"], { route: route({ warns: normalMany }) })).code).toBe(EXIT.RECURRED);

    const r = await exec(["triage"], {
      route: route({ warns: Array.from({ length: MAX_LIMIT }, () => warn("brand.new_warning")) }),
    });
    expect(r.code).toBe(EXIT.FAILED);
    expect(summary(r)).toMatchObject({ verdict: "insufficient", reason: "truncated" });
    expect(summary(r).truncated.join("\n")).toContain("warn");
  });

  it("정상 판정만 있어도 조회가 잘렸으면 0이 아니라 2, 비정상이 함께 있으면 1", async () => {
    const oldIssue = (i: number) => ({ id: `i${i}`, lastObserved: Date.parse("2026-09-30T10:00:00Z") });
    const pages = Array.from({ length: 6 }, (_, i) => [oldIssue(i)]);
    const normalOnly = await exec(["triage"], { route: route({ warns: [warn("timer.create.unique_race")], issuePages: pages }) });
    expect(normalOnly.code).toBe(EXIT.FAILED);
    expect(summary(normalOnly)).toMatchObject({ verdict: "insufficient", reason: "truncated" });
    const withAbnormal = await exec(["triage"], { route: route({ errors: [error("api.unhandled")], issuePages: pages }) });
    expect(withAbnormal.code).toBe(EXIT.RECURRED);
    expect(summary(withAbnormal).truncated).toHaveLength(1);
  });
});

describe("active Issues", () => {
  const issue = (over: Record<string, unknown>) => ({ id: "issue-1", status: "active", title: "TypeError: SENTINEL title", error: { name: "TypeError" }, count: 3, ...over });

  it("lastSeen이 기간 안이거나 없으면 비정상, 기간 전이면 정상(resolve 후보). title은 내보내지 않는다", async () => {
    const recent = issue({ id: "i-recent", lastObserved: Date.parse("2026-10-03T10:00:00Z") });
    const old = issue({ id: "i-old", lastObserved: Date.parse("2026-09-30T10:00:00Z") });
    const unknown = issue({ id: "i-unknown" });
    const r = await exec(["triage", "--json"], { route: route({ issuePages: [[recent, old, unknown]] }) });
    expect(r.code).toBe(EXIT.RECURRED);
    const rep = full(r);
    expect(rep.abnormal.map((x: { id: string }) => x.id).sort()).toEqual(["i-recent", "i-unknown"]);
    expect(rep.normal.map((x: { id: string }) => x.id)).toEqual(["i-old"]);
    expect(rep.abnormal[0]).toMatchObject({ type: "issue", errorName: "TypeError", count: 3 });
    expect(r.out.join("\n")).not.toContain("SENTINEL");
  });

  it("Issue 목록이 페이지 한도에서 잘리면 2", async () => {
    const pages = Array.from({ length: 6 }, (_, i) => [issue({ id: `i${i}`, lastObserved: Date.parse("2026-09-30T10:00:00Z") })]);
    const r = await exec(["triage"], { route: route({ issuePages: pages }) });
    expect(r.code).toBe(EXIT.FAILED);
    expect(summary(r).reason).toBe("truncated");
  });
});

describe("출력은 PII 규칙을 지킨다", () => {
  it("requestId·userId·timerId·오류 원문·경로 원문(쿼리스트링)을 기본 출력과 --json 모두에 내지 않는다", async () => {
    const hex = "fedcba9876543210fedcba9876543210";
    const r = route({
      errors: [
        error("api.unhandled", {
          requestId: "req-SENTINEL",
          method: "POST",
          path: `/api/timers/${hex}/modify`,
          error: "D1_ERROR: SENTINEL message",
          stack: "Error: SENTINEL\n at x",
          kind: "unknown",
          errorName: "Error",
        }),
      ],
      warns: [warn("auth.refresh.reuse_detected", { userId: "user-SENTINEL", familyId: "fam-SENTINEL", requestId: "req-SENTINEL" })],
    });
    for (const extra of [[], ["--json"]]) {
      const res = await exec(["triage", ...extra], { route: r });
      expect(res.code).toBe(EXIT.RECURRED);
      const text = res.out.join("\n") + res.err.join("\n");
      expect(text).not.toContain("SENTINEL");
      expect(text).not.toContain(hex);
      expect(text).toContain("/api/timers/[id]/modify");
      expect(text).toContain(TAG);
    }
  });
});

describe("triage --input (플러그인 조회 결과로 판정)", () => {
  const scenarios: { name: string; args: string[]; route: Route; code: number }[] = [
    { name: "비어 있음", args: [], route: route({}), code: EXIT.OK },
    { name: "정상 warn", args: [], route: route({ warns: [warn("auth.oauth_state_invalid", { reason: "missing_cookie" })] }), code: EXIT.OK },
    { name: "error 비정상", args: [], route: route({ errors: [error("env.invalid", { invalid: ["BASE_URL"] })] }), code: EXIT.RECURRED },
    { name: "미등록 warn", args: [], route: route({ warns: [warn("brand.new_warning")] }), code: EXIT.FAILED },
    {
      name: "Issue 여러 쪽",
      args: [],
      route: route({ issuePages: [[{ id: "i1", lastObserved: Date.parse("2026-09-01T00:00:00Z") }], [{ id: "i2", lastObserved: NOW - 1000 }]] }),
      code: EXIT.RECURRED,
    },
    { name: "--skip-issues", args: ["--skip-issues"], route: route({ issuesStatus: 403 }), code: EXIT.OK },
  ];

  it.each(scenarios)("플러그인 경로와 토큰 경로가 같은 판정을 낸다: $name", async ({ args, route: r, code }) => {
    const network = await exec(["triage", ...WINDOW, "--json", ...args], { route: r });
    const { judged, calls } = await viaPlugin([...WINDOW, "--json", ...args], r);
    expect(network.code).toBe(code);
    expect(judged.code).toBe(code);
    expect(judged.fetch).not.toHaveBeenCalled();
    const a = full(judged);
    expect(a.notes.some((n: string) => n.startsWith(INPUT_NOTE))).toBe(true);
    a.notes = a.notes.filter((n: string) => !n.startsWith(INPUT_NOTE));
    expect(a).toEqual(full(network));
    // 플러그인 코드는 조회용 엔드포인트만 부른다
    for (const c of calls) {
      expect(c.path.startsWith(`/client/v4/accounts/${ACCT}/workers/observability/`)).toBe(true);
      const readOnly =
        (c.method === "POST" && c.path.endsWith("/telemetry/query") && c.body.dry === true) ||
        (c.method === "GET" && c.path.endsWith("/issues"));
      expect(readOnly).toBe(true);
    }
  });

  it("evaluateTriage는 토큰 경로 묶음과 플러그인 묶음에 같은 판정을 낸다", async () => {
    const r = route({ errors: [error("api.unhandled")], warns: [warn("timer.create.unique_race")], issuePages: [[{ id: "i1" }]] });
    const { fetch } = mockFetch(r);
    const client = createClient({ fetch: fetch as unknown as typeof globalThis.fetch, accountId: ACCT, token: TOKEN });
    const opts = { from: Date.parse(SINCE), to: NOW };
    const fromNetwork = evaluateTriage(await fetchTriageBundle(client, opts), opts, { strict: true });
    const { bundle } = await runPluginCode(buildTriagePluginCode(opts), r);
    expect(evaluateTriage(bundle, opts, { strict: true })).toEqual(fromNetwork);
  });

  it("--print-plugin-code는 토큰 없이 코드를 내고 이어서 실행할 --input 명령을 ISO 기간으로 안내한다", async () => {
    const r = await exec(["triage", "--since", "24h", "--skip-issues", "--print-plugin-code"], { env: {} });
    expect(r.code).toBe(EXIT.OK);
    expect(r.out.join("\n")).toMatch(/^async \(\) => \{/);
    expect(r.out.join("\n")).not.toContain(ACCT);
    const last = r.err[r.err.length - 1];
    expect(last).toContain(`triage --input <파일> --since ${new Date(NOW - 86_400_000).toISOString()} --until ${UNTIL} --skip-issues`);
  });

  describe("파일 입력 오류는 2", () => {
    async function pluginBundle(args: string[] = []) {
      return (await viaPlugin([...WINDOW, ...args], route({ warns: [warn("timer.create.unique_race")] }))).bundle;
    }
    const judge = (bundle: unknown, args: string[] = []) =>
      exec(["triage", "--input", "b.json", ...WINDOW, ...args], { env: {}, files: { "b.json": JSON.stringify(bundle) } });

    it("기록된 쿼리가 triage가 보낼 쿼리와 다르면 2", async () => {
      const b = await pluginBundle();
      b.warnQuery.request.timeframe.from += 1;
      const r = await judge(b);
      expect(r.code).toBe(EXIT.FAILED);
      expect(r.out).toEqual([]);
      expect(r.err.join("\n")).toContain("triage가 보낼 요청과 다르다");
    });

    it("format이 다르면(verify 묶음 등) 2", async () => {
      const b = await pluginBundle();
      b.format = "obs-verify-input/1";
      const r = await judge(b);
      expect(r.code).toBe(EXIT.FAILED);
      expect(r.err.join("\n")).toContain(TRIAGE_INPUT_FORMAT);
    });

    it("이벤트 배열을 찾을 수 없으면 0건으로 보지 않고 2", async () => {
      const b = await pluginBundle();
      b.errorQuery.response.result = null;
      expect((await judge(b)).code).toBe(EXIT.FAILED);
    });

    it("Issue 목록 다음 쪽이 파일에 없으면 truncated(2)", async () => {
      const b = (await viaPlugin(WINDOW, route({ issuePages: [[{ id: "i1", lastObserved: 1 }], [{ id: "i2", lastObserved: 1 }]] }))).bundle;
      b.issuePages = b.issuePages.slice(0, 1);
      const r = await judge(b);
      expect(r.code).toBe(EXIT.FAILED);
      expect(summary(r).reason).toBe("truncated");
    });

    it("--since·--until은 ISO 시각으로 둘 다 받는다", async () => {
      const b = JSON.stringify(await pluginBundle());
      for (const w of [["--since", "24h", "--until", UNTIL], ["--since", SINCE], []]) {
        const r = await exec(["triage", "--input", "b.json", ...w], { env: {}, files: { "b.json": b } });
        expect(r.code).toBe(EXIT.FAILED);
        expect(r.err.join("\n")).toContain("ISO");
      }
    });

    it("JSON이 아니거나 파일이 없으면 2", async () => {
      expect((await exec(["triage", "--input", "b.json", ...WINDOW], { env: {}, files: { "b.json": "{x" } })).code).toBe(EXIT.FAILED);
      expect((await exec(["triage", "--input", "none.json", ...WINDOW], { env: {} })).code).toBe(EXIT.FAILED);
    });
  });
});

describe("조회 경로도 근거가 애매하면 0으로 끝내지 않는다", () => {
  it("telemetry 응답에 이벤트 배열이 없으면(응답 모양 변화) 0건으로 보지 않고 2", async () => {
    const base = route({});
    const r = await exec(["triage", "--skip-issues"], {
      route: (url, init) =>
        url.pathname.endsWith("/telemetry/query") ? { body: { success: true, errors: [], messages: [], result: { foo: { bar: 1 } } } } : base(url, init),
    });
    expect(r.code).toBe(EXIT.FAILED);
    expect(r.err.join("\n")).toContain("이벤트 배열을 찾지 못했다");
  });

  it("active Issue 목록 응답에 total_pages가 없으면 다음 쪽이 있는지 몰라 truncated(2)", async () => {
    const base = route({});
    const r = await exec(["triage"], {
      route: (url, init) =>
        url.pathname.endsWith("/issues")
          ? { body: { success: true, errors: [], messages: [], result: [{ id: "i1", lastObserved: Date.parse("2026-09-30T10:00:00Z") }] } }
          : base(url, init),
    });
    expect(r.code).toBe(EXIT.FAILED);
    expect(summary(r)).toMatchObject({ verdict: "insufficient", reason: "truncated" });
    expect(summary(r).truncated.join("\n")).toContain("total_pages");
  });
});

describe("severity: debt는 보고만 하고 exit code를 올리지 않는다", () => {
  const weak = () => warn("env.weak_jwt_secret", { variable: "JWT_SECRET", minBytes: 32 });

  it("debt만 있으면 0(normal)이고 debt 칸에 남는다", async () => {
    const r = await exec(["triage", "--json"], { route: route({ warns: [weak()] }) });
    expect(r.code).toBe(EXIT.OK);
    const rep = full(r);
    expect(rep).toMatchObject({ verdict: "normal", exitCode: 0, abnormal: [] });
    expect(rep.debt).toHaveLength(1);
    expect(rep.debt[0]).toMatchObject({ event: "env.weak_jwt_secret", severity: "debt" });
    const plain = await exec(["triage"], { route: route({ warns: [weak()] }) });
    expect(summary(plain)).toMatchObject({ verdict: "normal", debt: 1, abnormal: 0 });
    expect(plain.out.slice(1).map((l) => JSON.parse(l))).toContainEqual({ debt: expect.objectContaining({ event: "env.weak_jwt_secret" }) });
    expect(plain.err.join("\n")).toContain("부채");
  });

  it("debt가 unknown·truncated를 가리지 않는다(2), 실제 비정상이 함께 있으면 1", async () => {
    const withUnknown = await exec(["triage"], { route: route({ warns: [weak(), warn("brand.new_warning")] }) });
    expect(withUnknown.code).toBe(EXIT.FAILED);
    expect(summary(withUnknown)).toMatchObject({ verdict: "insufficient", reason: "unknown" });
    const withAbnormal = await exec(["triage"], { route: route({ warns: [weak()], errors: [error("api.unhandled")] }) });
    expect(withAbnormal.code).toBe(EXIT.RECURRED);
    expect(summary(withAbnormal)).toMatchObject({ abnormal: 1, debt: 1 });
  });
});

describe("플러그인 조회 코드는 Issue 행을 판정에 쓰는 필드로 줄인다", () => {
  // title·error.message·그 밖의 필드는 외부 입력이 섞일 수 있는 자유 텍스트라 execute 결과(대화)로 돌려보내지 않는다
  const noisy = (over: Record<string, unknown>) => ({
    id: "i-noisy",
    status: "active",
    title: "TypeError: SENTINEL title",
    name: "SENTINEL name",
    message: "SENTINEL message",
    error: { name: "TypeError", message: "SENTINEL error message", stack: "Error: SENTINEL\n at a" },
    count: 3,
    firstObserved: Date.parse("2026-10-01T10:00:00Z"),
    lastObserved: Date.parse("2026-10-03T10:00:00Z"),
    meta: { note: "SENTINEL meta" },
    ...over,
  });

  it("title·오류 메시지·모르는 필드를 싣지 않고 ID·status·시각·count·errorName·result_info는 남긴다. 판정은 토큰 경로와 같다", async () => {
    const r = route({
      issuePages: [
        [noisy({}), noisy({ id: "i-old", lastObserved: Date.parse("2026-09-30T10:00:00Z") })],
        [noisy({ id: "i-weird", status: "SENTINEL status with spaces", error: { name: "SENTINEL bad name" }, lastObserved: "SENTINEL date" })],
      ],
    });
    const network = await exec(["triage", ...WINDOW, "--json"], { route: r });
    const { judged, bundle } = await viaPlugin([...WINDOW, "--json"], r);
    expect(JSON.stringify(bundle)).not.toContain("SENTINEL");
    const first = bundle.issuePages[0].response;
    expect(first.result_info).toMatchObject({ page: 1, total_pages: 2 });
    expect(first.result[0]).toEqual({
      id: "i-noisy",
      status: "active",
      error: { name: "TypeError" },
      count: 3,
      firstObserved: Date.parse("2026-10-01T10:00:00Z"),
      lastObserved: Date.parse("2026-10-03T10:00:00Z"),
    });
    expect(judged.code).toBe(network.code);
    const a = full(judged);
    a.notes = a.notes.filter((n: string) => !n.startsWith(INPUT_NOTE));
    expect(a).toEqual(full(network));
    expect(a.abnormal.map((x: { id: string }) => x.id).sort()).toEqual(["i-noisy", "i-weird"]);
  });

  it.each([
    ["기본", noisy({})],
    ["다른 이름의 필드(issueId, occurrenceCount, updated)", { issueId: "i2", occurrenceCount: 5, updated: "2026-10-03T09:00:00Z", errorName: "RangeError" }],
    ["문자열 count와 숫자 count가 함께", { id: "i3", count: "7", occurrences: 9, lastSeen: "2026-10-03T09:00:00Z" }],
    ["글자 count", { id: "i4", count: "SENTINEL many", eventCount: 2 }],
    ["객체 count·status·errorName", { id: "i5", count: { n: 1 }, status: { s: "SENTINEL" }, errorName: ["SENTINEL bad"] }],
    ["빈 값", { id: "i6", status: "", errorName: null, error: { name: "" }, lastObserved: "" }],
    ["숫자 status", { id: "i7", status: 1, lastObserved: 1 }],
    ["error가 문자열", { id: "i8", error: "SENTINEL plain", errorName: "Error" }],
  ])("slimIssue는 판정을 바꾸지 않는다: %s", (_name, raw) => {
    const opts = { from: Date.parse(SINCE), to: NOW };
    const bundle = (rows: unknown[]) => ({
      format: TRIAGE_INPUT_FORMAT,
      ...Object.fromEntries(
        Object.entries(buildTriageQueries(opts)).map(([k, request]) => [k, { request, response: { success: true, result: { events: { events: [] } } } }])
      ),
      issuePages: [{ request: { query: issueListQuery(1) }, response: { success: true, result: rows, result_info: { page: 1, total_pages: 1 } } }],
    });
    const slim = slimIssue(raw);
    expect(JSON.stringify(slim)).not.toContain("SENTINEL");
    expect(evaluateTriage(bundle([slim]), opts, { strict: true })).toEqual(evaluateTriage(bundle([raw]), opts, { strict: true }));
  });
});

describe("triage가 받지 않는 공통 옵션", () => {
  it.each([["--limit", "50"], ["--path", "/api/x"]])("%s를 주면 조용히 무시하지 않고 인자 오류 2", async (flag, value) => {
    const r = await exec(["triage", flag, value], { route: route({}) });
    expect(r.code).toBe(EXIT.FAILED);
    expect(r.err.join("\n")).toContain(flag);
    expect(r.calls).toHaveLength(0);
  });
});
