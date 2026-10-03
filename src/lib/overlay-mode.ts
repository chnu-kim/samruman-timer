// (클라이언트) 오버레이 모드: 헤더·푸터·main을 숨기고 body 배경을 지정 값(기본 투명)으로 바꾼다.
// 오버레이 페이지와 오버레이 error.tsx가 함께 쓴다. 페이지가 렌더 중 예외로 언마운트되면
// 페이지 cleanup이 이 상태를 지우므로, 오류 화면이 다시 적용해야 방송 화면에 앱 크롬이 드러나지 않는다.

const STYLE_ID = "overlay-style";
const MODE_CLASS = "overlay-mode";

/** 오버레이 모드를 적용하고 되돌리는 함수를 반환한다. 여러 번 불러도 style 요소는 하나만 둔다 */
export function applyOverlayMode(bg: string): () => void {
  // bg는 문자열 보간 없이 CSSOM으로만 넣는다
  document.body.style.setProperty("background", bg, "important");
  document.body.classList.add(MODE_CLASS);
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${MODE_CLASS} header, .${MODE_CLASS} footer, .${MODE_CLASS} main {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  return () => {
    document.body.classList.remove(MODE_CLASS);
    document.body.style.removeProperty("background");
    document.getElementById(STYLE_ID)?.remove();
  };
}
