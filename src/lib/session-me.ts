import { onSessionExpired } from "@/lib/session-expired";
import type { MeResponse } from "@/types";

/**
 * 확정된 결과를 다시 쓰는 시간. 헤더(레이아웃)와 로그인 화면은 같은 첫 로드에 함께 묻지만,
 * 로컬처럼 401이 몇 ms 만에 오면 로그인 화면이 헤더 요청이 끝난 뒤에 마운트해 진행 중 요청 공유만으로는 다시 묻는다.
 * 그 어긋남만 덮을 만큼 짧게 둔다. 다른 탭에서 로그인한 뒤 뒤로 가기로 /login에 돌아오는 경우처럼
 * 문서 안에서 상태가 바뀌는 경우는 이 시간이 지나 있어 새로 묻는다.
 */
const REUSE_MS = 3000;

let cached: { request: Promise<MeResponse | null>; settledAt: number | null } | null = null;

/**
 * 현재 로그인 사용자 확인(`GET /api/auth/me`). 비로그인·오류면 null.
 * 진행 중인 요청이나 방금(REUSE_MS 안) 끝난 확정 결과(200·401)를 같이 쓴다. 500·네트워크 오류는 다시 쓰지 않는다.
 * 세션 만료 이벤트가 나면 비운다.
 * authFetch를 쓰지 않는다: 401이면 세션 만료 이벤트가 /login으로 보내 로그인 화면에서 제자리를 돈다.
 */
export function fetchMe(): Promise<MeResponse | null> {
  if (cached && (cached.settledAt === null || Date.now() - cached.settledAt < REUSE_MS)) {
    return cached.request;
  }
  const entry: { request: Promise<MeResponse | null>; settledAt: number | null } = {
    request: Promise.resolve(null),
    settledAt: null,
  };
  const settle = (value: MeResponse | null, definitive: boolean) => {
    if (cached === entry) {
      if (definitive) entry.settledAt = Date.now();
      else cached = null;
    }
    return value;
  };
  entry.request = fetch("/api/auth/me")
    .then(async (res) => {
      if (res.ok) return settle(((await res.json()) as { data: MeResponse }).data, true);
      return settle(null, res.status === 401);
    })
    .catch(() => settle(null, false));
  cached = entry;
  return entry.request;
}

/** 캐시를 비운다(세션 만료, 테스트) */
export function resetMeCache() {
  cached = null;
}

if (typeof window !== "undefined") {
  onSessionExpired(resetMeCache);
}
