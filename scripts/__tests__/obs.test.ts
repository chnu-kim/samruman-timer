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
  evaluateVerify,
  fetchVerifyBundle,
  createClient,
  buildPluginCode,
  slimEvent,
  slimOccurrence,
  InputError,
  VERIFY_INPUT_FORMAT,
  DEFAULT_ACCOUNT_ID,
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
    // 2026-10-03 대시보드 JSON에서 관찰한 필드 구조만 옮겼다. 모든 ID·태그·URL은 지어낸 값이다
    const real = {
      timestamp: "2026-10-03T01:28:07.881Z",
      message: "auth.oauth_state_invalid",
      event: "auth.oauth_state_invalid",
      versionTag: "aaaaaaaaaaaa",
      versionId: "11111111-1111-4111-8111-111111111111",
      reason: "missing_cookie",
      requestId: "00000000-0000-4000-8000-000000000000",
      level: "warn",
      $workers: {
        scriptName: SERVICE,
        scriptVersion: { id: "11111111-1111-4111-8111-111111111111" },
        event: { request: { method: "GET", url: "https://example.test/api/auth/callback", path: "/api/auth/callback" } },
      },
      $metadata: { id: "evt-synthetic", requestId: "runtime-synthetic", service: SERVICE, level: "warn", message: "auth.oauth_state_invalid" },
    };
    expect(normalizeEvent(real)).toEqual({
      timestamp: "2026-10-03T01:28:07.881Z",
      level: "warn",
      event: "auth.oauth_state_invalid",
      requestId: "00000000-0000-4000-8000-000000000000",
      versionTag: "aaaaaaaaaaaa",
      versionId: "11111111-1111-4111-8111-111111111111",
      reason: "missing_cookie",
    });
  });

  it.each([null, {}, "", "not json"])("source가 %j이면 최상위에 펼쳐진 앱 필드를 읽는다", (source) => {
    const e = normalizeEvent({
      source,
      timestamp: NOW,
      level: "error",
      event: "api.unhandled",
      versionTag: "bbbbbbbbbbbb",
      versionId: "22222222-2222-4222-8222-222222222222",
      kind: "schema_drift",
    });
    expect(e).toMatchObject({
      event: "api.unhandled",
      versionTag: "bbbbbbbbbbbb",
      versionId: "22222222-2222-4222-8222-222222222222",
      kind: "schema_drift",
    });
    expect(e).not.toHaveProperty("source");
  });

  it.each([{}, "plain text log"])("source가 %j여도 최상위 플랫폼 필드(dataset)는 앱 필드로 섞지 않는다", (source) => {
    const e = normalizeEvent({ dataset: "cloudflare-workers", timestamp: NOW, source, $metadata: { level: "info", message: "x" } });
    expect(e).not.toHaveProperty("dataset");
    expect(e).toMatchObject({ level: "info", event: "x" });
  });

  it("source가 있으면 최상위 플랫폼 필드(dataset 등)를 앱 필드로 섞지 않는다", () => {
    const e = normalizeEvent({
      dataset: "cloudflare-workers",
      timestamp: NOW,
      source: { level: "info", event: "a.b", reason: "x" },
    });
    expect(e).not.toHaveProperty("dataset");
    expect(e).toMatchObject({ event: "a.b", reason: "x" });
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

describe("verify --input (플러그인 조회 결과로 판정)", () => {
  // 테스트용 합성 계정 ID. 플러그인 sandbox가 주입하는 accountId를 흉내 낸다
  const ACCT = "0".repeat(32);
  const SINCE = "2026-09-30T12:00:00.000Z";
  const UNTIL = new Date(NOW).toISOString();
  const WINDOW = ["--since", SINCE, "--until", UNTIL];
  const INPUT_NOTE = "조회 결과 파일로 판정했다";

  /** 쪽 메타데이터(total_pages, cursors.after)까지 갖춘 응답을 주는 라우트. 플러그인 응답 모양({ success, status, result, result_info })과 같다 */
  function fullRoute(opts: {
    errors?: unknown[];
    tagEvents?: unknown[];
    issuePages?: unknown[][];
    occurrences?: Record<string, unknown[][]>;
  }): Route {
    return (url, init) => {
      if (url.pathname.endsWith("/telemetry/query")) {
        const body = JSON.parse(String(init.body));
        const isTag = body.parameters.filters.some((f: { key: string }) => f.key === "versionTag");
        return ok({ events: { events: isTag ? (opts.tagEvents ?? []) : (opts.errors ?? []) } });
      }
      if (url.pathname.endsWith("/issues")) {
        const pages = opts.issuePages ?? [[]];
        const page = Number(url.searchParams.get("page") ?? 1);
        const result = pages[page - 1] ?? [];
        return {
          body: {
            success: true,
            errors: [],
            messages: [],
            result,
            result_info: { page, per_page: 100, count: result.length, total_count: pages.flat().length, total_pages: pages.length },
          },
        };
      }
      const m = /\/issues\/([^/]+)\/occurrences$/.exec(url.pathname);
      if (m) {
        const pages = opts.occurrences?.[m[1]] ?? [[]];
        const cursor = url.searchParams.get("cursor");
        const idx = cursor ? Number(cursor.slice(1)) - 1 : 0;
        const result = pages[idx] ?? [];
        const after = idx + 1 < pages.length ? `p${idx + 2}` : null;
        return {
          body: { success: true, errors: [], messages: [], result, result_info: { per_page: 100, count: result.length, cursors: { after } } },
        };
      }
      return undefined;
    };
  }

  /** 플러그인 execute의 cloudflare.request를 라우트로 흉내 낸다 */
  function fakeCloudflare(route: Route) {
    const calls: { method: string; path: string; body: unknown }[] = [];
    const cloudflare = {
      request: async ({ method, path, query, body }: { method: string; path: string; query?: Record<string, unknown>; body?: unknown }) => {
        const url = new URL(`https://api.cloudflare.com/client/v4${path}`);
        for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
        calls.push({ method, path: url.pathname, body });
        const res = route(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
        if (!res) return { success: false, status: 404, result: null, errors: [{ code: 404, message: "no route" }], messages: [] };
        return { status: res.status ?? 200, ...(res.body as object) };
      },
    };
    return { cloudflare, calls };
  }

  /** 출력된 코드를 sandbox처럼 cloudflare·accountId만 보이는 함수로 돌린다(모듈 스코프 참조가 있으면 여기서 깨진다) */
  async function runPluginCode(code: string, route: Route) {
    const { cloudflare, calls } = fakeCloudflare(route);
    const fn = new Function("cloudflare", "accountId", `"use strict"; return (${code});`)(cloudflare, ACCT);
    const result = await fn();
    // execute 결과는 JSON으로 대화에 돌아오고 파일로 저장된다
    return { bundle: JSON.parse(JSON.stringify(result)), calls };
  }

  async function execOffline(argv: string[], files: Record<string, string> = {}, env: Record<string, string | undefined> = {}) {
    const out: string[] = [];
    const err: string[] = [];
    const fetch = vi.fn();
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
    return { code, out, err, fetch };
  }

  /** --print-plugin-code → 플러그인 실행 → --input 판정까지 한 번에 돈다 */
  async function viaPlugin(args: string[], route: Route) {
    const printed = await execOffline(["verify", ...args, "--print-plugin-code"]);
    expect(printed.code).toBe(EXIT.OK);
    const { bundle, calls } = await runPluginCode(printed.out.join("\n"), route);
    const judged = await execOffline(["verify", "--input", "bundle.json", ...args], { "bundle.json": JSON.stringify(bundle) });
    return { judged, bundle, calls, printed };
  }

  const withoutInputNote = (line: string) => {
    const r = JSON.parse(line);
    return { ...r, notes: r.notes.filter((n: string) => !n.startsWith(INPUT_NOTE)) };
  };

  const infoEvent = rawEvent({ level: "info", event: "auth.login.succeeded", versionTag: TAG });
  const occ = (over: Record<string, unknown>) => ({
    id: "o1",
    timestamp: "2026-10-03T11:30:00Z",
    worker: { scriptVersion: { id: "ver-1", tag: TAG } },
    invocation: { id: "inv", method: "GET", path: "/api/x", statusCode: 500 },
    error: { name: "Error", message: "boom", stack: "Error: boom\n    at a" },
    ...over,
  });
  const recentOld = (i: number) =>
    occ({ id: `o${i}`, timestamp: NOW - 60_000 * (i + 1), worker: { scriptVersion: { id: "ver-0", tag: "old" } } });

  const scenarios: { name: string; args: string[]; route: Route; code: number }[] = [
    {
      name: "clean(다른 태그 occurrence만)",
      args: [],
      route: fullRoute({ tagEvents: [infoEvent], issuePages: [[{ id: "i1" }]], occurrences: { i1: [[recentOld(0)]] } }),
      code: EXIT.OK,
    },
    { name: "태그 error로 재발", args: [], route: fullRoute({ errors: [errEvent()], tagEvents: [errEvent()] }), code: EXIT.RECURRED },
    {
      name: "태그 occurrence로 재발",
      args: [],
      route: fullRoute({ tagEvents: [infoEvent], issuePages: [[{ id: "i1" }]], occurrences: { i1: [[occ({})]] } }),
      code: EXIT.RECURRED,
    },
    {
      name: "버전 모르는 error는 unattributed",
      args: ["--skip-issues"],
      route: fullRoute({
        errors: [{ timestamp: Date.parse("2026-10-03T11:30:00Z"), source: { level: "error", event: "api.unhandled" } }],
        tagEvents: [infoEvent],
      }),
      code: EXIT.FAILED,
    },
    {
      name: "--event warn 재발",
      args: ["--event", "timer.modify.conflict_exhausted"],
      route: fullRoute({
        errors: [rawEvent({ level: "warn", event: "timer.modify.conflict_exhausted", versionTag: TAG })],
        tagEvents: [infoEvent],
      }),
      code: EXIT.RECURRED,
    },
    {
      name: "--expect-event 없음",
      args: ["--skip-issues", "--expect-event", "timer.modify.succeeded"],
      route: fullRoute({ tagEvents: [infoEvent] }),
      code: EXIT.FAILED,
    },
    { name: "태그 로그 0건", args: [], route: fullRoute({}), code: EXIT.FAILED },
    {
      name: "--issue 하나만",
      args: ["--issue", "i9"],
      route: fullRoute({ tagEvents: [infoEvent], occurrences: { i9: [[recentOld(0)]] } }),
      code: EXIT.OK,
    },
    {
      name: "versionId로 귀속",
      args: ["--skip-issues"],
      route: fullRoute({ errors: [errEvent({ versionTag: undefined, versionId: "ver-1" })], tagEvents: [infoEvent] }),
      code: EXIT.RECURRED,
    },
    {
      name: "Issue 목록 여러 쪽",
      args: [],
      route: fullRoute({ tagEvents: [infoEvent], issuePages: [[{ id: "i1" }], [{ id: "i2" }]], occurrences: { i2: [[occ({})]] } }),
      code: EXIT.RECURRED,
    },
    {
      name: "occurrence가 페이지 한도에서 잘림",
      args: ["--issue", "i1"],
      route: fullRoute({ tagEvents: [infoEvent], occurrences: { i1: Array.from({ length: 7 }, (_, i) => [recentOld(i)]) } }),
      code: EXIT.FAILED,
    },
    {
      name: "occurrence 여러 쪽을 넘겨 since에 닿음",
      args: ["--issue", "i1"],
      route: fullRoute({
        tagEvents: [infoEvent],
        occurrences: {
          i1: [[recentOld(0)], [occ({ id: "o2", timestamp: "2026-10-03T11:00:00Z" })], [occ({ id: "o3", timestamp: "2026-09-01T00:00:00Z" })]],
        },
      }),
      code: EXIT.RECURRED,
    },
    {
      name: "error 후보 2000건 잘림",
      args: ["--skip-issues"],
      route: fullRoute({
        errors: Array.from({ length: MAX_LIMIT }, () => errEvent({ versionTag: "000000000000", versionId: "ver-0" })),
        tagEvents: [infoEvent],
      }),
      code: EXIT.FAILED,
    },
  ];

  it.each(scenarios)("플러그인 경로와 토큰 경로가 같은 판정을 낸다: $name", async ({ args, route, code }) => {
    const network = await exec(["verify", "--tag", TAG, ...WINDOW, ...args], route);
    const { judged, calls } = await viaPlugin(["--tag", TAG, ...WINDOW, ...args], route);
    expect(network.code).toBe(code);
    expect(judged.code).toBe(code);
    expect(judged.fetch).not.toHaveBeenCalled();
    expect(withoutInputNote(judged.out[0])).toEqual(JSON.parse(network.out[0]));
    expect(judged.out.slice(1)).toEqual(network.out.slice(1));
    expect(judged.err[0]).toBe(network.err[0]);
    expect(JSON.parse(judged.out[0]).notes.some((n: string) => n.startsWith(INPUT_NOTE))).toBe(true);
    // 플러그인 코드는 조회용 엔드포인트만 부른다
    for (const c of calls) {
      expect(c.path.startsWith(`/client/v4/accounts/${ACCT}/workers/observability/`)).toBe(true);
      const readOnly =
        (c.method === "POST" && c.path.endsWith("/telemetry/query") && (c.body as { dry: boolean }).dry === true) ||
        (c.method === "GET" && (c.path.endsWith("/issues") || /\/issues\/[^/]+\/occurrences$/.test(c.path)));
      expect(readOnly).toBe(true);
    }
  });

  it("--json 판정 객체도 토큰 경로와 같다", async () => {
    const route = fullRoute({ errors: [errEvent()], tagEvents: [errEvent()], issuePages: [[]] });
    const network = await exec(["verify", "--tag", TAG, ...WINDOW, "--json"], route);
    const { judged } = await viaPlugin(["--tag", TAG, ...WINDOW, "--json"], route);
    expect(judged.code).toBe(EXIT.RECURRED);
    const a = JSON.parse(judged.out.join("\n"));
    a.notes = a.notes.filter((n: string) => !n.startsWith(INPUT_NOTE));
    expect(a).toEqual(JSON.parse(network.out.join("\n")));
  });

  it("evaluateVerify는 토큰 경로가 모은 묶음과 플러그인이 모은 묶음에 같은 판정을 낸다", async () => {
    const route = fullRoute({ tagEvents: [infoEvent], issuePages: [[{ id: "i1" }]], occurrences: { i1: [[occ({})]] } });
    const { fetch } = mockFetch(route);
    const client = createClient({ fetch: fetch as unknown as typeof globalThis.fetch, accountId: ACCT, token: TOKEN });
    const opts = { tag: TAG, from: Date.parse(SINCE), to: NOW };
    const fromNetwork = evaluateVerify(await fetchVerifyBundle(client, opts), opts, { strict: true });
    const { bundle } = await runPluginCode(buildPluginCode(opts), route);
    const fromPlugin = evaluateVerify(bundle, opts, { strict: true });
    expect(fromPlugin.report).toEqual(fromNetwork.report);
    expect(fromPlugin.result.verdict).toBe("recurred");
  });

  describe("파일 입력은 근거가 애매하면 2로 기운다", () => {
    const args = ["--tag", TAG, ...WINDOW];
    async function judge(bundle: unknown, extra: string[] = []) {
      return execOffline(["verify", "--input", "b.json", ...args, ...extra], { "b.json": JSON.stringify(bundle) });
    }
    async function pluginBundle(route: Route, extra: string[] = []) {
      return (await viaPlugin([...args, ...extra], route)).bundle;
    }

    it("occurrence 다음 쪽이 파일에 없으면 truncated(2). 이미 찾은 재발은 1", async () => {
      const route = fullRoute({ tagEvents: [infoEvent], occurrences: { i1: [[recentOld(0)], [recentOld(1)]] } });
      const bundle = await pluginBundle(route, ["--issue", "i1"]);
      bundle.occurrences.i1 = bundle.occurrences.i1.slice(0, 1);
      const r = await judge(bundle, ["--issue", "i1"]);
      expect(r.code).toBe(EXIT.FAILED);
      expect(JSON.parse(r.out[0])).toMatchObject({ reason: "truncated" });
      expect(JSON.parse(r.out[0]).truncated.join("\n")).toContain("i1");

      const withError = await pluginBundle(
        fullRoute({ errors: [errEvent()], tagEvents: [infoEvent], occurrences: { i1: [[recentOld(0)], [recentOld(1)]] } }),
        ["--issue", "i1"]
      );
      withError.occurrences.i1 = withError.occurrences.i1.slice(0, 1);
      expect((await judge(withError, ["--issue", "i1"])).code).toBe(EXIT.RECURRED);
    });

    it("Issue의 occurrence 기록이 통째로 없으면 truncated(2)", async () => {
      const bundle = await pluginBundle(fullRoute({ tagEvents: [infoEvent], issuePages: [[{ id: "i1" }]], occurrences: { i1: [[]] } }));
      delete bundle.occurrences.i1;
      const r = await judge(bundle);
      expect(r.code).toBe(EXIT.FAILED);
      expect(JSON.parse(r.out[0]).reason).toBe("truncated");
    });

    it("active Issue 목록 다음 쪽이 없거나, total_pages 없이 Issue가 있으면 truncated(2)", async () => {
      const two = await pluginBundle(fullRoute({ tagEvents: [infoEvent], issuePages: [[{ id: "i1" }], [{ id: "i2" }]] }));
      two.issuePages = two.issuePages.slice(0, 1);
      expect(JSON.parse((await judge(two)).out[0]).reason).toBe("truncated");

      const noMeta = await pluginBundle(fullRoute({ tagEvents: [infoEvent], issuePages: [[{ id: "i1" }]] }));
      delete noMeta.issuePages[0].response.result_info;
      const r = await judge(noMeta);
      expect(r.code).toBe(EXIT.FAILED);
      expect(JSON.parse(r.out[0]).reason).toBe("truncated");

      // Issue가 없는 쪽은 메타데이터 없이도 끝이다
      const empty = await pluginBundle(fullRoute({ tagEvents: [infoEvent], issuePages: [[]] }));
      delete empty.issuePages[0].response.result_info;
      expect((await judge(empty)).code).toBe(EXIT.OK);
    });

    it("occurrence 쪽에 cursor 정보(result_info.cursors)가 없으면 끝까지 봤는지 몰라 truncated(2)", async () => {
      const bundle = await pluginBundle(fullRoute({ tagEvents: [infoEvent], occurrences: { i1: [[recentOld(0)]] } }), ["--issue", "i1"]);
      delete bundle.occurrences.i1[0].response.result_info;
      const r = await judge(bundle, ["--issue", "i1"]);
      expect(r.code).toBe(EXIT.FAILED);
      expect(JSON.parse(r.out[0]).reason).toBe("truncated");
    });

    it("기록된 응답이 실패(403·success:false)면 2", async () => {
      const bundle = await pluginBundle(fullRoute({ tagEvents: [infoEvent], issuePages: [[]] }));
      bundle.issuePages[0].response = {
        success: false,
        status: 403,
        result: null,
        errors: [{ code: 10000, message: "Authentication error" }],
      };
      const r = await judge(bundle);
      expect(r.code).toBe(EXIT.FAILED);
      expect(r.out).toEqual([]);
      expect(r.err.join("\n")).toContain("실패한 응답");
    });

    it("기록된 쿼리가 verify가 보낼 쿼리와 다르면(limit·서비스 필터·기간·dry) 2, 키 순서는 상관없다", async () => {
      const base = await pluginBundle(fullRoute({ tagEvents: [infoEvent] }), ["--skip-issues"]);
      const mutate = [
        (b: Record<string, any>) => (b.candidateQuery.request.limit = 100),
        (b: Record<string, any>) => (b.tagQuery.request.parameters.filters = b.tagQuery.request.parameters.filters.slice(1)),
        (b: Record<string, any>) => (b.tagQuery.request.timeframe.from += 1),
        (b: Record<string, any>) => (b.tagQuery.request.dry = false),
      ];
      for (const m of mutate) {
        const b = JSON.parse(JSON.stringify(base));
        m(b);
        const r = await judge(b, ["--skip-issues"]);
        expect(r.code).toBe(EXIT.FAILED);
        expect(r.err.join("\n")).toContain("verify가 보낼 요청과 다르다");
      }
      // 다른 태그로 받은 파일
      const other = await execOffline(["verify", "--input", "b.json", "--tag", "111111111111", ...WINDOW, "--skip-issues"], {
        "b.json": JSON.stringify(base),
      });
      expect(other.code).toBe(EXIT.FAILED);
      const reordered = JSON.parse(JSON.stringify(base));
      const { queryId, ...rest } = reordered.tagQuery.request;
      reordered.tagQuery.request = { ...rest, queryId };
      expect((await judge(reordered, ["--skip-issues"])).code).toBe(EXIT.OK);
    });

    it("events 배열을 찾을 수 없는 응답이면 0건으로 보지 않고 2", async () => {
      const bundle = await pluginBundle(fullRoute({ tagEvents: [infoEvent] }), ["--skip-issues"]);
      bundle.candidateQuery.response.result = null;
      const r = await judge(bundle, ["--skip-issues"]);
      expect(r.code).toBe(EXIT.FAILED);
      expect(r.out).toEqual([]);
    });

    it.each([
      ["JSON이 아님", "{not json"],
      ["객체가 아님", "[]"],
      ["format 없음", JSON.stringify({ tagQuery: {}, candidateQuery: {} })],
      ["tagQuery 없음", JSON.stringify({ format: VERIFY_INPUT_FORMAT })],
    ])("입력 파일이 %s이면 2", async (_name, text) => {
      const r = await execOffline(["verify", "--input", "b.json", ...args], { "b.json": text });
      expect(r.code).toBe(EXIT.FAILED);
      expect(r.out).toEqual([]);
      expect(r.err.join("\n")).toContain("입력");
    });

    it("파일을 읽지 못하면 2", async () => {
      const r = await execOffline(["verify", "--input", "missing.json", ...args]);
      expect(r.code).toBe(EXIT.FAILED);
      expect(r.err.join("\n")).toContain("입력");
    });

    it("--input에서는 --since·--until을 ISO 시각으로 둘 다 받는다(상대 기간은 판정 시점마다 달라진다)", async () => {
      const bundle = await pluginBundle(fullRoute({ tagEvents: [infoEvent] }), ["--skip-issues"]);
      const files = { "b.json": JSON.stringify(bundle) };
      for (const w of [["--since", "3d", "--until", UNTIL], ["--since", SINCE], ["--until", UNTIL], []]) {
        const r = await execOffline(["verify", "--input", "b.json", "--tag", TAG, ...w, "--skip-issues"], files);
        expect(r.code).toBe(EXIT.FAILED);
        expect(r.err.join("\n")).toContain("ISO");
      }
    });
  });

  describe("--print-plugin-code", () => {
    it("토큰 없이 코드를 내고, 이어서 실행할 --input 명령을 ISO 기간으로 채워 안내한다", async () => {
      const r = await execOffline([
        "verify",
        "--tag",
        TAG,
        "--since",
        "1h",
        "--event",
        "auth.login.failed",
        "--expect-event",
        "auth.login.succeeded",
        "--print-plugin-code",
      ]);
      expect(r.code).toBe(EXIT.OK);
      expect(r.fetch).not.toHaveBeenCalled();
      expect(r.out.join("\n").startsWith("async () =>")).toBe(true);
      expect(r.err.join("\n")).toContain(
        `verify --input <파일> --tag ${TAG} --since ${new Date(NOW - 3_600_000).toISOString()} --until ${UNTIL} --event auth.login.failed --expect-event auth.login.succeeded`
      );
    });

    it("출력에 토큰·계정 ID를 넣지 않는다(sandbox의 accountId를 쓴다)", async () => {
      const acct = "1".repeat(32);
      const r = await execOffline(["verify", "--tag", TAG, "--print-plugin-code"], {}, { CF_OBS_TOKEN: TOKEN, CLOUDFLARE_ACCOUNT_ID: acct });
      const text = [...r.out, ...r.err].join("\n");
      expect(r.code).toBe(EXIT.OK);
      expect(text).not.toContain(TOKEN);
      expect(text).not.toContain(DEFAULT_ACCOUNT_ID);
      expect(text).not.toContain(acct);
      expect(text).toContain("accountId");
    });

    it("--json을 안내 명령에 옮긴다", async () => {
      const r = await execOffline(["verify", "--tag", TAG, ...WINDOW, "--json", "--print-plugin-code"]);
      expect(r.code).toBe(EXIT.OK);
      const guide = r.err.find((l) => l.includes("verify --input"));
      expect(guide).toMatch(/ --json(\s|$)/);
    });

    it("telemetry 응답에서 판정에 쓰는 이벤트 배열만 남긴다(run의 계정·사용자 ID, series·fields는 버린다)", async () => {
      const acct = "2".repeat(32);
      const user = "3".repeat(32);
      const base = fullRoute({ tagEvents: [infoEvent] });
      const route: Route = (url, init) => {
        if (!url.pathname.endsWith("/telemetry/query")) return base(url, init);
        const res = base(url, init) as { body: { result: { events: Record<string, unknown> } } };
        const result = res.body.result;
        return ok({
          run: { accountId: acct, workspaceId: acct, userId: user },
          events: { ...result.events, series: [{ time: 1, data: [] }], fields: [{ key: "event" }] },
        });
      };
      const network = await exec(["verify", "--tag", TAG, ...WINDOW, "--skip-issues"], route);
      const { judged, bundle } = await viaPlugin(["--tag", TAG, ...WINDOW, "--skip-issues"], route);
      const text = JSON.stringify(bundle);
      expect(text).not.toContain(acct);
      expect(text).not.toContain(user);
      expect(text).not.toContain("series");
      expect(text).not.toContain("fields");
      expect(judged.code).toBe(network.code);
      expect(withoutInputNote(judged.out[0])).toEqual(JSON.parse(network.out[0]));
    });

    it("--until이 미래면 --until을 짚어 2", async () => {
      const r = await execOffline(["verify", "--input", "b.json", "--tag", TAG, "--since", SINCE, "--until", "2099-01-01T00:00:00.000Z"]);
      expect(r.code).toBe(EXIT.FAILED);
      expect(r.err.join("\n")).toContain("--until이 미래다");
      expect(r.err.join("\n")).not.toContain("--since가 미래다");
    });

    it("--input과 함께 쓰면 2", async () => {
      const r = await execOffline(["verify", "--tag", TAG, ...WINDOW, "--input", "b.json", "--print-plugin-code"]);
      expect(r.code).toBe(EXIT.FAILED);
    });

    it("둘 다 없는 verify는 여전히 토큰이 없으면 fetch 없이 2", async () => {
      const r = await execOffline(["verify", "--tag", TAG]);
      expect(r.code).toBe(EXIT.FAILED);
      expect(r.fetch).not.toHaveBeenCalled();
      expect(r.err.join("\n")).toContain("CF_OBS_TOKEN");
    });
  });

  describe("slimEvent·slimOccurrence", () => {
    const events: [string, Record<string, unknown>][] = [
      ["source 객체", errEvent()],
      ["source JSON 문자열", { timestamp: NOW, source: JSON.stringify({ level: "error", event: "a.b", versionTag: TAG, stack: "s" }) }],
      [
        "최상위에 펼쳐진 앱 필드",
        {
          timestamp: "2026-10-03T01:28:07.881Z",
          event: "auth.oauth_state_invalid",
          level: "warn",
          versionTag: "aaaaaaaaaaaa",
          versionId: "11111111-1111-4111-8111-111111111111",
          reason: "missing_cookie",
          stack: "Error\n    at x",
          $workers: { scriptVersion: { id: "11111111-1111-4111-8111-111111111111" }, event: { request: { path: "/api/x" } } },
          $metadata: { id: "evt", requestId: "runtime", service: SERVICE, level: "warn", message: "auth.oauth_state_invalid" },
        },
      ],
      [
        "$metadata만 있는 런타임 예외",
        {
          timestamp: NOW,
          $metadata: { level: "error", message: "Uncaught TypeError", error: "boom", requestId: "r" },
          $workers: { scriptVersion: { id: "v", tag: "t1" }, requestId: "w" },
        },
      ],
      ["source에 stack만", { timestamp: NOW, source: { stack: "Error\n at a" }, level: "error", $metadata: { level: "error" } }],
    ];

    it.each(events)("slimEvent는 verify가 읽는 필드를 바꾸지 않는다: %s", (_name, raw) => {
      expect(normalizeEvent(slimEvent(raw))).toEqual(normalizeEvent(raw));
    });

    it("slimEvent는 stack 본문과 $workers.event 같은 큰 필드를 덜어 낸다", () => {
      const slim = slimEvent({
        ...errEvent(),
        $workers: { scriptVersion: { id: "v" }, event: { request: { url: "https://example.test/x?q=1" } } },
      });
      expect(JSON.stringify(slim)).not.toContain("at a");
      expect(JSON.stringify(slim)).not.toContain("example.test");
    });

    it.each([
      ["worker.scriptVersion", occ({})],
      [
        "최상위 scriptVersion",
        { id: "o", occurredAt: NOW, scriptVersion: { id: "v", tag: TAG }, invocation: { timestamp: NOW, rayId: "r", extra: "x" } },
      ],
      ["버전 없음", { id: "o", createdAt: "2026-10-03T00:00:00Z", worker: "weird", error: "plain" }],
    ])("slimOccurrence는 verify가 읽는 필드를 바꾸지 않는다: %s", (_name, raw) => {
      expect(normalizeOccurrence(slimOccurrence(raw))).toEqual(normalizeOccurrence(raw as Record<string, unknown>));
      expect(JSON.stringify(slimOccurrence(raw))).not.toContain("at a");
    });

    it("InputError는 Error다", () => {
      expect(new InputError("x")).toBeInstanceOf(Error);
    });
  });
});
