// Workers Observability(Workers Logs·Issues) 조회 CLI의 본체. 읽기 전용이고 외부 의존성이 없다(Node 18+ fetch).
// CLI 진입점은 scripts/obs.mjs, 사용법·절차는 docs/OBSERVABILITY.md.
//
// API 응답의 정확한 JSON 모양은 확인되지 않았다(2026-10 문서 조사 기준). 그래서 정규화 함수는 여러 위치를
// 차례로 찾아보는 방어적 파서로 두고, 원문이 필요하면 --json으로 그대로 본다.
// 쿼리·정규화·판정은 순수 함수로 분리해 테스트한다(scripts/__tests__/obs.test.ts).

import { readFileSync } from "node:fs";
import { normalizeVerifyTag } from "./version-tag.mjs";
import { classifyEvents, safeValue } from "./obs-rules.mjs";

export const SERVICE = "samrumantimer";
/**
 * 계정 ID는 비밀이 아니다. 대시보드 URL·API 경로에 그대로 드러나고, 토큰 없이는 아무것도 할 수 없다.
 * 공개 저장소에 두어도 되는 값으로 보고 기본값으로 둔다. 다른 계정이면 CLOUDFLARE_ACCOUNT_ID로 바꾼다.
 */
export const DEFAULT_ACCOUNT_ID = "fc7323801136ae087db0b88ab4d07b53";
export const API_BASE = "https://api.cloudflare.com/client/v4";
export const MAX_LIMIT = 2000;

/**
 * 앱 로그(JSON) 필드를 쿼리 필터에서 가리킬 때 붙이는 접두사.
 * 문서상 앱 JSON 필드는 이름 그대로(`level`, `event`) 인덱싱된다. 실제 API가 다른 경로(`source.level` 등)를
 * 요구하면 이 값만 고친다.
 */
export const APP_FIELD_PREFIX = "";
export const appKey = (name) => `${APP_FIELD_PREFIX}${name}`;

export const EXIT = { OK: 0, RECURRED: 1, FAILED: 2 };

// ───────────────────────── 인자·기간

const BOOLEAN_FLAGS = new Set(["json", "skip-issues", "help", "print-plugin-code"]);

/** `cmd pos --flag value --flag=value --bool` 형태를 나눈다 */
export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h") {
      flags.help = true;
    } else if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const name = eq === -1 ? a.slice(2) : a.slice(2, eq);
      if (eq !== -1) {
        flags[name] = a.slice(eq + 1);
      } else if (BOOLEAN_FLAGS.has(name)) {
        flags[name] = true;
      } else {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith("--")) {
          throw new UsageError(`--${name}에 값이 필요하다`);
        }
        flags[name] = next;
        i++;
      }
    } else {
      positional.push(a);
    }
  }
  return { command: positional[0], positional: positional.slice(1), flags };
}

const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** `90s`·`15m`·`1h`·`3d` → ms */
export function parseDuration(value) {
  const m = /^(\d+)\s*([smhd])$/.exec(String(value).trim());
  if (!m) throw new UsageError(`기간 형식이 아니다: ${value} (예: 15m, 1h, 3d)`);
  const ms = Number(m[1]) * UNIT_MS[m[2]];
  if (ms <= 0) throw new UsageError(`기간은 0보다 커야 한다: ${value}`);
  return ms;
}

/**
 * --since는 기간(`1h`) 또는 ISO 시각(`2026-10-03T00:00:00Z`, 배포 시각 등)을 받는다. 시작 시각(ms)을 돌려준다.
 * --until도 같은 형식이라 이 함수를 쓴다. flag는 오류 메시지에 쓸 옵션 이름이다
 */
export function parseSince(value, nowMs, flag = "--since") {
  const s = String(value).trim();
  if (/^\d+\s*[smhd]$/.test(s)) return nowMs - parseDuration(s);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const t = Date.parse(s);
    if (!Number.isNaN(t)) {
      if (t > nowMs) throw new UsageError(`${flag}${flag === "--until" ? "이" : "가"} 미래다: ${value}`);
      return t;
    }
  }
  throw new UsageError(`${flag} 형식이 아니다: ${value} (예: 1h, 3d, 2026-10-03T00:00:00Z)`);
}

export function parseLimit(value, fallback) {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new UsageError(`--limit은 1 이상의 정수다: ${value}`);
  return Math.min(n, MAX_LIMIT);
}

// ───────────────────────── 쿼리 바디

export function eq(name, value) {
  return { key: appKey(name), operation: "eq", type: "string", value: String(value) };
}

/**
 * telemetry/query 바디를 만든다. 서비스 필터는 항상 넣는다.
 * @param {{ from: number, to: number, filters?: object[], limit?: number, view?: string,
 *   calculations?: object[], groupBys?: object[] }} opts
 */
export function buildTelemetryQuery({ from, to, filters = [], limit = 100, view = "events", calculations, groupBys }) {
  /** @type {Record<string, unknown>} */
  const parameters = {
    datasets: ["cloudflare-workers"],
    filters: [{ key: "$metadata.service", operation: "eq", type: "string", value: SERVICE }, ...filters],
    filterCombination: "and",
  };
  if (calculations) parameters.calculations = calculations;
  if (groupBys) parameters.groupBys = groupBys;
  return {
    queryId: "adhoc",
    view,
    limit: Math.min(limit, MAX_LIMIT),
    dry: true,
    timeframe: { from, to },
    parameters,
  };
}

/** event×level 건수 집계 쿼리 */
export function buildSummaryQuery({ from, to }) {
  return buildTelemetryQuery({
    from,
    to,
    view: "calculations",
    limit: MAX_LIMIT,
    calculations: [{ operator: "count", alias: "count" }],
    groupBys: [
      { type: "string", value: appKey("event") },
      { type: "string", value: appKey("level") },
    ],
  });
}

// ───────────────────────── 응답 정규화

const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

/** CF 응답 봉투(`{ success, errors, result }`)를 벗긴다. 봉투가 없으면 그대로 */
export function unwrap(body) {
  if (isObj(body) && "result" in body) return body.result;
  return body;
}

/** 첫 번째로 배열인 경로의 값을 돌려준다. 없으면 undefined */
function findArray(root, paths) {
  for (const path of paths) {
    let v = root;
    for (const k of path) v = isObj(v) ? v[k] : undefined;
    if (Array.isArray(v)) return v;
  }
  return undefined;
}

/** 첫 번째로 배열인 경로의 값을 돌려준다. 없으면 빈 배열 */
function firstArray(root, paths) {
  return findArray(root, paths) ?? [];
}

const EVENT_PATHS = [["events", "events"], ["events"], ["data"], []];
const ISSUE_PATHS = [["issues"], ["items"], ["data"], []];
const OCCURRENCE_PATHS = [["occurrences"], ["items"], ["data"], []];

