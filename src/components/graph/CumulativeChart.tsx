"use client";

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
import { cn, formatHoursFromSeconds, formatTimestampShort } from "@/lib/utils";
import type { CumulativeGraphPoint } from "@/types";

interface CumulativeChartProps {
  points: CumulativeGraphPoint[];
  className?: string;
}

export function CumulativeChart({ points, className }: CumulativeChartProps) {
  if (points.length === 0) {
    return (
      <div className={cn("flex h-64 items-center justify-center text-muted-foreground", className)}>
        데이터가 없습니다
      </div>
    );
  }

  return (
    <div className={cn("h-64 w-full", className)} role="img" aria-label="누적 변경량 그래프">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-foreground)" opacity={0.1} />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatTimestampShort}
            tick={{ fontSize: 11 }}
            stroke="var(--color-foreground)"
            opacity={0.4}
          />
          <YAxis
            tickFormatter={(v: number) => `${(v / 3600).toFixed(0)}h`}
            tick={{ fontSize: 11 }}
            stroke="var(--color-foreground)"
            opacity={0.4}
            width={40}
          />
          <Tooltip
            labelFormatter={(label) => formatTimestampShort(String(label))}
            formatter={(value, name) => [
              formatHoursFromSeconds(Number(value)),
              name === "totalAdded" ? "누적 추가" : "누적 차감",
            ]}
            contentStyle={{
              backgroundColor: "var(--color-background)",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              fontSize: "12px",
              opacity: 0.9,
            }}
          />
          <Legend
            formatter={(value: string) =>
              value === "totalAdded" ? "누적 추가" : "누적 차감"
            }
          />
          <Area
            type="monotone"
            dataKey="totalAdded"
            stroke="#22c55e"
            fill="#22c55e"
            fillOpacity={0.2}
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="totalSubtracted"
            stroke="#ef4444"
            fill="#ef4444"
            fillOpacity={0.2}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
