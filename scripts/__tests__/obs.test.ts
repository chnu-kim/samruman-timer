import { describe, it, expect, vi } from "vitest";
import {
  run,
  parseArgs,
  parseDuration,
  parseSince,
  buildTelemetryQuery,
  buildSummaryQuery,
  eq,
  normalizeEvent,
  extractEvents,
  normalizeCalculations,
  summarizeEvents,
  normalizeIssue,
  normalizeOccurrence,
  extractCursor,
  extractIssue,
  attributeVersion,
  collectOccurrences,
  judgeVerify,
  MAX_LIMIT,
  EXIT,
  SERVICE,
} from "../lib/obs.mjs";

const NOW = Date.parse("2026-10-03T12:00:00.000Z");
const TOKEN = "SENTINEL-TOKEN-must-not-leak-0123456789";
const TAG = "abcdef012345";

type Route = (url: URL, init: RequestInit) => { status?: number; body: unknown } | undefined;

/** URL·메서드로 응답을 고르는 fetch 목. 요청 바디는 calls에 남긴다 */
function mockFetch(route: Route) {
  const calls: { url: URL; method: string; body: unknown; headers: Record<string, string> }[] = [];
  const fetch = vi.fn(async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, method: init.method ?? "GET", body, headers: init.headers as Record<string, string> });
    const res = route(url, init);
    if (!res) return new Response(JSON.stringify({ success: false, errors: [{ code: 404, message: "no route" }] }), { status: 404 });
    return new Response(typeof res.body === "string" ? res.body : JSON.stringify(res.body), {
      status: res.status ?? 200,
    });
  });
  return { fetch, calls };
}

async function exec(argv: string[], route: Route, env: Record<string, string | undefined> = { CF_OBS_TOKEN: TOKEN }) {
  const { fetch, calls } = mockFetch(route);
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(argv, {
    fetch: fetch as unknown as typeof globalThis.fetch,
    env,
    now: () => NOW,
    out: (l: string) => out.push(l),
    err: (l: string) => err.push(l),
  });
  return { code, out, err, calls, fetch };
}

const queryFilters = (call: { body: unknown }) => (call.body as { parameters: { filters: unknown[] } }).parameters.filters;

const ok = (result: unknown) => ({ body: { success: true, errors: [], messages: [], result } });

/** Workers Observability events view에서 예상하는 이벤트 한 건(실제 모양은 미확인) */
function rawEvent(source: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    dataset: "cloudflare-workers",
    timestamp: Date.parse(String(source.timestamp ?? "2026-10-03T11:00:00.000Z")),
    source,
    $metadata: { service: SERVICE, level: source.level, message: source.event },
    $workers: { scriptVersion: { id: "ver-1", tag: source.versionTag } },
    ...extra,
  };
}

const errEvent = (over: Record<string, unknown> = {}) =>
  rawEvent({
    level: "error",
    event: "api.unhandled",
    message: "api.unhandled",
    requestId: "req-1",
    method: "GET",
    path: "/api/projects",
    kind: "schema_drift",
    errorName: "Error",
    error: "no such table: projects",
    stack: "Error: x\n    at a\n    at b",
    versionId: "ver-1",
    versionTag: TAG,
    timestamp: "2026-10-03T11:00:00.000Z",
    ...over,
  });

describe("인자·기간", () => {
  it("parseArgs는 위치 인자, --k v, --k=v, 불리언 플래그를 나눈다", () => {
    expect(parseArgs(["events", "auth.login.failed", "--since", "2h", "--limit=5", "--json"])).toEqual({
      command: "events",
      positional: ["auth.login.failed"],
      flags: { since: "2h", limit: "5", json: true },
    });
    expect(() => parseArgs(["errors", "--since"])).toThrow(/값이 필요/);
  });

  it("parseDuration은 s·m·h·d를 ms로 바꾼다", () => {
    expect(parseDuration("90s")).toBe(90_000);
    expect(parseDuration("15m")).toBe(900_000);
    expect(parseDuration("1h")).toBe(3_600_000);
    expect(parseDuration("3d")).toBe(259_200_000);
    expect(() => parseDuration("1w")).toThrow();
    expect(() => parseDuration("0h")).toThrow();
  });

  it("parseSince는 기간과 ISO 시각을 받고 미래 시각은 거부한다", () => {
    expect(parseSince("1h", NOW)).toBe(NOW - 3_600_000);
    expect(parseSince("2026-10-03T00:00:00Z", NOW)).toBe(Date.parse("2026-10-03T00:00:00Z"));
    expect(() => parseSince("2026-10-04T00:00:00Z", NOW)).toThrow(/미래/);
    expect(() => parseSince("yesterday", NOW)).toThrow();
  });
});