function parseSource(source) {
  if (isObj(source)) return source;
  if (typeof source === "string") {
    try {
      const parsed = JSON.parse(source);
      return isObj(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** 이벤트 최상위에 오는 플랫폼 필드. `$`로 시작하지 않아도 앱 필드가 아니다 */
const TOP_LEVEL_PLATFORM_KEYS = new Set(["source", "dataset"]);

/**
 * 앱 로그 필드. API가 JSON 로그를 `source`에 담아 주면 그것만 쓰고, 없거나 비어 있으면(null·`{}`·해석 불가 문자열)
 * 최상위에 펼쳐진 것으로 본다(2026-10 대시보드 JSON 실측: event·versionTag·reason 등이 최상위).
 * 최상위를 읽을 때는 `$`로 시작하는 키와 `dataset` 같은 플랫폼 필드를 뺀다
 */
function appFields(raw) {
  const fromSource = parseSource(raw.source);
  if (Object.keys(fromSource).length > 0) return fromSource;
  /** @type {Record<string, unknown>} */
  const top = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith("$") || TOP_LEVEL_PLATFORM_KEYS.has(k)) continue;
    top[k] = v;
  }
  return top;
}

function toIso(v) {
  if (typeof v === "number" && Number.isFinite(v)) {
    // 초 단위로 오는 경우도 받는다
    return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  }
  if (typeof v === "string" && v !== "") return v;
  return undefined;
}

const truncate = (v, n) => (typeof v === "string" && v.length > n ? `${v.slice(0, n)}…` : v);

/** 원문 이벤트 배열을 꺼낸다. events view의 응답 모양 후보를 모두 본다 */
export function extractEvents(body) {
  const r = unwrap(body);
  return firstArray(r, EVENT_PATHS).filter(isObj);
}

/**
 * 이벤트 하나를 앱 로그 필드 중심의 평평한 객체로 바꾼다.
 * 앱 필드는 source → 최상위(둘을 합친 appFields) → $metadata 순으로 찾는다. 버전은 앱 필드가 없으면 $workers.scriptVersion을 쓴다.
 * @param {{ withStack?: boolean }} opts stack은 길어서 request 조회에서만 앞부분을 남긴다
 */
export function normalizeEvent(raw, { withStack = false } = {}) {
  const src = appFields(raw);
  const meta = isObj(raw.$metadata) ? raw.$metadata : {};
  const workers = isObj(raw.$workers) ? raw.$workers : {};
  const scriptVersion = isObj(workers.scriptVersion) ? workers.scriptVersion : {};
  const pick = (k) => src[k] ?? raw[k] ?? meta[k];

  /** @type {Record<string, unknown>} */
  const out = {
    timestamp: toIso(src.timestamp) ?? toIso(raw.timestamp) ?? toIso(meta.timestamp),
    level: pick("level"),
    event: src.event ?? raw.event ?? meta.message,
    requestId: pick("requestId") ?? workers.requestId,
    versionTag: src.versionTag ?? scriptVersion.tag,
    versionId: src.versionId ?? scriptVersion.id,
  };
  // 나머지 앱 필드(kind, path, method, errorName, error, reason, stage, …)를 그대로 싣는다
  for (const [k, v] of Object.entries(src)) {
    if (k in out || k === "message" || k === "timestamp") continue;
    if (k === "stack") {
      if (withStack && typeof v === "string") out.stack = v.split("\n").slice(0, 6).join("\n");
      continue;
    }
    out[k] = truncate(v, 300);
  }
  // 앱 로그가 아닌 이벤트(예: 런타임 예외)는 $metadata.error로 보충한다
  if (out.error === undefined && meta.error !== undefined) out.error = truncate(String(meta.error), 300);
  for (const k of Object.keys(out)) if (out[k] === undefined || out[k] === "") delete out[k];
  return out;
}

/**
 * calculations view 응답을 [{ event, level, count }]로 바꾼다. 모양을 알아보지 못하면 null(호출자가 events로 대체)
 */
export function normalizeCalculations(body) {
  const r = unwrap(body);
  const calcs = firstArray(r, [["calculations"], []]);
  const rows = [];
  for (const calc of calcs) {
    if (!isObj(calc)) continue;
    const aggregates = firstArray(calc, [["aggregates"], ["series"]]);
    for (const agg of aggregates) {
      if (!isObj(agg)) continue;
      const groups = Array.isArray(agg.groups) ? agg.groups : [];
      const g = {};
      for (const item of groups) {
        if (isObj(item) && typeof item.key === "string") g[item.key.replace(APP_FIELD_PREFIX, "")] = item.value;
      }
      const count = Number(agg.count ?? agg.value);
      if (!Number.isFinite(count)) continue;
      rows.push({ event: g.event ?? "(없음)", level: g.level ?? "(없음)", count });
    }
  }
  return rows.length > 0 ? sortSummary(rows) : null;
}

/** 클라이언트 집계(calculations가 실패했을 때) */
export function summarizeEvents(events) {
  const map = new Map();
  for (const e of events) {
    const key = `${e.event ?? "(없음)"}\u0000${e.level ?? "(없음)"}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return sortSummary(
    [...map].map(([key, count]) => {
      const [event, level] = key.split("\u0000");
      return { event, level, count };
    })
  );
}

const LEVEL_ORDER = { error: 0, warn: 1, info: 2 };
function sortSummary(rows) {
  return rows.sort(
    (a, b) => (LEVEL_ORDER[a.level] ?? 3) - (LEVEL_ORDER[b.level] ?? 3) || b.count - a.count || a.event.localeCompare(b.event)
  );
}

/** Issue 상세 응답(`result.issue`)이나 목록 항목에서 Issue 객체를 꺼낸다 */
export function extractIssue(body) {
  const r = unwrap(body);
  return isObj(r) && isObj(r.issue) ? r.issue : r;
}

/** Issue 필드는 OpenAPI 기준 firstObserved·lastObserved·created·updated(epoch ms)다. 나머지는 방어적 후보 */
export function normalizeIssue(raw) {
  const err = isObj(raw.error) ? raw.error : {};
  const out = {
    id: raw.id ?? raw.issueId,
    status: raw.status,
    title: raw.title ?? raw.name ?? err.message ?? raw.message,
    errorName: err.name ?? raw.errorName,
    count: raw.count ?? raw.occurrenceCount ?? raw.occurrences ?? raw.eventCount,
    firstSeen: toIso(raw.firstObserved ?? raw.created ?? raw.firstSeen ?? raw.first_seen ?? raw.createdAt),
    lastSeen: toIso(raw.lastObserved ?? raw.updated ?? raw.lastSeen ?? raw.last_seen ?? raw.updatedAt),
  };
  if (typeof out.title === "string") out.title = truncate(out.title, 200);
  if (typeof out.count !== "number" && typeof out.count !== "string") delete out.count;
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

export function extractIssues(body) {
  const r = unwrap(body);
  return firstArray(r, ISSUE_PATHS).filter(isObj);
}

export function normalizeOccurrence(raw) {
  const worker = isObj(raw.worker) ? raw.worker : {};
  const sv = isObj(worker.scriptVersion) ? worker.scriptVersion : isObj(raw.scriptVersion) ? raw.scriptVersion : {};
  const inv = isObj(raw.invocation) ? raw.invocation : {};
  const err = isObj(raw.error) ? raw.error : {};
  const out = {
    id: raw.id,
    timestamp: toIso(raw.timestamp ?? raw.occurredAt ?? raw.createdAt ?? inv.timestamp),
    // OpenAPI 설명은 "Worker invocation request ID". 앱 로그의 requestId(미들웨어 UUID)와는 다른 값이다
    invocationId: inv.id,
    versionTag: sv.tag,
    versionId: sv.id,
    method: inv.method,
    path: inv.path,
    statusCode: inv.statusCode,
    rayId: inv.rayId,
    errorName: err.name,
    error: truncate(err.message, 300),
  };
  for (const k of Object.keys(out)) if (out[k] === undefined || out[k] === "") delete out[k];
  return out;
}

export function extractOccurrences(body) {
  const r = unwrap(body);
  return firstArray(r, OCCURRENCE_PATHS).filter(isObj);
}

/** 다음 페이지 cursor. 없으면 undefined. OpenAPI 기준 위치는 result_info.cursors.after(nullable) */
export function extractCursor(body) {
  const candidates = [
    body?.result_info?.cursors?.after,
    body?.result_info?.cursor,
    body?.result_info?.next_cursor,
    body?.result?.cursor,
    body?.result?.nextCursor,
    body?.cursor,
  ];
  return candidates.find((c) => typeof c === "string" && c !== "");
}

// ───────────────────────── verify 판정

/**
 * 로그·occurrence 한 건이 대상 버전에 속하는지 가른다.
 * - match: 태그가 대상과 같다. 또는 태그는 없지만 versionId가 대상 태그로 남은 로그의 versionId 중 하나다
 * - other: 다른 태그가 있거나, 대상과 무관한 versionId가 있다(이전 배포 등)
 * - unknown: 버전 정보가 전혀 없다
 * @param {{ versionTag?: unknown, versionId?: unknown }} item
 * @param {string} tag
 * @param {Set<string>} versionIds
 */
export function attributeVersion(item, tag, versionIds) {
  if (item.versionTag !== undefined) return item.versionTag === tag ? "match" : "other";
  if (item.versionId !== undefined) return versionIds.has(String(item.versionId)) ? "match" : "other";
  return "unknown";
}

/**
 * 배포 태그 이후 재발 여부를 판정한다. 조회가 애매하면 "재발 없음"이 아니라 "근거 부족"으로 기운다(fail closed).
 * - recurred(1): 대상 버전에 속한 error(또는 --event의 error·warn) 로그나 Issue occurrence가 하나라도 있다.
 *   잘린 조회에서도 찾은 재발은 확정이므로 다른 조건보다 먼저 본다
 * - insufficient(2): "재발 없음"을 말할 근거가 없다
 *   - truncated: 조회가 한도에서 잘렸다(error 2000건, occurrence 페이지 한도, Issue 목록 페이지 한도)
 *   - unattributed: 버전을 알 수 없는 error·occurrence가 있다(firstTagTs 이후. 그 전 것은 이전 배포로 본다)
 *   - expected_event_missing: --expect-event가 그 태그 로그에 한 건도 없다(수정한 경로가 실행됐다는 근거가 없다)
 *   - too_few_events: 태그로 남은 로그가 minEvents보다 적다
 * - clean(0): 위에 해당하지 않는다. "오류가 보이지 않았다"이지 "수정한 경로가 실행됐다"는 아니다
 *
 * @param {{ tag: string, errorEvents: object[], occurrences: object[], tagEventCount: number, minEvents?: number,
 *   versionIds?: Set<string>, firstTagTs?: number, truncated?: string[], expectEvent?: string, expectEventCount?: number }} input
 */
export function judgeVerify({
  tag,
  errorEvents,
  occurrences,
  tagEventCount,
  minEvents = 1,
  versionIds = new Set(),
  firstTagTs,
  truncated = [],
  expectEvent,
  expectEventCount = 0,
}) {
  const afterDeploy = (item) => {
    if (firstTagTs === undefined) return true;
    const t = Date.parse(String(item.timestamp ?? ""));
    return Number.isNaN(t) || t >= firstTagTs;
  };
  const errors = errorEvents.filter((e) => attributeVersion(e, tag, versionIds) === "match");
  const occ = occurrences.filter((o) => attributeVersion(o, tag, versionIds) === "match");
  const unattributedErrors = errorEvents.filter(
    (e) => attributeVersion(e, tag, versionIds) === "unknown" && afterDeploy(e)
  ).length;
  const unattributedOcc = occurrences.filter(
    (o) => attributeVersion(o, tag, versionIds) === "unknown" && afterDeploy(o)
  ).length;
  const unattributed = unattributedErrors + unattributedOcc;
  const base = { errors, occurrences: occ, tagEventCount, unattributed, unattributedErrors, unattributedOcc, truncated };
  if (errors.length > 0 || occ.length > 0) {
    return { verdict: "recurred", exitCode: EXIT.RECURRED, reason: "tag_errors", ...base };
  }
  if (truncated.length > 0) {
    return { verdict: "insufficient", exitCode: EXIT.FAILED, reason: "truncated", ...base };
  }
  if (unattributed > 0) {
    return { verdict: "insufficient", exitCode: EXIT.FAILED, reason: "unattributed", ...base };
  }
  if (expectEvent !== undefined && expectEventCount < 1) {
    return { verdict: "insufficient", exitCode: EXIT.FAILED, reason: "expected_event_missing", ...base };
  }
  if (tagEventCount < minEvents) {
    return { verdict: "insufficient", exitCode: EXIT.FAILED, reason: "too_few_events", ...base };
  }
  return { verdict: "clean", exitCode: EXIT.OK, reason: "no_errors", ...base };
}

// ───────────────────────── HTTP

export class UsageError extends Error {
  name = "UsageError";
}

export class ApiError extends Error {
  name = "ApiError";
  constructor(message, { status } = {}) {
    super(message);
    this.status = status;
  }
}

function permissionHint(status) {
  if (status === 401) {
    return "토큰이 유효하지 않다(401). CF_OBS_TOKEN 값과 만료 여부를 확인한다. docs/OBSERVABILITY.md \"1회성 설정\"";
  }
  return "토큰 권한이 부족하다(403). 계정·Worker 범위를 확인하고, Metadata Read-Only로 로그 쿼리(telemetry/query)가 막히면 API 레퍼런스가 요구하는 legacy 권한 \"Workers Observability\" Edit를 추가한다(Workers 역할 Editor는 배포·시크릿까지 열리므로 고르지 않는다). Issues만 막히면 verify에 --skip-issues. docs/OBSERVABILITY.md \"1회성 설정\"";
}

/** fetch를 감싸 CF 봉투의 실패와 401/403을 사람이 읽을 메시지로 바꾼다 */
export function createClient({ fetch, accountId, token }) {
  const base = `${API_BASE}/accounts/${accountId}/workers/observability`;

  async function request(method, path, { query, body } = {}) {
    const url = new URL(`${base}${path}`);
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
    let res;
    try {
      res = await fetch(url.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new ApiError(`네트워크 오류: ${err?.message ?? err} (${method} ${path})`);
    }
    const text = await res.text();
    let json;
    try {
      json = text === "" ? {} : JSON.parse(text);
    } catch {
      json = undefined;
    }
    if (res.status === 401 || res.status === 403) {
      throw new ApiError(`${method} ${path}: ${permissionHint(res.status)}`, { status: res.status });
    }
    const cfErrors = Array.isArray(json?.errors)
      ? json.errors.map((e) => `${e?.code ?? ""} ${e?.message ?? ""}`.trim()).filter(Boolean)
      : [];
    if (!res.ok || json === undefined || json.success === false) {
      const detail = cfErrors.length > 0 ? cfErrors.join("; ") : json === undefined ? "JSON이 아닌 응답" : "";
      throw new ApiError(`${method} ${path} 실패(HTTP ${res.status})${detail ? `: ${detail}` : ""}`, {
        status: res.status,
      });
    }
    return json;
  }

  return {
    query: (body) => request("POST", "/telemetry/query", { body }),
    issues: (query) => request("GET", "/issues", { query }),
    issue: (id) => request("GET", `/issues/${encodeURIComponent(id)}`),
    occurrences: (id, query) => request("GET", `/issues/${encodeURIComponent(id)}/occurrences`, { query }),
  };
}

// ───────────────────────── 명령

export const USAGE = `사용: node scripts/obs.mjs <명령> [옵션]

명령
  errors [--since 1h] [--until <ISO>] [--path /api/x]   level=error 이벤트
  events <event> [--since 1h] [--until <ISO>] [--level error] [--path /api/x]
  request <requestId> [--since 3d]  한 요청의 모든 앱 로그(응답 헤더 x-request-id 값)
  summary [--since 24h]             event×level 건수
  issues [--status active]          Issues 목록
  issue <id>                        Issue 상세와 최근 occurrence
  verify --tag <sha> [--since 3d] [--event <event>] [--issue <id>] [--expect-event <event>] [--min-events 1] [--skip-issues]
                                    배포 태그 이후 재발 판정. exit 0 = 재발 없음, 1 = 재발, 2 = 조회 실패·판정 근거 부족
  verify ... --print-plugin-code    토큰 없이: Cloudflare 플러그인 execute에 넘길 조회 코드와 이어서 실행할 명령을 낸다
  verify --input <file> --tag <sha> --since <ISO> --until <ISO> [같은 옵션]
                                    토큰 없이: 그 코드의 반환값(JSON 파일)으로 같은 규칙의 판정을 낸다. 입력 오류는 2
  triage [--since 24h] [--skip-issues]
                                    error·warn 로그와 active Issue를 카탈로그 규칙으로 가른다(abnormal·normal·unknown).
                                    exit 0 = 정상, 1 = 비정상 있음, 2 = 조회 실패·판정 근거 부족(잘림, 규칙 없는 항목)
  triage ... --print-plugin-code / triage --input <file> --since <ISO> --until <ISO>
                                    토큰 없이: verify와 같은 방식(플러그인 조회 코드 → 결과 파일로 판정)

공통 옵션
  --json      응답 원문(JSON)을 출력한다. verify·triage는 판정 결과 객체
  --limit N   최대 건수(기본 100, 최대 2000)
  --since     기간(15m, 1h, 3d) 또는 ISO 시각
  --until     끝 시각(기간 또는 ISO, 기본 지금). occurrence 시각 앞뒤로 앱 로그를 찾을 때 쓴다

환경변수
  CF_OBS_TOKEN           필수(verify·triage의 --print-plugin-code·--input 제외). 조회용 API 토큰 (docs/OBSERVABILITY.md "1회성 설정")
  CLOUDFLARE_ACCOUNT_ID  선택. 기본 ${DEFAULT_ACCOUNT_ID}`;

function jsonl(out, rows) {
  for (const row of rows) out(JSON.stringify(row));
}

async function cmdEvents(client, { from, to, limit, filters, json, withStack }, io) {
  const body = await client.query(buildTelemetryQuery({ from, to, limit, filters }));
  if (json) {
    io.out(JSON.stringify(body, null, 2));
    return EXIT.OK;
  }
  const events = extractEvents(body)
    .map((e) => normalizeEvent(e, { withStack }))
    .sort((a, b) => String(a.timestamp ?? "").localeCompare(String(b.timestamp ?? "")));
  jsonl(io.out, events);
  io.err(`# ${events.length}건 (${new Date(from).toISOString()} ~ ${new Date(to).toISOString()})`);
  return EXIT.OK;
}

async function cmdSummary(client, { from, to, json }, io) {
  let rows = null;
  let raw;
  try {
    raw = await client.query(buildSummaryQuery({ from, to }));
    rows = normalizeCalculations(raw);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) throw err;
    io.err(`# calculations 조회 실패, events로 대신 집계한다: ${err.message}`);
  }
  let source = "calculations";
  if (rows === null) {
    source = "events(클라이언트 집계, 최대 2000건)";
    raw = await client.query(buildTelemetryQuery({ from, to, limit: MAX_LIMIT }));
    rows = summarizeEvents(extractEvents(raw).map((e) => normalizeEvent(e)));
  }
  if (json) {
    io.out(JSON.stringify(raw, null, 2));
    return EXIT.OK;
  }
  for (const r of rows) io.out(`${String(r.count).padStart(6)}  ${r.level.padEnd(5)}  ${r.event}`);
  io.err(`# ${source}, ${new Date(from).toISOString()} ~ ${new Date(to).toISOString()}`);
  return EXIT.OK;
}

async function cmdIssues(client, { status, limit, json }, io) {
  const body = await client.issues({ service: SERVICE, status, perPage: Math.min(limit, 100) });
  if (json) {
    io.out(JSON.stringify(body, null, 2));
    return EXIT.OK;
  }
  const issues = extractIssues(body).map(normalizeIssue);
  jsonl(io.out, issues);
  io.err(`# ${issues.length}건 (status=${status ?? "전체"})`);
  return EXIT.OK;
}

async function cmdIssue(client, { id, limit, json }, io) {
  const [detail, occ] = await Promise.all([
    client.issue(id),
    client.occurrences(id, { per_page: Math.min(limit, 100) }),
  ]);
  if (json) {
    io.out(JSON.stringify({ issue: detail, occurrences: occ }, null, 2));
    return EXIT.OK;
  }
  const issue = extractIssue(detail);
  io.out(JSON.stringify({ issue: isObj(issue) ? normalizeIssue(issue) : issue }));
  const rows = extractOccurrences(occ).map(normalizeOccurrence);
  jsonl(io.out, rows.map((o) => ({ occurrence: o })));
  io.err(`# occurrence ${rows.length}건${extractCursor(occ) ? " (더 있음)" : ""}`);
  return EXIT.OK;
}

// ───────────────────────── verify: 조회와 판정
//
// verify는 두 단계다.
// 1) 조회(fetchVerifyBundle): 하위 조회(태그 로그, 재발 후보, active Issue 목록, Issue별 occurrence)를 보내고
//    요청과 응답 원문을 묶음(bundle)으로 모은다. 다음 쪽을 부를지는 아래 read*Page가 정한다
// 2) 판정(evaluateVerify, 순수 함수): 묶음 → 판정 결과. 기록된 요청이 verify가 보낼 요청과 같은지 확인하고,
//    같은 read*Page로 쪽을 다시 따라가 잘림을 판단한다. 조회가 직접 넘긴 묶음이든 파일로 받은 묶음이든 같은 규칙을 탄다

export const VERIFY_MAX_PAGES = 5;
export const VERIFY_INPUT_FORMAT = "obs-verify-input/1";

/** 묶음 내용이 판정에 쓸 수 없는 모양일 때(기록된 요청 불일치, 실패 응답, 필수 조회 누락) */
export class InputError extends Error {
  name = "InputError";
}

/** verify가 보내는 telemetry 쿼리 둘. 태그 로그(레벨 무관)와 재발 후보(태그 필터 없음) */
export function buildVerifyQueries({ tag, from, to, event }) {
  // 재발 후보는 태그 필터 없이 받아 클라이언트에서 버전을 가린다.
  // 서버 태그 필터를 걸면 versionTag가 빠진 로그(버전 조회 실패 등)가 조용히 사라지기 때문이다.
  // --event를 주면 레벨을 묻지 않는다(warn 이벤트도 대상). 단 info는 정상 흐름이라 재발로 세지 않는다
  const candidateFilters = event ? [eq("event", event)] : [eq("level", "error")];
  return {
    tagQuery: buildTelemetryQuery({ from, to, limit: MAX_LIMIT, filters: [eq("versionTag", tag)] }),
    candidateQuery: buildTelemetryQuery({ from, to, limit: MAX_LIMIT, filters: candidateFilters }),
  };
}

/**
 * Issues를 어떻게 볼지. skip은 보지 않음(note에 이유), ids는 지정한 Issue만, active는 active 목록 전체
 * @returns {{ mode: "skip", note: string } | { mode: "ids", ids: string[] } | { mode: "active" }}
 */
export function verifyIssueScope({ event, issueId, skipIssues }) {
  if (skipIssues) return { mode: "skip", note: "Issues는 --skip-issues로 건너뛰었다" };
  if (event && !issueId) {
    return {
      mode: "skip",
      note: "--event만 주어 Issues는 보지 않았다(Issue와 event를 대응시킬 수 없다). 필요하면 --issue <id>",
    };
  }
  if (issueId) return { mode: "ids", ids: [issueId] };
  return { mode: "active" };
}

/** active Issue 목록 한 쪽의 쿼리(쪽 번호는 1부터) */
export const issueListQuery = (page) => ({ service: SERVICE, status: "active", perPage: 100, page });
/** occurrence 한 쪽의 쿼리. 첫 쪽은 cursor가 없다 */
export const occurrenceQuery = (cursor) => (cursor === undefined ? { per_page: 100 } : { per_page: 100, cursor });

/**
 * active Issue 목록 한 쪽을 읽는다. next: 다음 쪽을 불러야 한다.
 * strict(파일 입력): Issue가 있는데 total_pages가 없으면 마지막 쪽인지 알 수 없다(unknown). 조회 경로는 기존대로 마지막 쪽으로 본다
 */
function readIssuePage(body, page, strict = false) {
  if (strict && findArray(unwrap(body), ISSUE_PATHS) === undefined) {
    throw new InputError(`active Issue 목록 ${page}쪽: 응답에서 Issue 배열을 찾지 못했다`);
  }
  const issues = extractIssues(body);
  const normalized = issues.map(normalizeIssue);
  const ids = normalized.map((i) => i.id).filter(Boolean);
  if (ids.length < issues.length) {
    throw new ApiError("Issue 목록에서 ID를 읽지 못했다(응답 모양이 예상과 다르다). --json으로 원문을 확인한다");
  }
  const totalPages = Number(body?.result_info?.total_pages);
  const next = Number.isFinite(totalPages) && page < totalPages && issues.length > 0;
  const unknown = strict && issues.length > 0 && !Number.isFinite(totalPages);
  return { ids, issues: normalized, next, unknown };
}

/**
 * occurrence 한 쪽을 읽는다. API는 최신순(OpenAPI 설명 "newest first")이라 since보다 오래된 행이 나오면 멈춘다.
 * next: cursor가 남았고 아직 since에 닿지 않았다.
 * strict(파일 입력): 행이 있고 since에 닿지 않았는데 result_info.cursors.after 자체가 없으면, 끝이라서 cursor가 없는지
 * 응답이 cursor를 빠뜨렸는지 알 수 없다(unknown)
 */
function readOccurrencePage(body, id, fromMs, strict = false) {
  if (strict && findArray(unwrap(body), OCCURRENCE_PATHS) === undefined) {
    throw new InputError(`Issue ${id} occurrence: 응답에서 occurrence 배열을 찾지 못했다`);
  }
  const rows = extractOccurrences(body).map((o) => ({ ...normalizeOccurrence(o), issueId: id }));
  const cursor = extractCursor(body);
  const times = rows.map((o) => Date.parse(o.timestamp ?? "")).filter((t) => !Number.isNaN(t));
  const reachedSince = times.length > 0 && Math.min(...times) < fromMs;
  const cursors = body?.result_info?.cursors;
  const cursorStated = cursor !== undefined || (isObj(cursors) && "after" in cursors);
  const unknown = strict && rows.length > 0 && !reachedSince && !cursorStated;
  return { rows, cursor, reachedSince, next: Boolean(cursor) && rows.length > 0 && !reachedSince, unknown };
}

/** 키 순서와 무관하게 JSON 값이 같은가(undefined 값은 없는 키로 본다) */
function sameJson(a, b) {
  const canon = (v) => {
    if (Array.isArray(v)) return v.map(canon);
    if (isObj(v)) {
      return Object.fromEntries(
        Object.keys(v)
          .filter((k) => v[k] !== undefined)
          .sort()
          .map((k) => [k, canon(v[k])])
      );
    }
    return v;
  };
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

/** URL 쿼리는 문자열로 나가므로 값을 문자열로 맞춰 비교한다(createClient처럼 undefined·""는 뺀다) */
function sameQuery(a, b) {
  const norm = (q) =>
    isObj(q)
      ? Object.fromEntries(
          Object.entries(q)
            .filter(([, v]) => v !== undefined && v !== "")
            .map(([k, v]) => [k, String(v)])
        )
      : q;
  return sameJson(norm(a), norm(b));
}

/** 기록 한 건({ request, response })을 확인하고 응답을 돌려준다 */
function recorded(entry, label, matches, command = "verify") {
  if (!isObj(entry) || !("response" in entry)) throw new InputError(`${label}: 기록이 없다({ request, response } 형식)`);
  if (!matches(entry.request)) {
    throw new InputError(`${label}: 기록된 요청이 ${command}가 보낼 요청과 다르다. --print-plugin-code가 낸 코드로 다시 조회한다`);
  }
  const body = entry.response;
  if (!isObj(body) || body.success === false) {
    const errors = isObj(body) && Array.isArray(body.errors) ? body.errors : [];
    const detail = errors.map((e) => `${e?.code ?? ""} ${e?.message ?? ""}`.trim()).filter(Boolean).join("; ");
    throw new InputError(`${label}: 조회가 실패한 응답이다${detail ? `(${detail})` : ""}`);
  }
  return body;
}

/**
 * 한 Issue의 occurrence 쪽들을 따라가 since 이후 행과 잘림 여부를 낸다.
 * 다음 쪽을 불러야 하는데 기록이 없으면(파일 입력) 잘린 것으로 본다. why는 잘린 이유
 */
function judgeOccurrencePages(id, pages, fromMs, maxPages, strict = false) {
  const label = `Issue ${id} occurrence`;
  const all = [];
  let cursor;
  let reachedSince = false;
  let why;
  for (let page = 0; page < maxPages; page++) {
    if (pages[page] === undefined) {
      why = `입력 파일에 Issue ${id}의 occurrence ${page + 1}쪽이 없다. --print-plugin-code가 낸 코드로 다시 조회한다`;
      break;
    }
    const expected = occurrenceQuery(cursor);
    const body = recorded(pages[page], `${label} ${page + 1}쪽`, (req) => sameQuery(req?.query, expected));
    const step = readOccurrencePage(body, id, fromMs, strict);
    all.push(...step.rows);
    cursor = step.cursor;
    reachedSince = step.reachedSince;
    if (step.unknown) {
      why = `Issue ${id}의 occurrence ${page + 1}쪽 응답에 cursor 정보(result_info.cursors)가 없어 끝까지 봤는지 알 수 없다`;
      break;
    }
    if (!step.next) break;
  }
  if (why === undefined && Boolean(cursor) && !reachedSince) {
    why = `Issue ${id}의 occurrence가 페이지 한도에서 잘렸다. --since를 좁힌다`;
  }
  const rows = all.filter((o) => {
    const t = Date.parse(o.timestamp ?? "");
    return Number.isNaN(t) || t >= fromMs;
  });
  return { rows, truncated: why !== undefined, why };
}

/**
 * active Issue 목록 쪽들을 따라가 ID·Issue(정규화)와 잘림 여부를 낸다.
 * command는 기록된 요청이 다를 때 오류 메시지에 쓰고, narrow는 잘렸을 때 좁히는 방법 안내다
 */
function judgeIssuePages(pages, maxPages, strict = false, { command = "verify", narrow = "--issue <id>로 좁힌다" } = {}) {
  const ids = [];
  const issues = [];
  for (let page = 1; page <= maxPages; page++) {
    if (pages[page - 1] === undefined) {
      return {
        ids,
        issues,
        truncated: true,
        why: `입력 파일에 active Issue 목록 ${page}쪽이 없다. --print-plugin-code가 낸 코드로 다시 조회한다`,
      };
    }
    const expected = issueListQuery(page);
    const body = recorded(pages[page - 1], `active Issue 목록 ${page}쪽`, (req) => sameQuery(req?.query, expected), command);
    const step = readIssuePage(body, page, strict);
    ids.push(...step.ids);
    issues.push(...step.issues);
    if (step.unknown) {
      return { ids, issues, truncated: true, why: `active Issue 목록 ${page}쪽 응답에 total_pages가 없어 다른 쪽이 있는지 알 수 없다` };
    }
    if (!step.next) return { ids, issues, truncated: false };
  }
  return { ids, issues, truncated: true, why: `active Issue 목록이 페이지 한도에서 잘렸다. ${narrow}` };
}

/**
 * 한 Issue의 occurrence를 since 이후만큼 모은다. maxPages를 다 썼는데 cursor가 남고 아직 since에 닿지 않았으면 truncated
 * @returns {Promise<{ rows: object[], truncated: boolean, pages: object[] }>}
 */
export async function collectOccurrences(client, id, fromMs, maxPages = VERIFY_MAX_PAGES) {
  const pages = [];
  let cursor;
  for (let page = 0; page < maxPages; page++) {
    const query = occurrenceQuery(cursor);
    const body = await client.occurrences(id, { per_page: 100, cursor });
    pages.push({ request: { query }, response: body });
    const step = readOccurrencePage(body, id, fromMs);
    cursor = step.cursor;
    if (!step.next) break;
  }
  return { ...judgeOccurrencePages(id, pages, fromMs, maxPages), pages };
}

/**
 * verify의 하위 조회를 보내고 요청·응답 원문을 묶는다. 판정은 하지 않는다
 * @returns {Promise<{ format: string, tagQuery: object, candidateQuery: object, issuePages?: object[],
 *   occurrences?: Record<string, object[]> }>}
 */
export async function fetchVerifyBundle(client, opts) {
  const { tagQuery, candidateQuery } = buildVerifyQueries(opts);
  /** @type {Record<string, unknown>} */
  const bundle = { format: VERIFY_INPUT_FORMAT };
  bundle.tagQuery = { request: tagQuery, response: await client.query(tagQuery) };
  bundle.candidateQuery = { request: candidateQuery, response: await client.query(candidateQuery) };

  const scope = verifyIssueScope(opts);
  if (scope.mode === "skip") return bundle;
  let ids = scope.mode === "ids" ? scope.ids : [];
  if (scope.mode === "active") {
    const pages = [];
    for (let page = 1; page <= VERIFY_MAX_PAGES; page++) {
      const query = issueListQuery(page);
      const body = await client.issues(query);
      pages.push({ request: { query }, response: body });
      const step = readIssuePage(body, page);
      ids.push(...step.ids);
      if (!step.next) break;
    }
    bundle.issuePages = pages;
  }
  const occurrences = {};
  for (const id of ids) occurrences[id] = (await collectOccurrences(client, id, opts.from)).pages;
  bundle.occurrences = occurrences;
  return bundle;
}

/**
 * 묶음으로 재발을 판정한다(순수 함수). 기록된 요청이 opts로 verify가 보낼 요청과 다르거나, 실패한 응답이 있으면
 * InputError(호출자가 exit 2). 판정 규칙은 judgeVerify
 *
 * strict는 파일 입력(--input)용이다. 조회 경로는 응답을 직접 받으니 기존 규칙 그대로 두고, 파일은 누가 어떻게 모았는지
 * 이 코드가 보지 못했으므로 근거가 애매한 곳을 더 좁게 본다(fail closed):
 * - 응답에서 이벤트·Issue·occurrence 배열을 찾지 못하면 0건으로 보지 않고 InputError
 * - Issue가 있는데 total_pages가 없거나, occurrence 쪽에 cursor 정보가 없으면 잘린 것(truncated)으로 본다
 * 다음 쪽을 불러야 하는데 기록이 없는 경우는 두 경로 모두 truncated다(조회 경로에서는 생기지 않는다)
 *
 * @param {Record<string, any>} bundle fetchVerifyBundle의 결과, 또는 같은 형식의 파일 내용
 * @param {{ tag: string, from: number, to: number, event?: string, issueId?: string, skipIssues?: boolean,
 *   minEvents?: number, expectEvent?: string }} opts
 * @param {{ strict?: boolean }} [mode]
 * @returns {{ result: ReturnType<typeof judgeVerify>, report: Record<string, unknown> }}
 */
export function evaluateVerify(bundle, opts, { strict = false } = {}) {
  const { tag, from, to, event, issueId, minEvents = 1, expectEvent } = opts;
  if (!isObj(bundle)) throw new InputError("verify 입력이 객체가 아니다");
  const eventsOf = (body, label) => {
    if (strict && findArray(unwrap(body), EVENT_PATHS) === undefined) {
      throw new InputError(`${label}: 응답에서 이벤트 배열을 찾지 못했다`);
    }
    return extractEvents(body);
  };
  const notes = [];
  const truncated = [];
  const { tagQuery, candidateQuery } = buildVerifyQueries(opts);

  // 1) 태그로 남은 로그(배포·트래픽 근거, 버전 ID 수집). 레벨 무관
  const tagBody = recorded(bundle.tagQuery, "태그 로그 조회(tagQuery)", (req) => sameJson(req, tagQuery));
  // 서버가 태그로 거른 결과다. 태그를 읽지 못한 이벤트도 세고, 다른 태그가 명시된 것만 뺀다
  const tagEvents = eventsOf(tagBody, "태그 로그 조회(tagQuery)")
    .map((e) => normalizeEvent(e))
    .filter((e) => e.versionTag === undefined || e.versionTag === tag);
  const tagEventCount = tagEvents.length;
  const versionIds = new Set(tagEvents.map((e) => e.versionId).filter((v) => v !== undefined).map(String));
  const tagTimes = tagEvents.map((e) => Date.parse(String(e.timestamp ?? ""))).filter((t) => !Number.isNaN(t));
  // 태그 로그가 한도에서 잘렸으면 가장 이른 로그를 못 봤을 수 있다. 그때는 배포 시점 경계를 쓰지 않는다(버전 모르는 항목을 모두 센다)
  const tagTruncated = tagEvents.length >= MAX_LIMIT;
  const firstTagTs = !tagTruncated && tagTimes.length > 0 ? Math.min(...tagTimes) : undefined;
  if (tagTruncated) {
    notes.push(`태그 로그가 ${MAX_LIMIT}건에서 잘려 배포 시점을 추정하지 않았다. 버전을 모르는 오류가 있으면 --since를 배포 시각으로 좁힌다`);
  }
  const expectEventCount = expectEvent ? tagEvents.filter((e) => e.event === expectEvent).length : 0;
  if (expectEvent && tagEventCount >= MAX_LIMIT && expectEventCount === 0) {
    notes.push(`태그 로그가 ${MAX_LIMIT}건에서 잘려 --expect-event를 다 보지 못했을 수 있다`);
  }

  // 2) 재발 후보
  const candidateBody = recorded(bundle.candidateQuery, "재발 후보 조회(candidateQuery)", (req) =>
    sameJson(req, candidateQuery)
  );
  const candidates = eventsOf(candidateBody, "재발 후보 조회(candidateQuery)");
  if (candidates.length >= MAX_LIMIT) truncated.push(`error 로그가 ${MAX_LIMIT}건에서 잘렸다. --since를 좁힌다`);
  const errorEvents = candidates.map((e) => normalizeEvent(e)).filter((e) => !event || e.level !== "info");

  // 3) Issue occurrence
  const occurrences = [];
  const scope = verifyIssueScope(opts);
  if (scope.mode === "skip") {
    notes.push(scope.note);
  } else {
    let ids = scope.mode === "ids" ? scope.ids : [];
    if (scope.mode === "active") {
      const listed = judgeIssuePages(Array.isArray(bundle.issuePages) ? bundle.issuePages : [], VERIFY_MAX_PAGES, strict);
      ids = listed.ids;
      if (listed.truncated) truncated.push(listed.why);
    }
    const byIssue = isObj(bundle.occurrences) ? bundle.occurrences : {};
    for (const id of ids) {
      const pages = Array.isArray(byIssue[id]) ? byIssue[id] : [];
      const r = judgeOccurrencePages(id, pages, from, VERIFY_MAX_PAGES, strict);
      occurrences.push(...r.rows);
      if (r.truncated) truncated.push(r.why);
    }
  }

  const result = judgeVerify({
    tag,
    errorEvents,
    occurrences,
    tagEventCount,
    minEvents,
    versionIds,
    firstTagTs,
    truncated,
    expectEvent,
    expectEventCount,
  });
  if (result.verdict === "clean" && !expectEvent) {
    notes.push(
      "clean은 이 기간에 대상 오류가 보이지 않았다는 뜻이다. 수정한 경로가 실제로 실행됐다는 근거는 아니다(--expect-event <성공 이벤트>로 함께 확인한다)"
    );
  }
  const report = {
    tag,
    verdict: result.verdict,
    exitCode: result.exitCode,
    window: { from: new Date(from).toISOString(), to: new Date(to).toISOString() },
    reason: result.reason,
    tagEventCount,
    errorCount: result.errors.length,
    occurrenceCount: result.occurrences.length,
    unattributedErrors: result.unattributedErrors,
    unattributedOccurrences: result.unattributedOcc,
    ...(event ? { event } : {}),
    ...(issueId ? { issueId } : {}),
    ...(expectEvent ? { expectEvent, expectEventCount } : {}),
    ...(truncated.length > 0 ? { truncated } : {}),
    notes,
  };
  return { result, report };
}

/** 판정 결과를 출력하고 exit code를 돌려준다 */
function printVerify({ result, report }, opts, io) {
  const { tag, event, minEvents = 1, expectEvent, json } = opts;
  const truncated = /** @type {string[]} */ (report.truncated ?? []);
  if (json) {
    io.out(JSON.stringify({ ...report, errors: result.errors, occurrences: result.occurrences }, null, 2));
    return result.exitCode;
  }
  io.out(JSON.stringify(report));
  jsonl(io.out, result.errors.map((e) => ({ error: e })));
  jsonl(io.out, result.occurrences.map((o) => ({ occurrence: o })));
  const insufficient = {
    truncated: `판정 근거 부족: 조회가 잘렸다(${truncated.join("; ")})`,
    unattributed: `판정 근거 부족: 버전을 알 수 없는 error ${result.unattributedErrors}건, occurrence ${result.unattributedOcc}건. --json으로 원문을 보고 issue·request 명령으로 확인한다`,
    expected_event_missing: `판정 근거 부족: 태그 ${tag} 로그에 ${expectEvent}가 없다. 수정한 경로가 아직 실행되지 않았다. 시간을 두고 다시 본다`,
    too_few_events: `판정 근거 부족: 태그 ${tag}로 남은 로그 ${result.tagEventCount}건 < --min-events ${minEvents}. 배포 여부는 npx wrangler deployments list로 확인하고, 배포됐는데 트래픽이 적다면 기다린다`,
  };
  const message = {
    recurred: `재발: 태그 ${tag}에서 ${event ? event : "error"} ${result.errors.length}건, occurrence ${result.occurrences.length}건. 출력된 항목이 고친 대상과 같은지 먼저 확인한다`,
    insufficient: insufficient[result.reason],
    clean: `재발 없음: 태그 ${tag} 로그 ${result.tagEventCount}건 중 대상 오류 없음`,
  }[result.verdict];
  io.err(`# ${message}`);
  for (const n of /** @type {string[]} */ (report.notes)) io.err(`# ${n}`);
  return result.exitCode;
}

async function cmdVerify(client, opts, io) {
  const bundle = await fetchVerifyBundle(client, opts);
  return printVerify(evaluateVerify(bundle, opts), opts, io);
}

// ───────────────────────── verify: 플러그인 조회 코드
//
// 토큰이 없을 때는 Cloudflare 플러그인의 execute 도구로 같은 하위 조회를 보내고, 받은 묶음을 verify --input으로 판정한다.
// 플러그인 쪽 코드는 손으로 쓰지 않고 buildPluginCode가 만든다. 쿼리 바디가 verify와 어긋나지 않게 하고, 플러그인이
// 부르는 엔드포인트를 조회용(POST telemetry/query, GET issues·occurrences)으로 고정하기 위해서다.
// 판정은 하지 않는다. 쪽을 언제 멈출지는 이 코드가 대략 따라 할 뿐이고, 맞게 다 받았는지는 evaluateVerify가 다시 본다
// (덜 받았으면 truncated, 더 받은 쪽은 무시).
//
// slimEvent·slimOccurrence는 execute 결과가 대화로 돌아오므로 크기를 줄인다(stack 본문, $workers.event 등).
// verify가 읽는 필드(normalizeEvent·normalizeOccurrence)는 그대로 남긴다. 플러그인 sandbox에 그대로 들어가야 해서
// 소스 문자열로 두고, 같은 문자열에서 함수를 만들어 테스트한다(바깥 스코프를 참조하면 sandbox에서 깨진다).

const SLIM_EVENT_SOURCE = `function slimEvent(raw) {
  const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
  const only = (v, keys) => {
    if (!isObj(v)) return v;
    const o = {};
    for (const k of keys) if (k in v) o[k] = v[k];
    return o;
  };
  if (!isObj(raw)) return raw;
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === "$metadata") out[k] = only(v, ["level", "message", "error", "timestamp", "requestId"]);
    else if (k === "$workers") out[k] = only(v, ["scriptVersion", "requestId"]);
    else if (k.startsWith("$")) continue;
    else if (k === "source" && isObj(v) && typeof v.stack === "string") out[k] = { ...v, stack: "" };
    else if (k === "stack" && typeof v === "string") out[k] = "";
    else out[k] = v;
  }
  return out;
}`;

const SLIM_OCCURRENCE_SOURCE = `function slimOccurrence(raw) {
  const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
  const only = (v, keys) => {
    if (!isObj(v)) return v;
    const o = {};
    for (const k of keys) if (k in v) o[k] = v[k];
    return o;
  };
  if (!isObj(raw)) return raw;
  const out = only(raw, ["id", "timestamp", "occurredAt", "createdAt", "scriptVersion"]);
  if ("worker" in raw) out.worker = only(raw.worker, ["scriptVersion"]);
  if ("invocation" in raw) out.invocation = only(raw.invocation, ["id", "timestamp", "method", "path", "statusCode", "rayId"]);
  if ("error" in raw) out.error = only(raw.error, ["name", "message"]);
  return out;
}`;

/**
 * verify·triage 조회 코드가 함께 쓰는 앞부분: 엔드포인트 기준 경로, slimEvent, 실패를 응답 모양으로 바꾸는 call,
 * telemetry 쿼리를 보내고 { request, response }로 기록하는 query. sandbox의 accountId·cloudflare만 참조한다
 */
const PLUGIN_PRELUDE = `  const base = "/accounts/" + accountId + "/workers/observability";
  const slimEvent = ${SLIM_EVENT_SOURCE.replace(/\n/g, "\n  ")};
  const call = async (method, path, extra) => {
    try {
      return await cloudflare.request({ method, path: base + path, ...extra });
    } catch (err) {
      return { success: false, result: null, errors: [{ code: 0, message: String((err && err.message) || err) }] };
    }
  };
  const query = async (body) => {
    const res = await call("POST", "/telemetry/query", { body });
    // 판정은 이벤트 배열만 읽는다. run(계정·사용자 ID)·series·fields 같은 나머지는 대화로 돌려보내지 않는다
    const r = res && res.result;
    if (r && r.events && Array.isArray(r.events.events)) res.result = { events: { events: r.events.events.map(slimEvent) } };
    else if (r && Array.isArray(r.events)) res.result = { events: r.events.map(slimEvent) };
    else if (r && typeof r === "object") delete r.run;
    return { request: body, response: res };
  };`;

/** 이벤트에서 verify가 읽지 않는 큰 필드를 덜어 낸다(플러그인 코드에 들어가는 것과 같은 소스) */
export const slimEvent = new Function(`return (${SLIM_EVENT_SOURCE});`)();
/** occurrence에서 verify가 읽지 않는 큰 필드를 덜어 낸다(플러그인 코드에 들어가는 것과 같은 소스) */
export const slimOccurrence = new Function(`return (${SLIM_OCCURRENCE_SOURCE});`)();

/**
 * execute 도구의 code로 그대로 넘길 async 함수 소스를 만든다. 계정 ID는 넣지 않고 sandbox의 accountId를 쓴다.
 * 반환값은 verify --input이 읽는 묶음(VERIFY_INPUT_FORMAT)이다
 * @param {{ tag: string, from: number, to: number, event?: string, issueId?: string, skipIssues?: boolean }} opts
 */
export function buildPluginCode(opts) {
  const { tagQuery, candidateQuery } = buildVerifyQueries(opts);
  const scope = verifyIssueScope(opts);
  const plan = {
    format: VERIFY_INPUT_FORMAT,
    tagQuery,
    candidateQuery,
    // null: Issues를 보지 않는다, "active": active 목록 전체, 배열: 그 Issue만
    issues: scope.mode === "skip" ? null : scope.mode === "ids" ? scope.ids : "active",
    issueListQuery: issueListQuery(1),
    occurrencePerPage: occurrenceQuery(undefined).per_page,
    fromMs: opts.from,
    maxPages: VERIFY_MAX_PAGES,
  };
  return `async () => {
  // node scripts/obs.mjs verify --print-plugin-code가 만든 조회 코드. 판정은 하지 않는다.
  // 부르는 엔드포인트는 조회용뿐이다: POST .../workers/observability/telemetry/query (dry: true),
  // GET .../workers/observability/issues, GET .../workers/observability/issues/{id}/occurrences
  const plan = ${JSON.stringify(plan, null, 2).replace(/\n/g, "\n  ")};
${PLUGIN_PRELUDE}
  const slimOccurrence = ${SLIM_OCCURRENCE_SOURCE.replace(/\n/g, "\n  ")};
  const tsOf = (o) => {
    const inv = (o && typeof o.invocation === "object" && o.invocation) || {};
    const v = o && (o.timestamp ?? o.occurredAt ?? o.createdAt ?? inv.timestamp);
    if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
    const t = typeof v === "string" ? Date.parse(v) : NaN;
    return Number.isNaN(t) ? undefined : t;
  };
  const out = { format: plan.format };
  out.tagQuery = await query(plan.tagQuery);
  out.candidateQuery = await query(plan.candidateQuery);
  if (plan.issues === null) return out;
  let ids = plan.issues;
  if (ids === "active") {
    ids = [];
    out.issuePages = [];
    for (let page = 1; page <= plan.maxPages; page++) {
      const q = { ...plan.issueListQuery, page };
      const res = await call("GET", "/issues", { query: q });
      out.issuePages.push({ request: { query: q }, response: res });
      const list = res && Array.isArray(res.result) ? res.result : [];
      for (const i of list) if (i && (i.id ?? i.issueId)) ids.push(i.id ?? i.issueId);
      const total = Number(res && res.result_info && res.result_info.total_pages);
      if (!res || res.success === false || list.length === 0 || !(page < total)) break;
    }
  }
  out.occurrences = {};
  for (const id of ids) {
    const pages = [];
    let cursor;
    for (let p = 0; p < plan.maxPages; p++) {
      const q = cursor === undefined ? { per_page: plan.occurrencePerPage } : { per_page: plan.occurrencePerPage, cursor };
      const res = await call("GET", "/issues/" + encodeURIComponent(id) + "/occurrences", { query: q });
      if (res && Array.isArray(res.result)) res.result = res.result.map(slimOccurrence);
      pages.push({ request: { query: q }, response: res });
      const rows = res && Array.isArray(res.result) ? res.result : [];
      const after = res && res.result_info && res.result_info.cursors && res.result_info.cursors.after;
      cursor = typeof after === "string" && after !== "" ? after : undefined;
      const reachedSince = rows.some((o) => {
        const t = tsOf(o);
        return t !== undefined && t < plan.fromMs;
      });
      if (!res || res.success === false || cursor === undefined || rows.length === 0 || reachedSince) break;
    }
    out.occurrences[id] = pages;
  }
  return out;
}`;
}

/** --print-plugin-code: 조회 코드(stdout)와 이어서 실행할 --input 명령(stderr) */
function printPluginCode(opts, io) {
  io.out(buildPluginCode(opts));
  const args = [
    "--tag",
    opts.tag,
    "--since",
    new Date(opts.from).toISOString(),
    "--until",
    new Date(opts.to).toISOString(),
    ...(opts.event ? ["--event", opts.event] : []),
    ...(opts.issueId ? ["--issue", opts.issueId] : []),
    ...(opts.skipIssues ? ["--skip-issues"] : []),
    ...(opts.expectEvent ? ["--expect-event", opts.expectEvent] : []),
    ...(opts.minEventsGiven ? ["--min-events", String(opts.minEvents)] : []),
    ...(opts.json ? ["--json"] : []),
  ];
  io.err("# 위 코드를 Cloudflare 플러그인 execute 도구의 code로 그대로 넘긴다(조회용 엔드포인트만 부른다)");
  io.err("# 반환된 JSON을 저장소 밖(scratchpad 등) 파일에 그대로 저장하고 판정한다:");
  io.err(`# node scripts/obs.mjs verify --input <파일> ${args.join(" ")}`);
  return EXIT.OK;
}

/** --input: 파일로 받은 묶음을 판정한다. 토큰·네트워크를 쓰지 않는다 */
function verifyFromInput(path, opts, readFile, io) {
  const evaluated = evaluateVerify(readBundleFile(path, VERIFY_INPUT_FORMAT, readFile), opts, { strict: true });
  /** @type {string[]} */ (evaluated.report.notes).push(INPUT_NOTE);
  return printVerify(evaluated, opts, io);
}

// ───────────────────────── triage: 지금 무엇이 비정상인가
//
// 인자 없는 조사의 시작점이다. error·warn 로그와 active Issue를 받아 obs-rules.mjs의 규칙표로 가른다.
// verify와 같은 구조다: 조회(fetchTriageBundle)가 요청·응답 원문을 묶고, 순수 함수(evaluateTriage)가 그 묶음만으로 판정한다.
// 토큰 경로와 --input(플러그인 조회 결과) 경로가 같은 판정 코드를 탄다.
// info 로그는 보지 않는다. info에 걸린 기준(auth.refresh.rejected 급증 등)과 비율 기준은 summary로 사람이 본다.

export const TRIAGE_INPUT_FORMAT = "obs-triage-input/1";
const TRIAGE_REFERENCE_WINDOW_MS = 86_400_000;

/** triage가 보내는 telemetry 쿼리 둘. filterCombination이 and라 level을 OR로 묶지 못해 따로 묻는다(각각 2000건 한도) */
export function buildTriageQueries({ from, to }) {
  return {
    errorQuery: buildTelemetryQuery({ from, to, limit: MAX_LIMIT, filters: [eq("level", "error")] }),
    warnQuery: buildTelemetryQuery({ from, to, limit: MAX_LIMIT, filters: [eq("level", "warn")] }),
  };
}

/**
 * triage의 하위 조회를 보내고 요청·응답 원문을 묶는다. 판정은 하지 않는다
 * @param {ReturnType<typeof createClient>} client
 * @param {{ from: number, to: number, skipIssues?: boolean }} opts
 */
export async function fetchTriageBundle(client, opts) {
  const { errorQuery, warnQuery } = buildTriageQueries(opts);
  /** @type {Record<string, unknown>} */
  const bundle = { format: TRIAGE_INPUT_FORMAT };
  bundle.errorQuery = { request: errorQuery, response: await client.query(errorQuery) };
  bundle.warnQuery = { request: warnQuery, response: await client.query(warnQuery) };
  if (opts.skipIssues) return bundle;
  const pages = [];
  for (let page = 1; page <= VERIFY_MAX_PAGES; page++) {
    const query = issueListQuery(page);
    const body = await client.issues(query);
    pages.push({ request: { query }, response: body });
    if (!readIssuePage(body, page).next) break;
  }
  bundle.issuePages = pages;
  return bundle;
}

/**
 * active Issue를 가른다. 기간 안에 마지막으로 보였거나(lastSeen ≥ from) 언제 보였는지 모르면 비정상,
 * 기간 전에 마지막으로 보였으면 정상(재발하지 않는 Issue, resolve 후보).
 * title은 오류 메시지라 외부 입력이 섞일 수 있어 내보내지 않는다. 내용은 issue <id>로 본다
 */
function classifyIssues(issues, fromMs) {
  const abnormal = [];
  const normal = [];
  for (const i of issues) {
    const lastMs = Date.parse(String(i.lastSeen ?? ""));
    const entry = {
      type: "issue",
      id: safeValue(i.id),
      ...(i.status !== undefined ? { status: safeValue(i.status) } : {}),
      ...(i.errorName !== undefined ? { errorName: safeValue(i.errorName) } : {}),
      ...(typeof i.count === "number" ? { count: i.count } : {}),
      ...(!Number.isNaN(lastMs) ? { lastSeen: new Date(lastMs).toISOString() } : {}),
    };
    if (Number.isNaN(lastMs)) abnormal.push({ ...entry, why: "lastSeen을 알 수 없다" });
    else if (lastMs >= fromMs) abnormal.push({ ...entry, why: "기간 안에 발생했다" });
    else normal.push({ ...entry, why: "기간 안에 발생하지 않았다(resolve 후보)" });
  }
  return { abnormal, normal };
}

const LEVEL_RANK = { error: 0, warn: 1 };
const byLevelThenCount = (a, b) =>
  (LEVEL_RANK[a.level] ?? 2) - (LEVEL_RANK[b.level] ?? 2) || b.count - a.count || a.event.localeCompare(b.event);

/**
 * 묶음으로 지금의 정상/비정상을 가른다(순수 함수). 기록된 요청이 opts로 triage가 보낼 요청과 다르거나 실패한 응답이 있으면
 * InputError(호출자가 exit 2). strict는 파일 입력(--input)용으로 evaluateVerify와 같은 뜻이다.
 * exit: 비정상이 하나라도 있으면 1(잘린 조회에서 찾은 것도 확정. 규칙이 모두 "건수 ≥ 임계"라 덜 세도 넘은 것은 넘은 것이다),
 * 아니면 조회가 잘렸거나(truncated) 규칙으로 판단할 수 없는 것(unknown)이 있으면 2, 그 밖에는 0
 * @param {Record<string, any>} bundle
 * @param {{ from: number, to: number, skipIssues?: boolean }} opts
 * @param {{ strict?: boolean }} [mode]
 */
export function evaluateTriage(bundle, opts, { strict = false } = {}) {
  const { from, to, skipIssues = false } = opts;
  if (!isObj(bundle)) throw new InputError("triage 입력이 객체가 아니다");
  const { errorQuery, warnQuery } = buildTriageQueries(opts);
  const notes = [];
  const truncated = [];

  const read = (entry, request, level) => {
    const label = `${level} 로그 조회(${level}Query)`;
    const body = recorded(entry, label, (req) => sameJson(req, request), "triage");
    if (strict && findArray(unwrap(body), EVENT_PATHS) === undefined) {
      throw new InputError(`${label}: 응답에서 이벤트 배열을 찾지 못했다`);
    }
    const raw = extractEvents(body);
    if (raw.length >= MAX_LIMIT) truncated.push(`${level} 로그가 ${MAX_LIMIT}건에서 잘렸다. --since를 좁힌다`);
    // 서버가 level로 거른 결과다. level을 읽지 못한 이벤트는 그 쿼리의 level로 본다
    return raw.map((e) => {
      const n = normalizeEvent(e);
      return n.level === undefined ? { ...n, level } : n;
    });
  };
  const errorEvents = read(bundle.errorQuery, errorQuery, "error");
  const warnEvents = read(bundle.warnQuery, warnQuery, "warn");
  const classified = classifyEvents([...errorEvents, ...warnEvents]);
  const abnormal = classified.abnormal.sort(byLevelThenCount);
  const normal = classified.normal.sort(byLevelThenCount);
  const unknown = classified.unknown.sort(byLevelThenCount);

  let activeIssues;
  if (skipIssues) {
    notes.push("Issues는 --skip-issues로 건너뛰었다. 런타임 예외(앱 로그 밖)는 이 판정에 들어가지 않았다");
  } else {
    const listed = judgeIssuePages(Array.isArray(bundle.issuePages) ? bundle.issuePages : [], VERIFY_MAX_PAGES, strict, {
      command: "triage",
      narrow: "issues 명령으로 목록을 본다",
    });
    if (listed.truncated) truncated.push(listed.why);
    activeIssues = listed.issues.length;
    const issues = classifyIssues(listed.issues, from);
    abnormal.push(...issues.abnormal);
    normal.push(...issues.normal);
  }

  if (to - from !== TRIAGE_REFERENCE_WINDOW_MS) {
    notes.push("규칙의 임계값은 24h 창 기준이다. 다른 기간에도 그대로 적용했다(긴 기간은 더 쉽게 비정상이 된다)");
  }
  notes.push("info 로그(auth.refresh.rejected 급증 등)와 비율 기준은 보지 않았다. 추세는 summary로 본다");

  let verdict = "normal";
  let exitCode = EXIT.OK;
  let reason;
  if (abnormal.length > 0) {
    verdict = "abnormal";
    exitCode = EXIT.RECURRED;
  } else if (truncated.length > 0) {
    verdict = "insufficient";
    exitCode = EXIT.FAILED;
    reason = "truncated";
  } else if (unknown.length > 0) {
    verdict = "insufficient";
    exitCode = EXIT.FAILED;
    reason = "unknown";
  }
  return {
    verdict,
    exitCode,
    ...(reason ? { reason } : {}),
    window: { from: new Date(from).toISOString(), to: new Date(to).toISOString() },
    counts: {
      errorEvents: errorEvents.length,
      warnEvents: warnEvents.length,
      ...(activeIssues !== undefined ? { activeIssues } : {}),
    },
    abnormal,
    normal,
    unknown,
    ...(truncated.length > 0 ? { truncated } : {}),
    notes,
  };
}

/** 판정 결과를 출력하고 exit code를 돌려준다. 기본 출력은 요약 한 줄 + 칸별 항목 JSON lines */
function printTriage(report, { json }, io) {
  if (json) {
    io.out(JSON.stringify(report, null, 2));
    return report.exitCode;
  }
  const { abnormal, normal, unknown, ...rest } = report;
  io.out(JSON.stringify({ ...rest, abnormal: abnormal.length, normal: normal.length, unknown: unknown.length }));
  jsonl(io.out, abnormal.map((x) => ({ abnormal: x })));
  jsonl(io.out, unknown.map((x) => ({ unknown: x })));
  jsonl(io.out, normal.map((x) => ({ normal: x })));
  const message = {
    abnormal: `비정상 ${abnormal.length}건. 항목마다 카탈로그(docs/OBSERVABILITY.md "이벤트별 판단과 조사")의 조사 명령으로 이어 간다`,
    insufficient:
      report.reason === "truncated"
        ? `판정 근거 부족: 조회가 잘렸다(${(report.truncated ?? []).join("; ")})`
        : `판정 근거 부족: 규칙으로 판단할 수 없는 항목 ${unknown.length}건. 카탈로그에 규칙을 추가하거나 사람이 판단한다`,
    normal: `정상: 비정상 기준에 걸린 것이 없다(정상 ${normal.length}건)`,
  }[report.verdict];
  io.err(`# ${message}`);
  for (const n of report.notes) io.err(`# ${n}`);
  return report.exitCode;
}

async function cmdTriage(client, opts, io) {
  return printTriage(evaluateTriage(await fetchTriageBundle(client, opts), opts), opts, io);
}

/**
 * triage용 execute 조회 코드. verify의 buildPluginCode와 같은 앞부분(PLUGIN_PRELUDE)을 쓴다.
 * 반환값은 triage --input이 읽는 묶음(TRIAGE_INPUT_FORMAT)이다
 * @param {{ from: number, to: number, skipIssues?: boolean }} opts
 */
export function buildTriagePluginCode(opts) {
  const { errorQuery, warnQuery } = buildTriageQueries(opts);
  const plan = {
    format: TRIAGE_INPUT_FORMAT,
    errorQuery,
    warnQuery,
    issues: !opts.skipIssues,
    issueListQuery: issueListQuery(1),
    maxPages: VERIFY_MAX_PAGES,
  };
  return `async () => {
  // node scripts/obs.mjs triage --print-plugin-code가 만든 조회 코드. 판정은 하지 않는다.
  // 부르는 엔드포인트는 조회용뿐이다: POST .../workers/observability/telemetry/query (dry: true),
  // GET .../workers/observability/issues
  const plan = ${JSON.stringify(plan, null, 2).replace(/\n/g, "\n  ")};
${PLUGIN_PRELUDE}
  const out = { format: plan.format };
  out.errorQuery = await query(plan.errorQuery);
  out.warnQuery = await query(plan.warnQuery);
  if (!plan.issues) return out;
  out.issuePages = [];
  for (let page = 1; page <= plan.maxPages; page++) {
    const q = { ...plan.issueListQuery, page };
    const res = await call("GET", "/issues", { query: q });
    out.issuePages.push({ request: { query: q }, response: res });
    const list = res && Array.isArray(res.result) ? res.result : [];
    const total = Number(res && res.result_info && res.result_info.total_pages);
    if (!res || res.success === false || list.length === 0 || !(page < total)) break;
  }
  return out;
}`;
}

function printTriagePluginCode(opts, io) {
  io.out(buildTriagePluginCode(opts));
  const args = [
    "--since",
    new Date(opts.from).toISOString(),
    "--until",
    new Date(opts.to).toISOString(),
    ...(opts.skipIssues ? ["--skip-issues"] : []),
    ...(opts.json ? ["--json"] : []),
  ];
  io.err("# 위 코드를 Cloudflare 플러그인 execute 도구의 code로 그대로 넘긴다(조회용 엔드포인트만 부른다)");
  io.err("# 반환된 JSON을 저장소 밖(scratchpad 등) 파일에 그대로 저장하고 판정한다:");
  io.err(`# node scripts/obs.mjs triage --input <파일> ${args.join(" ")}`);
  return EXIT.OK;
}

/** 입력 파일을 읽어 format까지 확인한 묶음을 돌려준다(verify·triage 공용) */
function readBundleFile(path, format, readFile) {
  let text;
  try {
    text = readFile(path);
  } catch (err) {
    throw new InputError(`입력 파일을 읽지 못했다: ${err?.message ?? err}`);
  }
  let bundle;
  try {
    bundle = JSON.parse(text);
  } catch {
    throw new InputError("입력 파일이 JSON이 아니다");
  }
  if (!isObj(bundle)) throw new InputError("입력 파일이 객체가 아니다");
  if (bundle.format !== format) {
    throw new InputError(`입력 파일의 format이 ${format}이 아니다. --print-plugin-code가 낸 코드의 반환값을 그대로 저장한다`);
  }
  return bundle;
}

const INPUT_NOTE =
  "조회 결과 파일로 판정했다(--input). 기록된 요청과 쪽 연결은 확인했지만, 파일이 실제 조회 결과 그대로인지는 확인하지 못한다";

function triageFromInput(path, opts, readFile, io) {
  const report = evaluateTriage(readBundleFile(path, TRIAGE_INPUT_FORMAT, readFile), opts, { strict: true });
  report.notes.push(INPUT_NOTE);
  return printTriage(report, opts, io);
}

/** --input에서는 기록된 요청과 대조할 기간이 판정할 때마다 바뀌면 안 되므로 --since·--until을 ISO로 받는다 */
function requireIsoWindow(flags, command) {
  for (const name of ["since", "until"]) {
    const v = flags[name];
    if (v === undefined || /^\d+\s*[smhd]$/.test(String(v).trim())) {
      throw new UsageError(`${command} --input: --${name}를 ISO 시각으로 준다(--print-plugin-code가 안내한 명령의 값 그대로)`);
    }
  }
}

/**
 * CLI 본체. process에 손대지 않고 exit code를 돌려준다(테스트에서 fetch·시계·출력을 주입).
 * @param {string[]} argv
 * @param {{ fetch: typeof fetch, env: Record<string, string|undefined>, now?: () => number,
 *   out: (line: string) => void, err: (line: string) => void, readFile?: (path: string) => string }} deps
 */
export async function run(argv, deps) {
  const token = deps.env.CF_OBS_TOKEN ?? "";
  // 어떤 경로로든 토큰이 출력에 섞이지 않게 마지막 단계에서 가린다
  const redact = (s) => (token ? String(s).split(token).join("[REDACTED]") : String(s));
  const io = { out: (s) => deps.out(redact(s)), err: (s) => deps.err(redact(s)) };
  const nowMs = (deps.now ?? Date.now)();

  try {
    const { command, positional, flags } = parseArgs(argv);
    if (flags.help || command === "help") {
      io.out(USAGE);
      return EXIT.OK;
    }
    if (!command) {
      io.err(USAGE);
      return EXIT.FAILED;
    }
    const known = ["errors", "events", "request", "summary", "issues", "issue", "verify", "triage"];
    if (!known.includes(command)) throw new UsageError(`알 수 없는 명령: ${command}`);

    // verify·triage의 --input·--print-plugin-code는 API를 부르지 않는다(토큰 없이 플러그인 조회 결과로 판정하는 경로)
    const offline =
      (command === "verify" || command === "triage") &&
      (flags.input !== undefined || flags["print-plugin-code"] === true);
    let client;
    if (!offline) {
      if (!token) {
        throw new UsageError(
          'CF_OBS_TOKEN이 없다. 조회용 토큰을 셸 환경변수로 둔다(docs/OBSERVABILITY.md "1회성 설정"). 토큰 없이 verify·triage를 하려면 --print-plugin-code·--input("Cloudflare 플러그인으로 조회")'
        );
      }
      const accountId = deps.env.CLOUDFLARE_ACCOUNT_ID || DEFAULT_ACCOUNT_ID;
      if (!/^[0-9a-f]{32}$/.test(accountId)) throw new UsageError(`CLOUDFLARE_ACCOUNT_ID 형식이 아니다`);
      client = createClient({ fetch: deps.fetch, accountId, token });
    }

    const json = flags.json === true;
    const limit = parseLimit(flags.limit, 100);
    const since = (fallback) => parseSince(flags.since ?? fallback, nowMs);
    const until = flags.until === undefined ? nowMs : parseSince(flags.until, nowMs, "--until");
    const window = (fallback) => {
      const from = since(fallback);
      if (from >= until) throw new UsageError("--since가 --until보다 늦다");
      return { from, to: until };
    };
    const pathFilter = flags.path === undefined ? [] : [eq("path", flags.path)];
    const need = (name) => {
      if (!positional[0]) throw new UsageError(`${command}: <${name}>가 필요하다`);
      return positional[0];
    };

    switch (command) {
      case "errors":
        return await cmdEvents(
          client,
          { ...window("1h"), limit, json, filters: [eq("level", "error"), ...pathFilter] },
          io
        );
      case "events": {
        const filters = [eq("event", need("event")), ...pathFilter];
        if (flags.level) filters.push(eq("level", flags.level));
        return await cmdEvents(client, { ...window("1h"), limit, json, filters }, io);
      }
      case "request":
        return await cmdEvents(
          client,
          { ...window("3d"), limit, json, withStack: true, filters: [eq("requestId", need("requestId"))] },
          io
        );
      case "summary":
        return await cmdSummary(client, { ...window("24h"), json }, io);
      case "issues":
        return await cmdIssues(client, { status: flags.status ?? "active", limit, json }, io);
      case "issue":
        return await cmdIssue(client, { id: need("id"), limit, json }, io);
      case "verify": {
        if (flags.tag === undefined) {
          throw new UsageError("verify: --tag <배포 태그>가 필요하다(git short SHA 12자, pnpm run deploy가 출력)");
        }
        const normalized = normalizeVerifyTag(flags.tag);
        if (!normalized.ok) throw new UsageError(`verify: ${normalized.reason}`);
        const tag = normalized.tag;
        const minEventsGiven = flags["min-events"] !== undefined;
        const minEvents = minEventsGiven ? Number(flags["min-events"]) : 1;
        if (!Number.isInteger(minEvents) || minEvents < 0) throw new UsageError("--min-events는 0 이상의 정수다");
        const inputPath = flags.input;
        const printCode = flags["print-plugin-code"] === true;
        if (inputPath !== undefined && printCode) {
          throw new UsageError("verify: --input과 --print-plugin-code는 함께 쓰지 않는다(먼저 코드를 받아 조회하고, 그 결과로 --input)");
        }
        // 파일의 기록된 요청을 이 기간으로 만든 요청과 대조한다. 상대 기간은 판정할 때마다 달라지므로 받지 않는다
        if (inputPath !== undefined) requireIsoWindow(flags, "verify");
        const verifyOpts = {
          tag,
          // 보관 기간(현재 3일)만큼 본다. 태그로 가리므로 이전 버전의 오류는 섞이지 않는다
          ...window("3d"),
          event: flags.event,
          issueId: flags.issue,
          skipIssues: flags["skip-issues"] === true,
          minEvents,
          minEventsGiven,
          expectEvent: flags["expect-event"],
          json,
        };
        if (printCode) return printPluginCode(verifyOpts, io);
        if (inputPath !== undefined) {
          const readFile = deps.readFile ?? ((path) => readFileSync(path, "utf8"));
          return verifyFromInput(inputPath, verifyOpts, readFile, io);
        }
        return await cmdVerify(client, verifyOpts, io);
      }
      case "triage": {
        const inputPath = flags.input;
        const printCode = flags["print-plugin-code"] === true;
        if (inputPath !== undefined && printCode) {
          throw new UsageError("triage: --input과 --print-plugin-code는 함께 쓰지 않는다(먼저 코드를 받아 조회하고, 그 결과로 --input)");
        }
        if (inputPath !== undefined) requireIsoWindow(flags, "triage");
        const triageOpts = { ...window("24h"), skipIssues: flags["skip-issues"] === true, json };
        if (printCode) return printTriagePluginCode(triageOpts, io);
        if (inputPath !== undefined) {
          const readFile = deps.readFile ?? ((path) => readFileSync(path, "utf8"));
          return triageFromInput(inputPath, triageOpts, readFile, io);
        }
        return await cmdTriage(client, triageOpts, io);
      }
    }
    return EXIT.FAILED;
  } catch (err) {
    if (err instanceof UsageError) {
      io.err(`오류: ${err.message}`);
      io.err('도움말: node scripts/obs.mjs help');
    } else if (err instanceof InputError) {
      io.err(`입력 오류: ${err.message}`);
    } else if (err instanceof ApiError) {
      io.err(`조회 실패: ${err.message}`);
    } else {
      io.err(`조회 실패: ${err?.message ?? err}`);
    }
    return EXIT.FAILED;
  }
}
