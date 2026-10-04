// 시간 조작·타이머 생성 폼이 함께 쓰는 입력 규칙 (클라이언트·서버 공용, 순수 함수)

export interface TimeParts {
  hours: number;
  minutes: number;
  seconds: number;
}

/** 총 초를 시·분·초로 나눈다. 음수·NaN·소수는 0 이상의 정수 초로 맞춘다 */
export function splitSeconds(totalSeconds: number): TimeParts {
  const total = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  return {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/**
 * 시·분·초 입력을 정규화한다. 60 이상의 분·초는 잘라 버리지 않고 윗자리로 올린다
 * (90분 → 1시간 30분, 75초 → 1분 15초). 입력한 만큼 그대로 반영되고, 결과는 버튼 라벨로 보인다
 */
export function normalizeTimeParts(hours: number, minutes: number, seconds: number): TimeParts {
  const safe = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
  return splitSeconds(safe(hours) * 3600 + safe(minutes) * 60 + safe(seconds));
}

/**
 * 다이얼로그 폼의 시·분·초 입력칸 값. 숫자 대신 입력 문자열을 들고 있어야
 * 칸을 지웠을 때 '0'이 다시 채워지지 않는다(빈 칸은 placeholder '0'으로 보인다)
 */
export type TimeFields = Record<keyof TimeParts, string>;

export const EMPTY_TIME_FIELDS: TimeFields = { hours: "", minutes: "", seconds: "" };

/** 입력칸 문자열을 0 이상의 수로 읽는다. 빈 값·숫자가 아닌 값·음수는 0 */
export function parseTimeField(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 입력칸 값의 총 초(정수로 내림). normalizeTimeParts와 같은 규칙으로 센다 */
export function timeFieldsToSeconds(fields: TimeFields): number {
  return Math.floor(parseTimeField(fields.hours) * 3600 + parseTimeField(fields.minutes) * 60 + parseTimeField(fields.seconds));
}

/**
 * 한 칸을 바꾼 결과. 분·초가 60 이상이거나 정수가 아닌 값(1.5시간, 음수)이 들어오면
 * normalizeTimeParts로 세 칸을 다시 써서(0인 칸은 빈 칸) 보이는 값과 적용될 값을 맞춘다.
 * 그 밖에는 입력한 문자열을 그대로 둔다(빈 칸 유지)
 */
export function changeTimeField(fields: TimeFields, field: keyof TimeParts, raw: string): TimeFields {
  const next = { ...fields, [field]: raw };
  const plain = (v: string) => v === "" || /^\d+$/.test(v);
  if (plain(next.hours) && plain(next.minutes) && plain(next.seconds) && Number(next.minutes) < 60 && Number(next.seconds) < 60) {
    return next;
  }
  const normalized = normalizeTimeParts(parseTimeField(next.hours), parseTimeField(next.minutes), parseTimeField(next.seconds));
  const show = (n: number) => (n > 0 ? String(n) : "");
  return { hours: show(normalized.hours), minutes: show(normalized.minutes), seconds: show(normalized.seconds) };
}

/**
 * 즉시 적용(모바일 하단 바, 숫자 단축키)이 기록할 닉네임.
 * 입력란에 적은 이름이 우선이고, 비어 있으면 기본 닉네임을 쓴다. 둘 다 없으면 빈 문자열
 */
export function resolveQuickActor(typedName: string, defaultActor: string): string {
  return typedName.trim() || defaultActor.trim();
}
