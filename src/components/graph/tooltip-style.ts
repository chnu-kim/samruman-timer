import type { CSSProperties } from "react";

// 그래프 툴팁 공용 스타일. 값 글자는 Recharts 기본(계열 색)을 따르면 라이트에서
// #22c55e가 배경 대비 2.3:1이라, 계열 색 대신 본문색으로 고정한다(WCAG 1.4.3)
export const chartTooltipStyle: { contentStyle: CSSProperties; itemStyle: CSSProperties } = {
  contentStyle: {
    backgroundColor: "var(--color-background)",
    border: "1px solid var(--color-border)",
    borderRadius: "8px",
    fontSize: "12px",
    color: "var(--color-foreground)",
    opacity: 0.9,
  },
  itemStyle: { color: "var(--color-foreground)" },
};
