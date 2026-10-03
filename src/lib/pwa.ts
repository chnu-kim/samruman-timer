// 서비스워커 관련 클라이언트 공용 판정. public/sw.js는 번들 밖 정적 파일이라 이 모듈을 import하지 못하므로
// 같은 규칙을 sw.js에도 둔다. 둘이 어긋나지 않는지는 src/__tests__/sw.test.ts가 같은 경로 표로 확인한다.

/**
 * OBS 브라우저 소스로 쓰이는 오버레이 경로. next.config.ts의 오버레이 헤더 규칙(`overlay$`)과 달리 끝 슬래시도 포함한다.
 * 서버는 끝 슬래시 주소를 슬래시 없는 주소로 리다이렉트하지만, 서비스워커는 리다이렉트 전 원래 요청 URL을 보기 때문이다.
 */
export const OVERLAY_PATH_PATTERN = /^\/timers\/[^/]+\/overlay\/?$/;

export function isOverlayPath(pathname: string): boolean {
  return OVERLAY_PATH_PATTERN.test(pathname);
}

/** 등록하는 서비스워커 스크립트 경로 (public/sw.js) */
export const SW_SCRIPT_PATH = "/sw.js";

/** sw.js가 만드는 캐시 이름의 접두사. sw.js의 CACHE_PREFIX와 같아야 한다 (sw.test.ts가 확인). */
export const SW_CACHE_PREFIX = "samrumantimer-";
