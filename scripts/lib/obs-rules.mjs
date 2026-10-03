// triage가 쓰는 이벤트별 정상/비정상 규칙표와 분류 함수. 순수 함수만 둔다(조회·출력은 obs.mjs).
// 규칙은 docs/OBSERVABILITY.md "이벤트별 판단과 조사"의 정상/비정상 문장을 수치로 옮긴 것이다. 한쪽을 고치면 다른 쪽도 고친다.
// 규칙표의 이벤트가 카탈로그 표에 있는지는 scripts/__tests__/obs-rules.test.ts가 검사한다.
//
// 규칙의 모양
// - 조건은 모두 "건수 ≥ min이면 비정상"이다(단조). 조회가 한도에서 잘려 덜 센 경우에도 이미 넘은 임계는 그대로 넘은 것이라
//   잘린 결과에서 찾은 비정상은 확정이다. 비율("모든 로그인이 …")이나 info 이벤트가 필요한 기준은 규칙으로 두지 않는다
// - where: { 필드: [값...] } 그 값인 이벤트만 센다. perKey: 필드 값별로 세어 가장 큰 건수를 본다(같은 userId 반복 등)
// - known: { 필드: [값...] } 그 밖의 값(없음 포함)이 나오면 규칙이 예상하지 못한 것이다. error면 비정상, warn이면 unknown
// - 수치는 기본 창 24h 기준이다. --since를 다르게 줘도 늘리거나 줄이지 않는다(긴 창은 더 쉽게 비정상이 된다)

/**
 * @typedef {{ id: string, min: number, where?: Record<string, string[]>, perKey?: string }} Condition
 * @typedef {{ event: string, levels: string[], conditions: Condition[], known?: Record<string, string[]>,
 *   severity?: string }} Rule
 */

/** @type {Rule[]} */
export const TRIAGE_RULES = [
  { event: "api.unhandled", levels: ["error"], conditions: [{ id: "any", min: 1 }] },
  { event: "env.invalid", levels: ["error"], conditions: [{ id: "any", min: 1 }] },
  // 보이는 동안은 비정상이지만 긴급하지 않다(Secret 교체는 모든 세션을 끊으므로 사람이 시점을 정한다). triage는 debt 칸에 싣고 exit code에 넣지 않는다
  { event: "env.weak_jwt_secret", levels: ["warn"], severity: "debt", conditions: [{ id: "any", min: 1 }] },
  { event: "auth.refresh.failed", levels: ["error"], conditions: [{ id: "any", min: 1 }] },
  {
    event: "auth.refresh.reuse_detected",
    levels: ["warn"],
    conditions: [
      { id: "total", min: 3 },
      { id: "same_user", perKey: "userId", min: 2 },
    ],
  },
  {
    event: "auth.oauth_state_invalid",
    levels: ["warn"],
    known: { reason: ["missing_state", "missing_cookie", "mismatch"] },
    conditions: [
      { id: "forgery_suspected", where: { reason: ["mismatch", "missing_state"] }, min: 2 },
      { id: "missing_cookie_many", where: { reason: ["missing_cookie"] }, min: 3 },
    ],
  },
  {
    event: "auth.login.failed",
    levels: ["error"],
    known: { stage: ["token", "user", "db"] },
    conditions: [
      { id: "stage_db", where: { stage: ["db"] }, min: 1 },
      { id: "schema_drift", where: { kind: ["schema_drift"] }, min: 1 },
      { id: "chzzk_repeated", where: { stage: ["token", "user"] }, min: 2 },
    ],
  },
  { event: "auth.logout.revoke_failed", levels: ["error"], conditions: [{ id: "any", min: 1 }] },
  {
    event: "timer.modify.conflict_exhausted",
    levels: ["warn"],
    conditions: [
      { id: "total", min: 3 },
      { id: "same_timer", perKey: "timerId", min: 2 },
    ],
  },
  { event: "timer.create.unique_race", levels: ["warn"], conditions: [{ id: "total", min: 3 }] },
];

const RULES_BY_EVENT = new Map(TRIAGE_RULES.map((r) => [r.event, r]));

/** 앱 이벤트 이름이 아닌 값(런타임 예외의 $metadata.message 등)을 묶는 이름. 원문은 오류 메시지라 내보내지 않는다 */
export const NON_APP_EVENT = "(앱 이벤트 아님)";
const EVENT_NAME = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;

/** 분포에 싣는 값. 우리 코드가 정하는 열거값만 그대로 두고, 그 밖의 모양은 가린다(외부 입력이 섞일 수 있다) */
const TOKEN = /^[A-Za-z0-9_.:-]{1,64}$/;
export const safeValue = (v) => (v === undefined || v === null || v === "" ? "(없음)" : TOKEN.test(String(v)) ? String(v) : "[?]");

const ID_SEGMENT = [/^[0-9a-f]{32}$/i, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, /^\d+$/];
const SAFE_SEGMENT = /^[A-Za-z0-9._-]{1,40}$/;
const MAX_SEGMENTS = 6;

/**
 * 경로를 라우트 패턴으로 바꾼다. ID 모양 세그먼트는 `[id]`, 그 밖에 이상한 세그먼트는 `[?]`.
 * path는 외부 사용자가 정할 수 있어(임의 경로로 /api/... 호출) 원문을 내보내지 않는다
 */
