"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { cn, formatHourShort } from "@/lib/utils";
import type { FrequencyGraphBucket } from "@/types";

interface FrequencyChartProps {
  buckets: FrequencyGraphBucket[];
  className?: string;
}

export function FrequencyChart({ buckets, className }: FrequencyChartProps) {
  if (buckets.length === 0) {
    return (
      <div className={cn("flex h-64 items-center justify-center text-muted-foreground", className)}>
        데이터가 없습니다
      </div>
    );
  }

  return (
    <div className={cn("h-64 w-full", className)} role="img" aria-label="이벤트 빈도 그래프">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={buckets} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-foreground)" opacity={0.1} />
          <XAxis
            dataKey="hour"
            tickFormatter={formatHourShort}
            tick={{ fontSize: 11 }}
            stroke="var(--color-foreground)"
            opacity={0.4}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11 }}
            stroke="var(--color-foreground)"
            opacity={0.4}
            width={30}
          />
          <Tooltip
            labelFormatter={(label) => formatHourShort(String(label))}
            formatter={(value, name) => [
              `${value}회`,
              name === "adds" ? "추가" : "차감",
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
              value === "adds" ? "추가" : "차감"
            }
          />
          <Bar dataKey="adds" fill="#22c55e" stackId="a" radius={[2, 2, 0, 0]} />
          <Bar dataKey="subtracts" fill="#ef4444" stackId="a" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