describe("쿼리 바디", () => {
  it("서비스 필터를 항상 앞에 넣고 limit을 2000으로 묶는다", () => {
    const body = buildTelemetryQuery({ from: 1, to: 2, limit: 5000, filters: [eq("level", "error")] });
    expect(body).toEqual({
      queryId: "adhoc",
      view: "events",
      limit: 2000,
      dry: true,
      timeframe: { from: 1, to: 2 },
      parameters: {
        datasets: ["cloudflare-workers"],
        filters: [
          { key: "$metadata.service", operation: "eq", type: "string", value: "samrumantimer" },
          { key: "level", operation: "eq", type: "string", value: "error" },
        ],
        filterCombination: "and",
      },
    });
  });

  it("summary는 calculations view에 event·level groupBy를 건다", () => {
    const body = buildSummaryQuery({ from: 1, to: 2 });
    expect(body.view).toBe("calculations");
    expect(body.parameters.calculations).toEqual([{ operator: "count", alias: "count" }]);
    expect(body.parameters.groupBys).toEqual([
      { type: "string", value: "event" },
      { type: "string", value: "level" },
    ]);
  });
});

describe("응답 정규화", () => {
  it("source의 앱 필드를 평평하게 꺼내고 message는 버리며 stack은 요청 조회에서만 앞부분을 남긴다", () => {
    const e = normalizeEvent(errEvent());
    expect(e).toMatchObject({
      timestamp: "2026-10-03T11:00:00.000Z",
      level: "error",
      event: "api.unhandled",
      requestId: "req-1",
      versionTag: TAG,
      kind: "schema_drift",
      path: "/api/projects",
    });
    expect(e).not.toHaveProperty("message");
    expect(e).not.toHaveProperty("stack");
    expect(normalizeEvent(errEvent(), { withStack: true }).stack).toBe("Error: x\n    at a\n    at b");
  });

  it("source가 JSON 문자열이거나 없으면 최상위·$metadata·$workers에서 보충한다", () => {
    const fromString = normalizeEvent({ source: JSON.stringify({ level: "warn", event: "a.b" }), timestamp: NOW });
    expect(fromString).toMatchObject({ level: "warn", event: "a.b", timestamp: new Date(NOW).toISOString() });

    const noSource = normalizeEvent({
      $metadata: { level: "error", message: "Uncaught TypeError", error: "boom" },
      $workers: { scriptVersion: { id: "v", tag: "t1" }, requestId: "r" },
    });
    expect(noSource).toMatchObject({ level: "error", event: "Uncaught TypeError", versionTag: "t1", requestId: "r", error: "boom" });
  });

  it("앱 필드가 source 없이 최상위에 펼쳐진 실제 이벤트 모양에서도 versionTag와 나머지 필드를 꺼낸다", () => {
    // 2026-10-03 프로덕션 Workers Logs 이벤트(대시보드 JSON)의 모양. requestId·rayId 등은 축약
    const real = {
      timestamp: "2026-10-03T01:28:07.881Z",
      message: "auth.oauth_state_invalid",
      event: "auth.oauth_state_invalid",
      versionTag: "12be6a2d8c6b",
      versionId: "eba3942c-cefa-43d9-98c2-1b834addb649",
      reason: "missing_cookie",
      requestId: "aa157573-97c9-44d0-a312-a87380288f12",
      level: "warn",
      $workers: {
        scriptName: SERVICE,
        scriptVersion: { id: "eba3942c-cefa-43d9-98c2-1b834addb649" },
        event: { request: { method: "GET", url: "https://example.test/api/auth/callback", path: "/api/auth/callback" } },
      },
      $metadata: { id: "01M3", requestId: "6d1c1ceb", service: SERVICE, level: "warn", message: "auth.oauth_state_invalid" },
    };
    expect(normalizeEvent(real)).toEqual({
      timestamp: "2026-10-03T01:28:07.881Z",
      level: "warn",
      event: "auth.oauth_state_invalid",
      requestId: "aa157573-97c9-44d0-a312-a87380288f12",
      versionTag: "12be6a2d8c6b",
      versionId: "eba3942c-cefa-43d9-98c2-1b834addb649",
      reason: "missing_cookie",
    });
  });

  it("extractEvents는 result.events.events·result.events·배열 모양을 모두 받는다", () => {
    const e = errEvent();
    expect(extractEvents({ result: { events: { events: [e] } } })).toHaveLength(1);
    expect(extractEvents({ result: { events: [e] } })).toHaveLength(1);
    expect(extractEvents({ result: [e] })).toHaveLength(1);
    expect(extractEvents({ result: {} })).toEqual([]);
  });

  it("normalizeCalculations는 groups·count를 읽고, 모양을 모르면 null", () => {
    const body = {
      result: {
        calculations: [
          {
            aggregates: [
              { groups: [{ key: "event", value: "auth.refresh.rejected" }, { key: "level", value: "info" }], count: 40 },
              { groups: [{ key: "event", value: "api.unhandled" }, { key: "level", value: "error" }], value: 2 },
            ],
          },
        ],
      },
    };
    expect(normalizeCalculations(body)).toEqual([
      { event: "api.unhandled", level: "error", count: 2 },
      { event: "auth.refresh.rejected", level: "info", count: 40 },
    ]);
    expect(normalizeCalculations({ result: { something: 1 } })).toBeNull();
  });

  it("summarizeEvents는 event×level로 세고 error부터 정렬한다", () => {
    expect(
      summarizeEvents([
        { event: "a", level: "info" },
        { event: "a", level: "info" },
        { event: "b", level: "error" },
      ])
    ).toEqual([
      { event: "b", level: "error", count: 1 },
      { event: "a", level: "info", count: 2 },
    ]);
  });

  it("Issue·occurrence를 방어적으로 정규화하고 cursor를 찾는다", () => {
    expect(normalizeIssue({ id: "i1", status: "active", title: "TypeError: x", count: 3, lastSeen: "2026-10-03T00:00:00Z" })).toEqual({
      id: "i1",
      status: "active",
      title: "TypeError: x",
      count: 3,
      lastSeen: "2026-10-03T00:00:00Z",
    });
    expect(normalizeIssue({ id: "i2", error: { name: "Error", message: "m" } })).toMatchObject({ title: "m", errorName: "Error" });
    // OpenAPI의 Issue 필드: firstObserved·lastObserved(epoch ms)
    expect(
      normalizeIssue({ id: "i3", firstObserved: Date.parse("2026-10-01T00:00:00Z"), lastObserved: Date.parse("2026-10-03T00:00:00Z") })
    ).toMatchObject({ firstSeen: "2026-10-01T00:00:00.000Z", lastSeen: "2026-10-03T00:00:00.000Z" });
    expect(normalizeIssue({ id: "i4", created: 1_700_000_000_000, updated: 1_700_000_100_000 })).toMatchObject({
      firstSeen: new Date(1_700_000_000_000).toISOString(),
      lastSeen: new Date(1_700_000_100_000).toISOString(),
    });
    // 상세 응답은 result.issue로 감싸져 온다
    expect(extractIssue({ success: true, result: { issue: { id: "i1" } } })).toEqual({ id: "i1" });
    expect(extractIssue({ success: true, result: { id: "i1" } })).toEqual({ id: "i1" });
    expect(
      normalizeOccurrence({
        id: "o1",
        timestamp: Date.parse("2026-10-03T11:30:00Z"),
        worker: { scriptVersion: { id: "v1", tag: TAG } },
        invocation: { id: "inv", method: "POST", path: "/api/x", statusCode: 500, rayId: "ray" },
        error: { name: "Error", message: "boom", stack: "s" },
      })
    ).toEqual({
      id: "o1",
      timestamp: "2026-10-03T11:30:00.000Z",
      invocationId: "inv",
      versionTag: TAG,
      versionId: "v1",
      method: "POST",
      path: "/api/x",
      statusCode: 500,
      rayId: "ray",
      errorName: "Error",
      error: "boom",
    });
    // OpenAPI 위치: result_info.cursors.after(nullable)
    expect(extractCursor({ result_info: { cursors: { after: "c1" } } })).toBe("c1");
    expect(extractCursor({ result_info: { cursors: { after: null } } })).toBeUndefined();
    expect(extractCursor({ result_info: { cursor: "c2" } })).toBe("c2");
    expect(extractCursor({ result_info: { cursor: "" } })).toBeUndefined();
  });
});

