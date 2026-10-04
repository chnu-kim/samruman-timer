"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  buildTimeAxis,
  cn,
  durationAxisTicks,
  formatDuration,
  formatDurationTick,
  formatHoursFromSeconds,
  formatTimestampShort,
} from "@/lib/utils";
import type { RemainingGraphPoint } from "@/types";
import { chartTooltipStyle } from "./tooltip-style";

interface RemainingChartProps {
  points: RemainingGraphPoint[];
  className?: string;
}

/** 그래프 이름으로 읽힐 요약. 점은 각 기록 직후의 잔여 시간이라 '현재'가 아니라 '마지막 기록'이다. */
export function summarizeRemaining(points: RemainingGraphPoint[]): string {
  const last = points[points.length - 1].remainingSeconds;
  const max = Math.max(...points.map((p) => p.remainingSeconds));
  return (
    `잔여 시간 추이 그래프, 기록 ${points.length}건, 마지막 기록 ${formatDuration(last)}` +
    (max > last ? `, 최고 ${formatDuration(max)}` : "")
  );
}

export function RemainingChart({ points, className }: RemainingChartProps) {
  // x축은 기록 순번이 아니라 실제 시각(ms)이다. 같은 분에 몰린 기록은 한곳에 모이고 긴 공백은 넓게 그려진다.
  const chart = useMemo(() => {
    if (points.length === 0) return null;
    const data = points.map((p) => ({ t: Date.parse(p.timestamp), remainingSeconds: p.remainingSeconds }));
    const maxSeconds = Math.max(...data.map((p) => p.remainingSeconds));
    return {
      data,
      xAxis: buildTimeAxis(data.map((p) => p.t)),
      yTicks: durationAxisTicks(maxSeconds),
      summary: summarizeRemaining(points),
    };
  }, [points]);

  if (!chart) {
    return (
      <div className={cn("flex h-64 items-center justify-center text-muted-foreground", className)}>
        데이터가 없습니다
      </div>
    );
  }

  const { data, xAxis, yTicks, summary } = chart;

  // 그래프 내부는 축 눈금만 읽히고 Tab 정지점이 생기므로 접근성 레이어를 끄고, 요약을 그림 이름으로 준다.
  return (
    <div className={cn("h-64 w-full", className)} role="img" aria-label={summary}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} accessibilityLayer={false}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-foreground)" opacity={0.1} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={xAxis.domain}
            ticks={xAxis.ticks}
            tickFormatter={xAxis.label}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            stroke="var(--color-border)"
          />
          <YAxis
            domain={[0, yTicks[yTicks.length - 1]]}
            ticks={yTicks}
            tickFormatter={(v: number) => formatDurationTick(v, yTicks)}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            stroke="var(--color-border)"
            width={52}
          />
          <Tooltip
            labelFormatter={(label) => formatTimestampShort(Number(label))}
            formatter={(value) => [formatHoursFromSeconds(Number(value)), "잔여 시간"]}
            {...chartTooltipStyle}
          />
          <Line
            type="stepAfter"
            dataKey="remainingSeconds"
            stroke="var(--color-accent)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--color-accent)" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
