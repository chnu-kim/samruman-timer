"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { cn, formatHoursFromSeconds, formatTimestampShort } from "@/lib/utils";
import type { RemainingGraphPoint } from "@/types";

interface RemainingChartProps {
  points: RemainingGraphPoint[];
  className?: string;
}

export function RemainingChart({ points, className }: RemainingChartProps) {
  if (points.length === 0) {
    return (
      <div className={cn("flex h-64 items-center justify-center text-foreground/40", className)}>
        데이터가 없습니다
      </div>
    );
  }

  return (
    <div className={cn("h-64 w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
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
            formatter={(value) => [formatHoursFromSeconds(Number(value)), "잔여 시간"]}
            contentStyle={{
              backgroundColor: "var(--color-background)",
              border: "1px solid var(--color-foreground)",
              borderRadius: "8px",
              fontSize: "12px",
              opacity: 0.9,
            }}
          />
          <Line
            type="stepAfter"
            dataKey="remainingSeconds"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 3, fill: "#3b82f6" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