describe("judgeVerify", () => {
  const base = { tag: TAG, errorEvents: [], occurrences: [], tagEventCount: 5 };

  it("태그 error나 occurrence가 있으면 재발(1)", () => {
    expect(judgeVerify({ ...base, errorEvents: [{ versionTag: TAG }] }).exitCode).toBe(EXIT.RECURRED);
    expect(judgeVerify({ ...base, occurrences: [{ versionTag: TAG }] }).verdict).toBe("recurred");
  });

  it("태그 없는 error는 versionId가 태그 로그의 버전이면 재발, 다른 버전이면 무시, 버전 정보가 없으면 근거 부족", () => {
    const versionIds = new Set(["ver-new"]);
    expect(judgeVerify({ ...base, versionIds, errorEvents: [{ versionId: "ver-new" }] }).verdict).toBe("recurred");
    expect(judgeVerify({ ...base, versionIds, errorEvents: [{ versionId: "ver-old" }] }).verdict).toBe("clean");
    expect(judgeVerify({ ...base, versionIds, errorEvents: [{}] })).toMatchObject({
      verdict: "insufficient",
      reason: "unattributed",
      unattributedErrors: 1,
    });
    expect(judgeVerify({ ...base, errorEvents: [{ versionTag: "other" }] }).verdict).toBe("clean");
  });

  it("버전 정보 없는 항목은 태그 로그가 처음 보인 시각 이전이면 이전 배포로 보고 세지 않는다", () => {
    const firstTagTs = Date.parse("2026-10-03T10:00:00Z");
    const before = { timestamp: "2026-10-03T09:00:00Z" };
    const after = { timestamp: "2026-10-03T10:30:00Z" };
    expect(judgeVerify({ ...base, firstTagTs, errorEvents: [before], occurrences: [before] }).verdict).toBe("clean");
    expect(judgeVerify({ ...base, firstTagTs, errorEvents: [after] }).reason).toBe("unattributed");
  });

  it("attributeVersion: 태그가 versionId보다 먼저다", () => {
    const ids = new Set(["v"]);
    expect(attributeVersion({ versionTag: TAG }, TAG, ids)).toBe("match");
    expect(attributeVersion({ versionTag: "x", versionId: "v" }, TAG, ids)).toBe("other");
    expect(attributeVersion({ versionId: "v" }, TAG, ids)).toBe("match");
    expect(attributeVersion({}, TAG, ids)).toBe("unknown");
  });

  it("조회가 잘렸으면 근거 부족(2). 단 이미 찾은 재발은 재발(1)", () => {
    expect(judgeVerify({ ...base, truncated: ["x"] })).toMatchObject({ verdict: "insufficient", reason: "truncated" });
    expect(judgeVerify({ ...base, truncated: ["x"], errorEvents: [{ versionTag: TAG }] }).verdict).toBe("recurred");
  });

  it("--expect-event가 태그 로그에 없으면 근거 부족(2)", () => {
    expect(judgeVerify({ ...base, expectEvent: "auth.login.succeeded", expectEventCount: 0 })).toMatchObject({
      verdict: "insufficient",
      reason: "expected_event_missing",
    });
    expect(judgeVerify({ ...base, expectEvent: "auth.login.succeeded", expectEventCount: 2 }).verdict).toBe("clean");
  });

  it("다른 태그의 occurrence는 무시한다", () => {
    expect(judgeVerify({ ...base, occurrences: [{ versionTag: "old" }] })).toMatchObject({ verdict: "clean", exitCode: 0 });
  });

  it("태그를 읽지 못한 occurrence가 있으면 근거 부족(2)", () => {
    expect(judgeVerify({ ...base, occurrences: [{ id: "o" }] })).toMatchObject({
      verdict: "insufficient",
      reason: "unattributed",
      exitCode: 2,
    });
  });

  it("태그 로그가 minEvents보다 적으면 근거 부족(2), minEvents 0이면 clean", () => {
    expect(judgeVerify({ ...base, tagEventCount: 0 })).toMatchObject({ verdict: "insufficient", reason: "too_few_events" });
    expect(judgeVerify({ ...base, tagEventCount: 0, minEvents: 0 }).verdict).toBe("clean");
  });
});

