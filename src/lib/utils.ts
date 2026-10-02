import type { ActionType } from "@/types";

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function formatHoursFromSeconds(seconds: number): string {
  const h = (seconds / 3600).toFixed(1);
  return `${h}시간`;
}

/**
 * 그래프 Y축 눈금(초)을 읽을 수 있는 단위로 바꾼다.
 * 축 최댓값이 2시간 미만이면 분, 아니면 시간 단위이고, 소수 한 자리까지 쓴다.
 * 정수로 반올림하면 '1h, 1h, 0h'처럼 눈금 라벨이 겹친다.
 */
export function formatAxisSeconds(seconds: number, maxSeconds: number): string {
  if (maxSeconds < 7200) {
    return `${Number((seconds / 60).toFixed(1))}m`;
  }
  return `${Number((seconds / 3600).toFixed(1))}h`;
}

export function formatTimestampShort(iso: string): string {
  const d = new Date(iso);
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
 * 변경 기록의 행위자 표시명. 만료·예약 활성화는 서버가 actor_name 'system'으로 남기는데,
 * 시청자 닉네임처럼 읽히지 않도록 화면에서만 '자동'으로 바꾼다(DB 값은 유지).
 */
export function displayActorName(log: {
  actionType: ActionType;
  actorName: string;
  actorUserId: string | null;
}): string {
  if (log.actorUserId === null && (log.actionType === "EXPIRE" || log.actionType === "ACTIVATE")) {
    return "자동";
  }
  return log.actorName;
}
