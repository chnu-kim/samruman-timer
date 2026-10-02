/**
 * 로그인 후 돌아갈 경로(`next`) 검증. 서버(로그인·콜백 라우트)와 클라이언트(로그인 화면,
 * 세션 만료 처리)가 함께 쓰므로 서버 모듈을 import하지 않는다.
 */

/** 로그인 시작 시 검증한 next를 OAuth 왕복 동안 들고 있는 쿠키. oauth_state와 수명이 같다 */
export const NEXT_COOKIE_NAME = "oauth_next";

const MAX_NEXT_LENGTH = 512;
const PARSE_BASE = "http://localhost";

/**
 * 같은 출처의 상대 경로만 통과시키고, 그 밖에는 null을 돌려준다.
 * - '/'로 시작해야 하고 '//'(프로토콜 상대 URL)로 시작하면 안 된다
 * - 역슬래시·공백·제어 문자는 위치와 무관하게 거부한다. 브라우저는 '\'를 '/'로 바꾸고
 *   URL 파서는 탭·개행을 지우므로 '/\evil.com'이나 '/<탭>/evil.com'이 '//evil.com'이 된다
 * - 파싱한 결과의 출처가 바뀌면 거부한다(위 규칙이 놓친 경우를 막는 마지막 확인)
 * - 로그인 화면과 API 경로는 되돌아갈 곳이 아니므로 거부한다(로그인 루프, 의도치 않은 API 호출 방지)
 */
export function sanitizeNextPath(value: string | null | undefined): string | null {
  if (!value || value.length > MAX_NEXT_LENGTH) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (/[\\\s\u0000-\u001f\u007f]/.test(value)) return null;

  let url: URL;
  try {
    url = new URL(value, PARSE_BASE);
  } catch {
    return null;
  }
  if (url.origin !== PARSE_BASE) return null;
  if (url.pathname === "/login" || url.pathname.startsWith("/login/") || url.pathname.startsWith("/api/")) {
    return null;
  }
  return value;
}

/** 세션 만료 시 보낼 로그인 주소. 지금 보던 경로를 next로 실어 로그인 후 돌아오게 한다 */
export function loginUrlWithNext(currentPath: string): string {
  const next = sanitizeNextPath(currentPath);
  return next ? `/login?next=${encodeURIComponent(next)}` : "/login";
}