describe("run (CLI)", () => {
  it("토큰이 없으면 fetch 없이 2로 끝난다", async () => {
    const r = await exec(["errors"], () => ok({}), {});
    expect(r.code).toBe(EXIT.FAILED);
    expect(r.fetch).not.toHaveBeenCalled();
    expect(r.err.join("\n")).toContain("CF_OBS_TOKEN");
  });

  it("errors: 계정 경로·Bearer 토큰·level 필터로 질의하고 JSON lines로 출력한다", async () => {
    const r = await exec(["errors", "--since", "2h"], (url) =>
      url.pathname.endsWith("/telemetry/query") ? ok({ events: { events: [errEvent()] } }) : undefined
    );
    expect(r.code).toBe(0);
    const call = r.calls[0];
    expect(call.method).toBe("POST");
    expect(call.url.pathname).toBe(
      "/client/v4/accounts/fc7323801136ae087db0b88ab4d07b53/workers/observability/telemetry/query"
    );
    expect(call.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(call.body).toMatchObject({ timeframe: { from: NOW - 7_200_000, to: NOW } });
    expect((call.body as { parameters: { filters: unknown[] } }).parameters.filters).toContainEqual(eq("level", "error"));
    expect(JSON.parse(r.out[0])).toMatchObject({ event: "api.unhandled", requestId: "req-1", versionTag: TAG });
  });

  it("CLOUDFLARE_ACCOUNT_ID로 계정을 바꾼다", async () => {
    const acct = "0".repeat(32);
    const r = await exec(["errors"], () => ok({ events: { events: [] } }), { CF_OBS_TOKEN: TOKEN, CLOUDFLARE_ACCOUNT_ID: acct });
    expect(r.calls[0].url.pathname).toContain(`/accounts/${acct}/`);
  });

  it("request: requestId 필터, stack 앞부분 포함", async () => {
    const r = await exec(["request", "req-1"], () => ok({ events: { events: [errEvent()] } }));
    expect((r.calls[0].body as { parameters: { filters: unknown[] } }).parameters.filters).toContainEqual(eq("requestId", "req-1"));
    expect(JSON.parse(r.out[0]).stack).toContain("at a");
  });

  it("--json은 응답 원문을 출력한다", async () => {
    const raw = { success: true, result: { events: { events: [errEvent()] } } };
    const r = await exec(["events", "api.unhandled", "--json"], () => ({ body: raw }));
    expect(JSON.parse(r.out.join("\n"))).toEqual(raw);
  });

  it("summary: calculations를 못 읽으면 events로 받아 클라이언트에서 센다", async () => {
    const r = await exec(["summary"], (_url, init) => {
      const body = JSON.parse(String(init.body));
      if (body.view === "calculations") return { status: 400, body: { success: false, errors: [{ code: 1, message: "bad" }] } };
      return ok({ events: { events: [errEvent(), errEvent({ requestId: "req-2" })] } });
    });
    expect(r.code).toBe(0);
    expect(r.out).toEqual(["     2  error  api.unhandled"]);
    expect(r.err.join("\n")).toContain("events로 대신 집계");
  });

  it("401·403은 토큰 권한 안내와 함께 2로 끝나고 토큰을 출력하지 않는다", async () => {
    for (const status of [401, 403]) {
      const r = await exec(["issues"], () => ({
        status,
        body: { success: false, errors: [{ code: 10000, message: `Authentication error ${TOKEN}` }] },
      }));
      expect(r.code).toBe(EXIT.FAILED);
      const text = [...r.out, ...r.err].join("\n");
      expect(text).toContain(String(status));
      expect(text).toContain("1회성 설정");
      expect(text).not.toContain(TOKEN);
    }
  });

  it("네트워크 오류도 2로 끝나고, 오류 메시지에 섞인 토큰은 가린다", async () => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await run(["errors"], {
      fetch: (async () => {
        throw new TypeError(`fetch failed (Bearer ${TOKEN})`);
      }) as unknown as typeof fetch,
      env: { CF_OBS_TOKEN: TOKEN },
      now: () => NOW,
      out: (l: string) => out.push(l),
      err: (l: string) => err.push(l),
    });
    expect(code).toBe(EXIT.FAILED);
    expect(err.join("\n")).toContain("네트워크 오류");
    expect(err.join("\n")).not.toContain(TOKEN);
    expect(err.join("\n")).toContain("[REDACTED]");
  });

  it("issues: service·status·perPage 쿼리로 부른다", async () => {
    const r = await exec(["issues", "--limit", "10"], (url) =>
      url.pathname.endsWith("/issues") ? ok([{ id: "i1", status: "active", title: "t" }]) : undefined
    );
    expect(r.code).toBe(0);
    expect(Object.fromEntries(r.calls[0].url.searchParams)).toEqual({ service: SERVICE, status: "active", perPage: "10" });
    expect(JSON.parse(r.out[0])).toEqual({ id: "i1", status: "active", title: "t" });
  });

  it("issue <id>: 상세와 occurrence를 함께 낸다", async () => {
    const r = await exec(["issue", "i1"], (url) => {
      if (url.pathname.endsWith("/issues/i1"))
        return ok({ issue: { id: "i1", status: "active", title: "t", count: 4, firstObserved: NOW - 3_600_000, lastObserved: NOW } });
      if (url.pathname.endsWith("/issues/i1/occurrences"))
        return {
          body: {
            success: true,
            result: [{ id: "o1", worker: { scriptVersion: { tag: TAG } } }],
            result_info: { per_page: 100, count: 1, cursors: { after: "n" } },
          },
        };
      return undefined;
    });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out[0])).toEqual({
      issue: {
        id: "i1",
        status: "active",
        title: "t",
        count: 4,
        firstSeen: new Date(NOW - 3_600_000).toISOString(),
        lastSeen: new Date(NOW).toISOString(),
      },
    });
    expect(JSON.parse(r.out[1])).toEqual({ occurrence: { id: "o1", versionTag: TAG } });
    expect(r.err.join("\n")).toContain("더 있음");
  });
});

