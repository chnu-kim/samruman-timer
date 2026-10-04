import { fireSessionExpired } from "./session-expired";

// 세션 만료로 판정한 401 응답(SESSION_EXPIRED, 쓰기 요청의 UNAUTHORIZED). 호출부가 본문을 다시 읽지 않고 isSessionExpired로 묻는다
const sessionExpiredResponses = new WeakSet<Response>();

/**
 * 인증이 필요한 API 호출. 미들웨어가 refresh 갱신에 실패해 SESSION_EXPIRED를 준 401을 세션 만료로 보고
 * 로그인 화면으로 보내는 이벤트를 낸다. refresh 쿠키가 없는 401(UNAUTHORIZED)도 쓰기 요청(GET 외)이면 같게 본다:
 * 쓰기 버튼은 로그인한 소유자에게만 보이므로, 그때의 UNAUTHORIZED는 다른 탭에서 로그아웃한 것처럼 로그인이 풀린 경우다.
 * '인증이 필요합니다'만 알리면 로그인으로 돌아갈 길이 없다. 조회(GET)의 UNAUTHORIZED는 로그아웃 상태로도 열 수 있는 화면의
 * 정상 흐름일 수 있어 일반 실패로 호출자에게 맡긴다.
 * 본문은 복제본에서 읽으므로 호출자는 돌려받은 응답의 본문을 그대로 읽을 수 있다
 */
export async function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) {
    let code: string | undefined;
    try {
      const body = (await res.clone().json()) as { error?: { code?: string } } | null;
      code = body?.error?.code;
    } catch {
      // 본문이 JSON이 아니면 세션 만료로 판정하지 않는다
    }
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (code === "SESSION_EXPIRED" || (code === "UNAUTHORIZED" && method !== "GET")) {
      sessionExpiredResponses.add(res);
      fireSessionExpired();
    }
  }
  return res;
}

/**
 * authFetch가 세션 만료로 판정한 응답인지. 세션 만료 안내(SessionExpiredHandler)가 따로 뜨므로
 * 호출부는 이때 자기 오류 안내를 띄우지 않는다(안내가 겹치지 않게)
 */
export function isSessionExpired(res: Response): boolean {
  return sessionExpiredResponses.has(res);
}
