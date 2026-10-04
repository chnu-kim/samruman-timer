"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
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
import type { CumulativeGraphPoint } from "@/types";

interface CumulativeChartProps {
  points: CumulativeGraphPoint[];
  className?: string;
}

/** 그래프 이름으로 읽힐 요약 */
export function summarizeCumulative(points: CumulativeGraphPoint[]): string {
  const last = points[points.length - 1];
  return `누적 변경량 그래프, 누적 추가 ${formatDuration(last.totalAdded)}, 누적 차감 ${formatDuration(last.totalSubtracted)}`;
}

export function CumulativeChart({ points, className }: CumulativeChartProps) {
  // x축은 기록 순번이 아니라 실제 시각(ms)이다
  const chart = useMemo(() => {
    if (points.length === 0) return null;
    const data = points.map((p) => ({
      t: Date.parse(p.timestamp),
      totalAdded: p.totalAdded,
      totalSubtracted: p.totalSubtracted,
    }));
    const maxSeconds = Math.max(...data.map((p) => Math.max(p.totalAdded, p.totalSubtracted)));
    return {
      data,
      xAxis: buildTimeAxis(data.map((p) => p.t)),
      yTicks: durationAxisTicks(maxSeconds),
      summary: summarizeCumulative(points),
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
        <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} accessibilityLayer={false}>
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
            formatter={(value, name) => [
              formatHoursFromSeconds(Number(value)),
              name === "totalAdded" ? "누적 추가" : "누적 차감",
            ]}
            contentStyle={{
              backgroundColor: "var(--color-background)",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              fontSize: "12px",
              color: "var(--color-foreground)",
              opacity: 0.9,
            }}
          />
          <Legend
            formatter={(value: string) =>
              value === "totalAdded" ? "+ 누적 추가" : "- 누적 차감"
            }
            wrapperStyle={{ fontSize: "12px" }}
            labelStyle={{ color: "var(--color-foreground)" }}
          />
          <Area
            type="stepAfter"
            dataKey="totalAdded"
            legendType="plainline"
            stroke="#22c55e"
            fill="#22c55e"
            fillOpacity={0.2}
            strokeWidth={2}
          />
          {/* 차감은 점선으로 그려 색을 구분하기 어려워도 추가와 갈린다. 범례 아이콘도 같은 점선이다 */}
          <Area
            type="stepAfter"
            dataKey="totalSubtracted"
            stroke="#ef4444"
            strokeDasharray="6 4"
            legendType="plainline"
            fill="#ef4444"
            fillOpacity={0.2}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
