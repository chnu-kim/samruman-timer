// 오버레이 색상 값 형식. URL 쿼리와 저장된 설정 모두 이 형식만 허용한다.
// 자유 문자열을 허용하면 `}`로 CSS 규칙을 닫거나 url(...)로 외부 리소스를 불러올 수 있다.
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function isOverlayColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

export function isOverlayBackground(value: string): boolean {
  return value === "transparent" || HEX_COLOR.test(value);
}
