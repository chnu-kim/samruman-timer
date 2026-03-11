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
import { cn, formatDuration } from "@/lib/utils";
import type { HourlyDistribution } from "@/types";

interface HourlyActivityChartProps {
  data: HourlyDistribution[];
  className?: string;
}

export function HourlyActivityChart({ data, className }: HourlyActivityChartProps) {
  if (data.length === 0) {
    return (
      <div className={cn("flex h-64 items-center justify-center text-muted-foreground", className)}>
        데이터가 없습니다
      </div>
    );
  }

  // 0~23시 전체를 채움
  const fullData = Array.from({ length: 24 }, (_, hour) => {
    const found = data.find((d) => d.hour === hour);
    return found ?? { hour, eventCount: 0, adds: 0, subtracts: 0, addedSeconds: 0 };
  });

  return (
    <div className={cn("h-64 w-full", className)} role="img" aria-label="시간대별 활동 그래프">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={fullData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-foreground)" opacity={0.1} />
          <XAxis
            dataKey="hour"
            tickFormatter={(h) => `${h}시`}
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
            labelFormatter={(label) => `${label}시`}
            formatter={(value, name) => {
              if (name === "adds") return [`${value}회`, "추가"];
              return [`${value}회`, "차감"];
            }}
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
