import type { ActionType } from "@/types";

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function formatHoursFromSeconds(seconds: number): string {
  const h = (seconds / 3600).toFixed(1);
  return `${h}시간`;
}

const MINUTE = 60;
const HOUR = 3600;

// Y축 눈금 간격 후보(초). 1시간 미만은 15·30분처럼 분 단위로 떨어지고, 그 위는 정수 시간이다.
const DURATION_TICK_STEPS = [
  1, 2, 5, 10, 15, 30,
].map((m) => m * MINUTE).concat(
  [1, 2, 3, 4, 5, 6, 10, 12, 20, 24, 25, 50, 100].map((h) => h * HOUR)
);

/**
 * 그래프 Y축(초 단위 값)의 눈금을 0부터 깔끔한 간격으로 만든다.
 * 간격은 최대 4칸이 되도록 고르고, 마지막 눈금이 축의 최댓값이 된다.
 * 최댓값을 등분하면 '16.7h, 12.5h, 8.3h'처럼 바로 읽히지 않는 값이 나온다.
 */
export function durationAxisTicks(maxSeconds: number): number[] {
  const max = Math.max(0, maxSeconds);
  const step =
    DURATION_TICK_STEPS.find((s) => Math.ceil(max / s) <= 4) ??
    Math.ceil(max / 4 / (100 * HOUR)) * 100 * HOUR;
  const count = Math.max(1, Math.ceil(max / step));
  return Array.from({ length: count + 1 }, (_, i) => i * step);
}

/**
 * Y축 눈금 라벨. 간격이 1시간 이상이면 '4시간', 미만이면 '30분'·'90분'처럼 한 단위로 쓴다.
 * '1시간 30분'처럼 두 단위를 쓰면 축 폭을 넘는다.
 */
export function formatDurationTick(seconds: number, ticks: number[]): string {
  if (seconds === 0) return "0";
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : HOUR;
  if (step >= HOUR) return `${Math.round(seconds / HOUR)}시간`;
  return `${Math.round(seconds / MINUTE)}분`;
}

// X축(시각) 눈금 간격 후보(ms). 모두 하루를 나누어떨어지게 해서 로컬 자정에 맞춘다.
const TIME_TICK_STEPS = [10, 30].map((s) => s * 1000).concat(
  [1, 2, 5, 10, 15, 30].map((m) => m * MINUTE * 1000),
  [1, 2, 3, 6, 12, 24].map((h) => h * HOUR * 1000)
);
const DAY_MS = 24 * HOUR * 1000;

/**
 * 시간축 눈금(ms)을 로컬 시각의 깔끔한 경계(5분, 1시간, 자정 등)에 맞춰 최대 maxCount개 만든다.
 * 범위가 없으면(점 하나) 그 시각 하나만 돌려준다.
 */