export function routePattern(path) {
  if (typeof path !== "string" || path === "") return undefined;
  const pathname = path.split(/[?#]/)[0];
  const segments = pathname.split("/").filter((s) => s !== "");
  const mapped = segments.slice(0, MAX_SEGMENTS).map((s) => {
    if (ID_SEGMENT.some((re) => re.test(s))) return "[id]";
    return SAFE_SEGMENT.test(s) ? s : "[?]";
  });
  if (segments.length > MAX_SEGMENTS) mapped.push("…");
  return `/${mapped.join("/")}`;
}

/** 분포 필드. 우리 코드의 열거값이라 건수와 함께 내보낸다 */
const BREAKDOWN_FIELDS = ["reason", "stage", "kind", "errorName"];
const MAX_DISTINCT = 10;

function tally(values) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  const entries = Object.entries(out).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (entries.length <= MAX_DISTINCT) return Object.fromEntries(entries);
  const kept = entries.slice(0, MAX_DISTINCT);
  const rest = entries.slice(MAX_DISTINCT).reduce((n, [, c]) => n + c, 0);
  return Object.fromEntries([...kept, ["(기타)", rest]]);
}

const matches = (e, where) => Object.entries(where ?? {}).every(([k, vs]) => vs.includes(String(e[k])));

function countCondition(events, cond) {
  const hit = events.filter((e) => matches(e, cond.where));
  if (!cond.perKey) return hit.length;
  const byKey = new Map();
  for (const e of hit) {
    const key = e[cond.perKey];
    if (key === undefined || key === null || key === "") continue;
    byKey.set(String(key), (byKey.get(String(key)) ?? 0) + 1);
  }
  return Math.max(0, ...byKey.values());
}

/** 묶음 하나의 공통 내용. ID·오류 원문·경로 원문은 싣지 않는다 */
function describeGroup(event, level, events) {
  /** @type {Record<string, Record<string, number>>} */
  const breakdown = {};
  for (const f of BREAKDOWN_FIELDS) {
    if (events.some((e) => e[f] !== undefined)) breakdown[f] = tally(events.map((e) => safeValue(e[f])));
  }
  const tags = events.map((e) => e.versionTag).filter((v) => v !== undefined);
  const routes = events.map((e) => routePattern(e.path)).filter((v) => v !== undefined);
  return {
    type: "event",
    event,
    level,
    count: events.length,
    breakdown,
    versionTags: tally(tags.map(safeValue)),
    ...(routes.length > 0 ? { routes: tally(routes) } : {}),
  };
}

/**
 * 정규화된 이벤트(normalizeEvent, level이 채워진 것)를 event×level로 묶어 규칙으로 가른다.
 * - abnormal: 규칙의 조건 하나라도 임계 이상, 규칙에 없는 error, 규칙이 예상하지 못한 값의 error
 * - unknown: 규칙에 없는 warn(또는 level), 규칙이 예상하지 못한 값의 warn
 * - normal: 규칙이 있고 모든 조건이 임계 미만
 * @param {Record<string, unknown>[]} events
 */
export function classifyEvents(events) {
  const groups = new Map();
  for (const e of events) {
    const name = typeof e.event === "string" && EVENT_NAME.test(e.event) ? e.event : NON_APP_EVENT;
    const level = typeof e.level === "string" ? e.level : "(없음)";
    const key = `${name}\u0000${level}`;
    if (!groups.has(key)) groups.set(key, { event: name, level, events: [] });
    groups.get(key).events.push(e);
  }
  const abnormal = [];
  const normal = [];
  const unknown = [];
  for (const { event, level, events: list } of groups.values()) {
    const base = describeGroup(event, level, list);
    const rule = RULES_BY_EVENT.get(event);
    if (!rule || !rule.levels.includes(level)) {
      const why = rule ? `규칙에 없는 level(${rule.levels.join("·")}만 규칙이 있다)` : "카탈로그 규칙이 없는 이벤트";
      if (level === "error") abnormal.push({ ...base, rule: false, why });
      else unknown.push({ ...base, rule: false, why });
      continue;
    }
    const checks = rule.conditions.map((c) => {
      const count = countCondition(list, c);
      return { id: c.id, min: c.min, count, exceeded: count >= c.min };
    });
    const unexpected = [];
    for (const [field, values] of Object.entries(rule.known ?? {})) {
      const n = list.filter((e) => !values.includes(String(e[field]))).length;
      if (n > 0) unexpected.push({ field, count: n });
    }
    if (level === "error") {
      for (const u of unexpected) checks.push({ id: `unexpected_${u.field}`, min: 1, count: u.count, exceeded: true });
    }
    const entry = { ...base, rule: true, ...(rule.severity ? { severity: rule.severity } : {}), checks };
    if (checks.some((c) => c.exceeded)) abnormal.push(entry);
    else if (unexpected.length > 0) {
      unknown.push({ ...entry, why: `규칙이 예상하지 못한 ${unexpected.map((u) => `${u.field} ${u.count}건`).join(", ")}` });
    } else normal.push(entry);
  }
  return { abnormal, normal, unknown };
}