describe("run verify", () => {
  /** verify가 부르는 API 셋(error 질의, 태그 전체 질의, issues, occurrences)을 흉내 낸다 */
  function verifyRoute(opts: {
    errors?: unknown[];
    tagEvents?: unknown[];
    issues?: unknown[] | { status: number; body: unknown };
    occurrences?: Record<string, unknown[]>;
  }): Route {
    return (url, init) => {
      if (url.pathname.endsWith("/telemetry/query")) {
        const body = JSON.parse(String(init.body));
        // 태그 질의만 versionTag 필터를 건다. 재발 후보 질의는 태그 없이 level=error 또는 event로 거른다
        const isTagQuery = body.parameters.filters.some((f: { key: string }) => f.key === "versionTag");
        return ok({ events: { events: isTagQuery ? (opts.tagEvents ?? []) : (opts.errors ?? []) } });
      }
      if (url.pathname.endsWith("/issues")) {
        const i = opts.issues ?? [];
        return Array.isArray(i) ? ok(i) : i;
      }
      const m = /\/issues\/([^/]+)\/occurrences$/.exec(url.pathname);
      if (m) return { body: { success: true, result: opts.occurrences?.[m[1]] ?? [], result_info: { per_page: 100, count: 0, cursors: { after: null } } } };
      return undefined;
    };
  }
  const infoEvent = rawEvent({ level: "info", event: "auth.login.succeeded", versionTag: TAG });

  it("태그 로그가 있고 error·occurrence가 없으면 0", async () => {
    const r = await exec(
      ["verify", "--tag", TAG],
      verifyRoute({ tagEvents: [infoEvent], issues: [{ id: "i1" }], occurrences: { i1: [{ id: "o", timestamp: "2026-10-03T11:00:00Z", worker: { scriptVersion: { tag: "old" } } }] } })
    );
    expect(r.code).toBe(EXIT.OK);
    expect(JSON.parse(r.out[0])).toMatchObject({ tag: TAG, verdict: "clean", tagEventCount: 1, errorCount: 0 });
    // 태그 질의는 versionTag로, 재발 후보 질의는 태그 없이 level=error로 거른다(태그가 빠진 로그도 받으려고)
    const queries = r.calls.filter((c) => c.url.pathname.endsWith("/telemetry/query")).map((c) => queryFilters(c));
    expect(queries[0]).toContainEqual(eq("versionTag", TAG));
    expect(queries[1]).toContainEqual(eq("level", "error"));
    expect(queries[1]).not.toContainEqual(eq("versionTag", TAG));
    // 기본 기간은 보관 기간(3d)
    expect(r.calls[0].body).toMatchObject({ timeframe: { from: NOW - 259_200_000, to: NOW } });
    expect(JSON.parse(r.out[0]).notes.join("\n")).toContain("--expect-event");
  });

  it("app versionTag가 빠진 error도 같은 버전(versionId)이면 재발로 센다", async () => {
    const untagged = errEvent({ versionTag: undefined, versionId: "ver-1" });
    const r = await exec(["verify", "--tag", TAG, "--skip-issues"], verifyRoute({ errors: [untagged], tagEvents: [infoEvent] }));
    expect(r.code).toBe(EXIT.RECURRED);
  });

  it("버전 정보가 전혀 없는 error가 배포 이후에 있으면 근거 부족 2", async () => {
    const noVersion = { timestamp: Date.parse("2026-10-03T11:30:00Z"), source: { level: "error", event: "api.unhandled" } };
    const r = await exec(["verify", "--tag", TAG, "--skip-issues"], verifyRoute({ errors: [noVersion], tagEvents: [infoEvent] }));
    expect(r.code).toBe(EXIT.FAILED);
    expect(JSON.parse(r.out[0])).toMatchObject({ reason: "unattributed", unattributedErrors: 1 });
  });

  it("태그 로그가 2000건에서 잘리면 배포 시점을 추정하지 않아, 관측된 첫 태그 로그 이전의 버전 모르는 error도 센다", async () => {
    const tagged = rawEvent({ level: "info", event: "auth.refresh.rejected", versionTag: TAG, timestamp: "2026-10-03T11:00:00.000Z" });
    const early = { timestamp: Date.parse("2026-10-02T12:00:00Z"), source: { level: "error", event: "api.unhandled" } };
    const route = (n: number) =>
      verifyRoute({ errors: [early], tagEvents: Array.from({ length: n }, () => tagged) });
    const truncated = await exec(["verify", "--tag", TAG, "--skip-issues"], route(MAX_LIMIT));
    expect(truncated.code).toBe(EXIT.FAILED);
    expect(JSON.parse(truncated.out[0])).toMatchObject({ reason: "unattributed", unattributedErrors: 1 });
    // 잘리지 않았으면 첫 태그 로그 이전 것은 이전 배포로 본다
    const full = await exec(["verify", "--tag", TAG, "--skip-issues"], route(3));
    expect(full.code).toBe(EXIT.OK);
  });

  it("다른 태그의 error는 무시한다", async () => {
    const old = errEvent({ versionTag: "000000000000", versionId: "ver-0" });
    const r = await exec(["verify", "--tag", TAG, "--skip-issues"], verifyRoute({ errors: [old], tagEvents: [infoEvent] }));
    expect(r.code).toBe(EXIT.OK);
  });

  it("error 후보가 2000건에서 잘리면 근거 부족 2", async () => {
    const old = errEvent({ versionTag: "000000000000", versionId: "ver-0" });
    const r = await exec(
      ["verify", "--tag", TAG, "--skip-issues"],
      verifyRoute({ errors: Array.from({ length: MAX_LIMIT }, () => old), tagEvents: [infoEvent] })
    );
    expect(r.code).toBe(EXIT.FAILED);
    expect(JSON.parse(r.out[0]).reason).toBe("truncated");
  });

  it("--expect-event가 태그 로그에 없으면 2, 있으면 0", async () => {
    const r1 = await exec(
      ["verify", "--tag", TAG, "--skip-issues", "--expect-event", "timer.modify.succeeded"],
      verifyRoute({ tagEvents: [infoEvent] })
    );
    expect(r1.code).toBe(EXIT.FAILED);
    expect(JSON.parse(r1.out[0]).reason).toBe("expected_event_missing");
    const r2 = await exec(
      ["verify", "--tag", TAG, "--skip-issues", "--expect-event", "auth.login.succeeded"],
      verifyRoute({ tagEvents: [infoEvent] })
    );
    expect(r2.code).toBe(EXIT.OK);
    expect(JSON.parse(r2.out[0])).toMatchObject({ expectEventCount: 1 });
  });

  it("태그 error 이벤트가 있으면 1", async () => {
    const r = await exec(["verify", "--tag", TAG], verifyRoute({ errors: [errEvent()], tagEvents: [errEvent()] }));
    expect(r.code).toBe(EXIT.RECURRED);
    expect(JSON.parse(r.out[0])).toMatchObject({ verdict: "recurred", errorCount: 1 });
    expect(JSON.parse(r.out[1]).error).toMatchObject({ event: "api.unhandled" });
  });

  it("active issue에 이 태그 occurrence가 있으면 1", async () => {
    const r = await exec(
      ["verify", "--tag", TAG],
      verifyRoute({
        tagEvents: [infoEvent],
        issues: [{ id: "i1" }],
        occurrences: { i1: [{ id: "o1", timestamp: "2026-10-03T11:30:00Z", worker: { scriptVersion: { tag: TAG } } }] },
      })
    );
    expect(r.code).toBe(EXIT.RECURRED);
    expect(JSON.parse(r.out[0])).toMatchObject({ occurrenceCount: 1 });
  });

  it("since 이전 occurrence는 세지 않는다", async () => {
    const r = await exec(
      ["verify", "--tag", TAG, "--since", "1h"],
      verifyRoute({
        tagEvents: [infoEvent],
        issues: [{ id: "i1" }],
        occurrences: { i1: [{ id: "o1", timestamp: "2026-10-03T09:00:00Z", worker: { scriptVersion: { tag: TAG } } }] },
      })
    );
    expect(r.code).toBe(EXIT.OK);
  });

  it("태그 로그가 0건이면 근거 부족 2, --min-events 0이면 0", async () => {
    const empty = verifyRoute({});
    const r1 = await exec(["verify", "--tag", TAG], empty);
    expect(r1.code).toBe(EXIT.FAILED);
    expect(r1.err.join("\n")).toContain("판정 근거 부족");
    const r2 = await exec(["verify", "--tag", TAG, "--min-events", "0"], empty);
    expect(r2.code).toBe(EXIT.OK);
  });

  it("Issues 조회가 403이면 재발 없음으로 넘기지 않고 2, --skip-issues면 로그만으로 판정", async () => {
    const forbidden = verifyRoute({ tagEvents: [infoEvent], issues: { status: 403, body: { success: false } } });
    const r1 = await exec(["verify", "--tag", TAG], forbidden);
    expect(r1.code).toBe(EXIT.FAILED);
    expect(r1.err.join("\n")).toContain("--skip-issues");
    const r2 = await exec(["verify", "--tag", TAG, "--skip-issues"], forbidden);
    expect(r2.code).toBe(EXIT.OK);
    expect(r2.calls.some((c) => c.url.pathname.includes("/issues"))).toBe(false);
  });

  it("Issue ID를 읽지 못하면 2", async () => {
    const r = await exec(["verify", "--tag", TAG], verifyRoute({ tagEvents: [infoEvent], issues: [{ weird: true }] }));
    expect(r.code).toBe(EXIT.FAILED);
  });

  it("--event는 재발 후보 질의를 좁히고, --issue 없이 주면 Issues를 보지 않는다", async () => {
    const r = await exec(["verify", "--tag", TAG, "--event", "auth.login.failed"], verifyRoute({ tagEvents: [infoEvent] }));
    expect(r.code).toBe(EXIT.OK);
    const filters = queryFilters(r.calls[1]);
    expect(filters).toContainEqual(eq("event", "auth.login.failed"));
    expect(r.calls.some((c) => c.url.pathname.includes("/issues"))).toBe(false);
    expect(JSON.parse(r.out[0]).notes[0]).toContain("--event만");
  });

  it("--event는 level=error로 거르지 않아 warn 이벤트의 재발도 잡는다. info는 세지 않는다", async () => {
    const warn = rawEvent({ level: "warn", event: "timer.modify.conflict_exhausted", versionTag: TAG });
    const r = await exec(
      ["verify", "--tag", TAG, "--event", "timer.modify.conflict_exhausted"],
      verifyRoute({ errors: [warn], tagEvents: [infoEvent, warn] })
    );
    expect(r.code).toBe(EXIT.RECURRED);
    expect(queryFilters(r.calls[1])).not.toContainEqual(eq("level", "error"));

    const info = rawEvent({ level: "info", event: "auth.oauth_state_invalid", versionTag: TAG });
    const r2 = await exec(
      ["verify", "--tag", TAG, "--event", "auth.oauth_state_invalid"],
      verifyRoute({ errors: [info], tagEvents: [info] })
    );
    expect(r2.code).toBe(EXIT.OK);
  });

  it("occurrence 페이지 한도를 다 쓰고도 cursor가 남으면 근거 부족 2", async () => {
    const r = await exec(["verify", "--tag", TAG, "--issue", "i1"], (url, init) => {
      if (url.pathname.endsWith("/telemetry/query")) {
        const body = JSON.parse(String(init.body));
        const isTag = body.parameters.filters.some((f: { key: string }) => f.key === "versionTag");
        return ok({ events: { events: isTag ? [infoEvent] : [] } });
      }
      // 최신순으로 since 이후 occurrence만 계속 나온다(다른 태그)
      return {
        body: {
          success: true,
          result: [{ id: "o", timestamp: NOW - 60_000, worker: { scriptVersion: { id: "ver-0", tag: "old" } } }],
          result_info: { per_page: 100, count: 1, cursors: { after: "more" } },
        },
      };
    });
    expect(r.code).toBe(EXIT.FAILED);
    expect(JSON.parse(r.out[0])).toMatchObject({ reason: "truncated" });
  });

  it("active Issue 목록이 여러 쪽이면 page로 넘겨 모두 본다", async () => {
    const r = await exec(["verify", "--tag", TAG], (url, init) => {
      if (url.pathname.endsWith("/telemetry/query")) {
        const body = JSON.parse(String(init.body));
        const isTag = body.parameters.filters.some((f: { key: string }) => f.key === "versionTag");
        return ok({ events: { events: isTag ? [infoEvent] : [] } });
      }
      if (url.pathname.endsWith("/issues")) {
        const page = Number(url.searchParams.get("page"));
        return {
          body: { success: true, result: [{ id: `i${page}` }], result_info: { page, per_page: 100, count: 1, total_count: 2, total_pages: 2 } },
        };
      }
      return { body: { success: true, result: [], result_info: { per_page: 100, count: 0, cursors: { after: null } } } };
    });
    expect(r.code).toBe(EXIT.OK);
    const occPaths = r.calls.map((c) => c.url.pathname).filter((p) => p.endsWith("/occurrences"));
    expect(occPaths).toEqual([expect.stringContaining("/issues/i1/"), expect.stringContaining("/issues/i2/")]);
  });

  it("--issue는 그 Issue의 occurrence만 본다", async () => {
    const r = await exec(
      ["verify", "--tag", TAG, "--issue", "i9"],
      verifyRoute({ tagEvents: [infoEvent], occurrences: { i9: [] } })
    );
    expect(r.code).toBe(EXIT.OK);
    const paths = r.calls.map((c) => c.url.pathname);
    expect(paths.some((p) => p.endsWith("/issues"))).toBe(false);
    expect(paths.some((p) => p.endsWith("/issues/i9/occurrences"))).toBe(true);
  });

  it("--tag 형식이 틀리거나 7자 SHA면 fetch 없이 2", async () => {
    for (const tag of ["abc; rm", "abcdef0"]) {
      const r = await exec(["verify", "--tag", tag], verifyRoute({}));
      expect(r.code).toBe(EXIT.FAILED);
      expect(r.fetch).not.toHaveBeenCalled();
    }
    const short = await exec(["verify", "--tag", "abcdef0"], verifyRoute({}));
    expect(short.err.join("\n")).toContain("git rev-parse --short=12");
  });

  it("전체 SHA를 주면 12자로 잘라 질의한다", async () => {
    const r = await exec(["verify", "--tag", `${TAG}0123456789abcdef01234567`, "--skip-issues"], verifyRoute({ tagEvents: [infoEvent] }));
    expect(r.code).toBe(EXIT.OK);
    expect(queryFilters(r.calls[0])).toContainEqual(eq("versionTag", TAG));
  });
});