export function timeAxisTicks(minMs: number, maxMs: number, maxCount = 5): number[] {
  if (!(maxMs > minMs)) return [minMs];
  const span = maxMs - minMs;
  const step =
    TIME_TICK_STEPS.find((s) => Math.floor(span / s) + 1 <= maxCount) ??
    Math.ceil(span / (maxCount - 1) / DAY_MS) * DAY_MS;
  const midnight = new Date(minMs);
  midnight.setHours(0, 0, 0, 0);
  const base = midnight.getTime();
  const ticks: number[] = [];
  for (let t = base + Math.ceil((minMs - base) / step) * step; t <= maxMs; t += step) {
    ticks.push(t);
  }
  return ticks.length > 0 ? ticks : [minMs];
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * 시간축 눈금 라벨. 'HH:mm'만 쓰고, 눈금이 여러 날에 걸치면 첫 눈금과 날짜가 바뀌는 눈금에만
 * 'MM. DD.'를 붙인다. 초 단위 간격이면 'HH:mm:ss'.
 * 눈금마다 날짜를 반복하던 'MM. DD. HH:mm' 형식은 같은 분에 몰린 기록에서 같은 라벨이 되풀이됐다.
 */
export function formatTimeTicks(ticks: number[]): string[] {
  const dates = ticks.map((t) => new Date(t));
  const withSeconds = dates.some((d) => d.getSeconds() !== 0);
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const multiDay = new Set(dates.map(dayKey)).size > 1;
  return dates.map((d, i) => {
    const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}${withSeconds ? `:${pad2(d.getSeconds())}` : ""}`;
    const showDate = multiDay && (i === 0 || dayKey(dates[i - 1]) !== dayKey(d));
    return showDate ? `${pad2(d.getMonth() + 1)}. ${pad2(d.getDate())}. ${time}` : time;
  });
}

/**
 * 시각(ms) 목록으로 시간축의 범위·눈금·라벨을 만든다. 점이 하나뿐이면 앞뒤 5분을 둔다.
 * 라벨은 눈금 값으로 찾는다(Recharts tickFormatter는 값을 넘긴다).
 */
export function buildTimeAxis(times: number[]): {
  domain: [number, number];
  ticks: number[];
  label: (t: number) => string;
} {
  let min = Math.min(...times);
  let max = Math.max(...times);
  if (min === max) {
    min -= 5 * MINUTE * 1000;
    max += 5 * MINUTE * 1000;
  }
  const ticks = timeAxisTicks(min, max);
  const labels = new Map(formatTimeTicks(ticks).map((l, i) => [ticks[i], l]));
  return { domain: [min, max], ticks, label: (t) => labels.get(t) ?? "" };
}

/** ISO 문자열이나 ms 시각을 'MM. DD. HH:mm'으로. 그래프 툴팁 머리글에 쓴다. */
export function formatTimestampShort(time: string | number): string {
  const d = new Date(time);
  return d.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** 초를 "100시간 30분" 형식으로 포맷 */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}시간 ${m}분`;
  if (h > 0) return `${h}시간`;
  return `${m}분`;
}

/** 초를 "1시간 30분 5초" 형식으로(0인 단위는 생략). 시간 변경량 표시용 */
export function formatDeltaSeconds(seconds: number): string {
  const abs = Math.abs(seconds);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}시간`);
  if (m > 0) parts.push(`${m}분`);
  if (s > 0 || parts.length === 0) parts.push(`${s}초`);
  return parts.join(" ");
}

export function formatHourShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
}

/** 전체 날짜시간 포맷 (YYYY. MM. DD. HH:mm:ss) */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * 종료 예정 시각. 오늘이면 '오후 1:33', 다른 날이면 '10. 6. 오후 1:33'(다른 해면 연도까지).
 * 방송 화면·콘솔에서 한눈에 읽히도록 초는 빼고 12시간제로 쓴다. 0시는 '오전 12:05', 12시는 '오후 12:00'.
 * toLocaleString은 엔진에 따라 '24:05'나 앞자리 0을 내므로 직접 맞춘다
 */
export function formatEndTime(date: Date, now: Date = new Date()): string {
  const h = date.getHours();
  const time = `${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}:${String(date.getMinutes()).padStart(2, "0")}`;
  const sameYear = date.getFullYear() === now.getFullYear();
  if (sameYear && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()) return time;
  const day = `${date.getMonth() + 1}. ${date.getDate()}.`;
  return sameYear ? `${day} ${time}` : `${date.getFullYear()}. ${day} ${time}`;
}

/**
 * 변경 기록 행의 시각. 오늘이면 'HH:mm'만, 오늘이 아니면 'MM. DD. HH:mm', 다른 해면 연도까지 붙인다.
 * 방송 중에는 대부분 오늘 기록이라 날짜·초를 매 행 반복하지 않는다(초까지의 전체 시각은 title로).
 * toLocaleString은 엔진에 따라 '오전'이나 '24:05'를 내므로 직접 맞춘다
 */
export function formatLogTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sameYear = d.getFullYear() === now.getFullYear();
  if (sameYear && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) return time;
  const date = `${pad(d.getMonth() + 1)}. ${pad(d.getDate())}.`;
  return sameYear ? `${date} ${time}` : `${d.getFullYear()}. ${date} ${time}`;
}

/** 상대 날짜 포맷 ("오늘", "어제", "3일 전", 또는 로컬 날짜) */
export function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "오늘";
  if (diffDays === 1) return "어제";
  if (diffDays < 30) return `${diffDays}일 전`;
  return date.toLocaleDateString("ko-KR");
}

/**
 * 변경 기록의 행위자 표시명. 만료·예약 활성화(와 되돌리기로 생긴 만료·재시작)는 서버가 actor_name 'system'으로 남기는데,
 * 시청자 닉네임처럼 읽히지 않도록 화면에서만 '자동'으로 바꾼다(DB 값은 유지).
 */
export function displayActorName(log: {
  actionType: ActionType;
  actorName: string;
  actorUserId: string | null;
}): string {
  // REOPEN은 시청자 추가로 생기면 그 닉네임이고, 되돌리기로 생기면 system이다
  if (log.actorUserId === null && (log.actionType === "EXPIRE" || log.actionType === "ACTIVATE" || log.actionType === "REOPEN")) {
    return "자동";
  }
  return log.actorName;
}
