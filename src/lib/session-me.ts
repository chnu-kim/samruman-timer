import { onSessionExpired } from "@/lib/session-expired";
import type { MeResponse } from "@/types";

let cached: Promise<MeResponse | null> | null = null;

/**
 * 현재 로그인 사용자 확인(`GET /api/auth/me`). 비로그인·오류면 null.
 *
 * 헤더와 로그인 화면이 같은 첫 로드에 함께 묻기 때문에, 이 문서(페이지 로드) 안에서는 확정된 결과를 같이 쓴다.
 * 로컬처럼 401이 몇 ms 만에 오면 진행 중인 요청만 공유해서는 뒤늦게 마운트한 쪽이 다시 묻는다.
 * 로그인·로그아웃은 모두 전체 이동(새 문서)이라 문서 안에서 결과가 바뀌는 경우는 세션 만료뿐이고, 그때는 캐시를 비운다.
 * 200(사용자)·401(비로그인)만 확정으로 보고, 500·네트워크 오류는 캐시하지 않아 다음 호출이 다시 묻는다.
 * authFetch를 쓰지 않는다: 401이면 세션 만료 이벤트가 /login으로 보내 로그인 화면에서 제자리를 돈다.
 */
export function fetchMe(): Promise<MeResponse | null> {
  if (cached) return cached;
  const request: Promise<MeResponse | null> = fetch("/api/auth/me")
    .then(async (res) => {
      if (res.ok) return ((await res.json()) as { data: MeResponse }).data;
      if (res.status !== 401) forget(request);
      return null;
    })
    .catch(() => {
      forget(request);
      return null;
    });
  cached = request;
  return request;
}

function forget(request: Promise<MeResponse | null>) {
  if (cached === request) cached = null;
}

/** 테스트용: 문서 하나의 수명을 흉내 낼 수 없어 캐시를 직접 비운다 */
export function resetMeCache() {
  cached = null;
}

if (typeof window !== "undefined") {
  onSessionExpired(resetMeCache);
}
