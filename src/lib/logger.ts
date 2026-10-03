/**
 * 운영 로그(Workers Logs) 출력용 구조화 로거.
 *
 * 한 줄에 JSON 하나를 console로 내보낸다. Workers Logs가 JSON 필드를 인덱싱하므로
 * 대시보드에서 `event`, `requestId`, `kind` 등으로 바로 필터할 수 있다.
 * 도메인의 시간 변경 기록(timer_logs)과는 다르다.
 *
 * 이벤트 이름은 영어 dot 표기(`auth.refresh.rejected`)로 쓴다. 목록은 docs/ARCHITECTURE.md "운영 로그·관측" 절.
 *
 * PII 규칙
 * - 금지: 토큰(access·refresh·OAuth code/state), 토큰 해시, 쿠키, nickname, chzzkUserId, actorName,
 *   쿼리스트링, 외부(CHZZK) 응답 본문 원문
 * - 허용: 내부 userId·timerId·projectId·familyId(서버가 만든 hex ID), requestId, method, pathname
 */

type LogLevel = "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

function log(level: LogLevel, event: string, fields?: LogFields) {
  // 예약 키를 뒤에 두어 fields가 level·event·timestamp를 덮어쓰지 못하게 한다.
  // message는 Workers Logs 목록의 표시 열이라 event와 같은 값으로 남긴다
  const entry = {
    ...fields,
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

function classify(name: string, message: string): ErrorKind {
  if (/no such (table|column)/i.test(message)) return "schema_drift";
  if (name === "TimeoutError") return "timeout";
  return "unknown";
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
      kind: classify(name, message),
    };
    if (e.cause !== undefined) {
      fields.cause = String(e.cause).slice(0, MESSAGE_LIMIT);
    }
    if (typeof e.stack === "string") {
      fields.stack = e.stack.slice(0, STACK_LIMIT);
    }
    return fields;
  }
  const message = String(err);
  return {
    errorName: typeof err,
    error: message.slice(0, MESSAGE_LIMIT),
    kind: classify("", message),
  };
}
