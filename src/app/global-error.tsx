"use client";

import { useLayoutEffect, useState } from "react";
import { useOverlayRecovery } from "@/hooks/useOverlayRecovery";

// 루트 레이아웃(Header·Provider)에서 난 렌더 오류 경계. 루트 레이아웃을 대신하므로 자체 html/body를 갖고,
// 전역 CSS가 적용되지 않아 스타일은 인라인으로 둔다.
// 오버레이 경로에서는 방송 화면에 문구가 보이지 않게 투명한 빈 화면만 그리고, 오버레이 오류 경계와 같은 정책으로
// reset()·reload를 자동으로 시도한다(OBS에서는 아무도 '다시 시도'를 누르지 않는다).
// 서버 렌더와 클라이언트 렌더가 같은 마크업을 내도록 분기는 html의 data-overlay 속성과 CSS로 한다:
// 서버 렌더(HTML 파싱 중)는 head의 인라인 스크립트가, 클라이언트 렌더는 useLayoutEffect가 페인트 전에 속성을 붙인다.

const OVERLAY_PATH_SOURCE = "^/timers/[^/]+/overlay/?$";

const overlayScript = `(function(){try{if(new RegExp(${JSON.stringify(OVERLAY_PATH_SOURCE)}).test(location.pathname))document.documentElement.setAttribute('data-overlay','');}catch(e){}})();`;

const styles = `
  body { margin: 0; background: #ffffff; color: #0a0a0a; }
  @media (prefers-color-scheme: dark) { body { background: #0a0a0a; color: #ededed; } }
  html[data-overlay] body { background: transparent !important; }
  html[data-overlay] body > * { display: none !important; }
`;

export default function GlobalError({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset: () => void;
}) {
  const [isOverlay, setIsOverlay] = useState(false);
  useLayoutEffect(() => {
    if (new RegExp(OVERLAY_PATH_SOURCE).test(window.location.pathname)) {
      document.documentElement.setAttribute("data-overlay", "");
      setIsOverlay(true);
    }
  }, []);
  // retry()는 RSC 요청을 보내 요청 한도를 소모하므로 오버레이 자동 복구에는 reset()만 쓴다
  useOverlayRecovery(reset, isOverlay);

  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <title>오류 · 삼루먼타이머</title>
        <script dangerouslySetInnerHTML={{ __html: overlayScript }} />
        <style>{styles}</style>
      </head>
      <body>
        <div
          role="alert"
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 16,
            textAlign: "center",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>문제가 발생했습니다</h1>
          <p style={{ margin: 0, opacity: 0.7 }}>페이지를 표시하지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
          {error.digest && (
            <p style={{ margin: 0, fontSize: 12, opacity: 0.6 }}>
              오류 코드: <span style={{ fontFamily: "ui-monospace, monospace" }}>{error.digest}</span>
            </p>
          )}
          <button
            type="button"
            onClick={() => (retry ?? reset)()}
            style={{
              minHeight: 44,
              padding: "0 20px",
              borderRadius: 8,
              border: "1px solid currentColor",
              background: "transparent",
              color: "inherit",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