describe("collectOccurrences", () => {
  it("result_info.cursors.after로 다음 쪽을 넘기고 since보다 오래된 행에서 멈춘다", async () => {
    const pages: Record<string, unknown> = {
      first: {
        result: [{ id: "a", timestamp: NOW - 1000 }],
        result_info: { cursors: { after: "p2" } },
      },
      p2: {
        result: [{ id: "b", timestamp: NOW - 2000 }, { id: "c", timestamp: NOW - 10 * 3_600_000 }],
        result_info: { cursors: { after: "p3" } },
      },
    };
    const seen: (string | undefined)[] = [];
    const client = {
      occurrences: async (_id: string, q: { cursor?: string }) => {
        seen.push(q.cursor);
        return pages[q.cursor ?? "first"];
      },
    };
    const r = await collectOccurrences(client, "i1", NOW - 3_600_000);
    expect(seen).toEqual([undefined, "p2"]);
    expect(r.rows.map((o: { id: string }) => o.id)).toEqual(["a", "b"]);
    expect(r.truncated).toBe(false);
  });
});

describe("errors·events 기간·경로", () => {
  it("--until과 --path로 occurrence 시각 앞뒤의 같은 경로 로그를 찾는다", async () => {
    const r = await exec(
      ["errors", "--since", "2026-10-03T10:00:00Z", "--until", "2026-10-03T10:10:00Z", "--path", "/api/x"],
      () => ok({ events: { events: [] } })
    );
    expect(r.code).toBe(0);
    expect(r.calls[0].body).toMatchObject({
      timeframe: { from: Date.parse("2026-10-03T10:00:00Z"), to: Date.parse("2026-10-03T10:10:00Z") },
    });
    expect(queryFilters(r.calls[0])).toContainEqual(eq("path", "/api/x"));
    const bad = await exec(["errors", "--since", "1h", "--until", "2h"], () => ok({}));
    expect(bad.code).toBe(EXIT.FAILED);
  });
});
