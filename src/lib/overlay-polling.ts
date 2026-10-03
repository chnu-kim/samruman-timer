// (클라이언트) 오버레이 폴링 간격 정책.
// 오버레이는 방송 내내 켜져 있어서 실패해도 5초마다 계속 두드리면 Workers 요청 한도(무료 하루 10만)를 낭비한다.
// 그래서 연속 실패 횟수에 따라 간격을 두 배씩 늘리고, 성공하면 5초로 돌아간다.

export const POLL_INTERVAL_MS = 5_000;
/** 곧 회복되지 않을 원인(타이머 없음, 요청 한도 초과) */
export const LONG_BACKOFF_MAX_MS = 5 * 60_000;
/** 일시적일 가능성이 큰 원인(5xx, 네트워크 오류) */
export const SHORT_BACKOFF_MAX_MS = 60_000;

/**
 * - not_found: 404. 타이머가 삭제됐거나 URL이 틀렸다
 * - rate_limited: 429, 또는 200인데 JSON이 아닌 응답(한도 초과 안내 페이지 등. 판정은 page.tsx)
 * - server: 5xx와 그 밖의 실패 응답. 프록시·CDN의 HTML 502/503/504는 곧 회복되는 경우가 많아 본문 형식과 무관하게 여기로 둔다
 * - network: fetch 자체가 실패
 */
export type PollOutcome = "ok" | "not_found" | "rate_limited" | "server" | "network";

/**
 * ok가 아닌 응답의 원인. 상태 코드로만 판정한다.
 * 공개 엔드포인트라 401·403에 별도 분기를 두지 않고 server(60초 상한)로 다룬다
 */
export function classifyFailedResponse(res: Pick<Response, "status">): Exclude<PollOutcome, "ok" | "network"> {
  if (res.status === 404) return "not_found";
  if (res.status === 429) return "rate_limited";
  return "server";
}

/** 다음 폴링까지 대기 시간. failures는 이번 결과까지 포함한 연속 실패 횟수 */
export function nextPollDelay(outcome: PollOutcome, failures: number): number {
  if (outcome === "ok" || failures <= 0) return POLL_INTERVAL_MS;
  const cap = outcome === "not_found" || outcome === "rate_limited" ? LONG_BACKOFF_MAX_MS : SHORT_BACKOFF_MAX_MS;
  // 실패 1회 → 10초, 2회 → 20초 … 상한까지
  return Math.min(POLL_INTERVAL_MS * 2 ** Math.min(failures, 16), cap);
}
