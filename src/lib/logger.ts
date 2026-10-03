/**
 * 운영 로그(Workers Logs) 출력용 구조화 로거.
 *
 * 한 줄에 JSON 하나를 console로 내보낸다. Workers Logs가 JSON 필드를 인덱싱하므로
 * 대시보드에서 `event`, `requestId`, `kind` 등으로 바로 필터할 수 있다.
 * 도메인의 시간 변경 기록(timer_logs)과는 다르다.
 *
 * 이벤트 이름은 영어 dot 표기(`auth.refresh.rejected`)로 쓴다. 목록은 docs/OBSERVABILITY.md "이벤트 카탈로그".
 *
 * 모든 로그에 배포 버전(`versionId`, `versionTag`)을 붙인다. 배포 후 재발 여부를 버전 단위로 가르기 위해서다.
 *
 * PII 규칙
 * - 금지: 토큰(access·refresh·OAuth code/state), 토큰 해시, 쿠키, nickname, chzzkUserId, actorName,
 *   쿼리스트링, 외부(CHZZK) 응답 본문 원문
 * - 허용: 내부 userId·timerId·projectId·familyId(서버가 만든 hex ID), requestId, method, pathname
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";

type LogLevel = "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

type VersionFields = { versionId?: string; versionTag?: string };

/** 버전은 isolate 수명 동안 바뀌지 않으므로 한 번 읽으면 캐시한다. 실패는 캐시하지 않는다(요청 컨텍스트 밖에서 먼저 불릴 수 있다) */
let cachedVersion: VersionFields | undefined;

/**
 * `[version_metadata]` 바인딩(CF_VERSION_METADATA)에서 버전을 읽는다.
 * 테스트·빌드·요청 컨텍스트 밖에서는 getCloudflareContext가 던지므로 빈 객체를 돌려주고 필드를 생략한다.
 * 로깅이 버전 조회 때문에 실패하면 안 되므로 어떤 예외도 밖으로 내보내지 않는다
 */
function versionFields(): VersionFields {
  if (cachedVersion) return cachedVersion;
  try {
    const ctx: unknown = getCloudflareContext();
    // 동기 호출이 thenable을 돌려주는 환경(모킹 등)이면 쓰지 않고, 거부돼도 unhandled rejection이 되지 않게 막는다
    if (ctx && typeof (ctx as { then?: unknown }).then === "function") {
      (ctx as Promise<unknown>).then(undefined, () => {});
      return {};
    }
    const meta = (ctx as { env?: { CF_VERSION_METADATA?: Partial<WorkerVersionMetadata> } } | undefined)?.env
      ?.CF_VERSION_METADATA;
    if (!meta || typeof meta.id !== "string" || meta.id === "") return {};
    const fields: VersionFields = { versionId: meta.id };
    // --tag 없이 배포하면 tag가 빈 문자열이다
    if (typeof meta.tag === "string" && meta.tag !== "") fields.versionTag = meta.tag;
    cachedVersion = fields;
    return fields;
  } catch {
    return {};
  }
}

function log(level: LogLevel, event: string, fields?: LogFields) {
  // 예약 키를 뒤에 두어 fields가 level·event·timestamp·versionId·versionTag를 덮어쓰지 못하게 한다.
  // 버전을 모를 때도 fields의 같은 이름 키는 undefined로 지워 JSON에서 빠지게 한다(가짜 버전으로 verify가 속지 않도록).
  // message는 Workers Logs 목록의 표시 열이라 event와 같은 값으로 남긴다
  const entry = {
    ...fields,
    versionId: undefined,
    versionTag: undefined,
    ...versionFields(),
    level,
    event,
    message: event,
    timestamp: new Date().toISOString(),
  };
  const line = JSON.stringify(entry);

  switch (level) {
    case "info":
      console.log(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "error":
      console.error(line);
      break;
  }
}

export const logger = {
  info(event: string, fields?: LogFields) {
    log("info", event, fields);
  },
  warn(event: string, fields?: LogFields) {
    log("warn", event, fields);
  },
  error(event: string, fields?: LogFields) {
    log("error", event, fields);
  },
};

const MESSAGE_LIMIT = 300;
const STACK_LIMIT = 2000;

/** 마이그레이션 누락(schema_drift)과 외부 호출 시간 초과(timeout)를 로그 한 줄로 구분하기 위한 분류 */
export type ErrorKind = "schema_drift" | "timeout" | "unknown";

function nameOf(value: unknown): unknown {
  return typeof value === "object" && value !== null ? (value as { name?: unknown }).name : undefined;
}

/**
 * 시간 초과는 감싼 오류(ChzzkApiError 등)로 올라오는 경우가 많아 바깥 name만 보면 놓친다.
 * `timedOut: true` 속성이나 cause의 name도 함께 본다(logger가 도메인 오류 클래스를 import하지 않도록 덕 타이핑)
 */
function classify(err: unknown, name: string, message: string): ErrorKind {
  if (/no such (table|column)/i.test(message)) return "schema_drift";
  if (name === "TimeoutError") return "timeout";
  if (typeof err === "object" && err !== null) {
    const e = err as { timedOut?: unknown; cause?: unknown };
    if (e.timedOut === true || nameOf(e.cause) === "TimeoutError") return "timeout";
  }
  return "unknown";
}

/**
 * V8 stack의 첫 줄(들)은 `${name}: ${message}`라 메시지 상한이 stack에서 풀린다.
 * 첫 프레임(`\n    at `) 앞의 머리말을 버리고 잘린 메시지로 다시 붙인다.
 * 서브클래스는 super() 뒤에 name을 바꾸므로 머리말의 이름이 errorName과 다를 수 있어 문자열 비교로 찾지 않는다
 */
function boundedStack(stack: string, name: string, message: string): string {
  const frameStart = stack.search(/\n\s+at /);
  const frames = frameStart === -1 ? "" : stack.slice(frameStart);
  return `${name}: ${message.slice(0, MESSAGE_LIMIT)}${frames}`.slice(0, STACK_LIMIT);
}

/**
 * 예외를 로그 필드로 바꾼다. 메시지·cause·stack은 길이를 묶는다(호출당 로그 상한 256KB).
 * Error가 아닌 DOMException(AbortSignal.timeout)도 name·message가 있으면 같은 방식으로 다룬다.
 */
export function errorFields(err: unknown): LogFields {
  if (typeof err === "object" && err !== null && "message" in err) {
    const e = err as { name?: unknown; message?: unknown; cause?: unknown; stack?: unknown };
    const name = typeof e.name === "string" ? e.name : "Error";
    const message = String(e.message);
    const fields: LogFields = {
      errorName: name,
      error: message.slice(0, MESSAGE_LIMIT),
      kind: classify(err, name, message),
    };
    if (e.cause !== undefined) {
      fields.cause = String(e.cause).slice(0, MESSAGE_LIMIT);
    }
    if (typeof e.stack === "string") {
      fields.stack = boundedStack(e.stack, name, message);
    }
    return fields;
  }
  const message = String(err);
  return {
    errorName: typeof err,
    error: message.slice(0, MESSAGE_LIMIT),
    kind: classify(err, "", message),
  };
}
