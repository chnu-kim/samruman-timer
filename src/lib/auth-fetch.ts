import { fireSessionExpired } from "./session-expired";

// 세션 만료(SESSION_EXPIRED)로 판정한 401 응답. 호출부가 본문을 다시 읽지 않고 isSessionExpired로 묻는다
const sessionExpiredResponses = new WeakSet<Response>();

/**
 * 인증이 필요한 API 호출. 미들웨어가 refresh 갱신에 실패해 SESSION_EXPIRED를 준 401만 세션 만료로 보고
 * 로그인 화면으로 보내는 이벤트를 낸다. 그 밖의 401(refresh 쿠키 없음 = UNAUTHORIZED 등)은 일반 실패로 호출자에게 맡긴다.
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
    if (code === "SESSION_EXPIRED") {
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
