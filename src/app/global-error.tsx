"use client";

// 루트 레이아웃(Header·Provider)에서 난 렌더 오류 경계. 루트 레이아웃을 대신하므로 자체 html/body를 갖고,
// 전역 CSS가 적용되지 않아 스타일은 인라인으로 둔다.
// 오버레이 경로에서는 방송 화면에 문구가 보이지 않게 투명한 빈 화면만 그린다.

const OVERLAY_PATH = /^\/timers\/[^/]+\/overlay\/?$/;

const colorScheme = `
  body { margin: 0; background: #ffffff; color: #0a0a0a; }
  @media (prefers-color-scheme: dark) { body { background: #0a0a0a; color: #ededed; } }
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
  const isOverlay = typeof window !== "undefined" && OVERLAY_PATH.test(window.location.pathname);

  if (isOverlay) {
    return (
      <html lang="ko">
        <body style={{ margin: 0, background: "transparent" }} />
      </html>
    );
  }

  return (
    <html lang="ko">
      <head>
        <title>오류 · 삼루먼타이머</title>
        <style>{colorScheme}</style>
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
