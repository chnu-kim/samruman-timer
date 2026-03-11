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
import type { DailyActivity } from "@/types";

interface DailyActivityChartProps {
  data: DailyActivity[];
  className?: string;
}

export function DailyActivityChart({ data, className }: DailyActivityChartProps) {
  if (data.length === 0) {
    return (
      <div className={cn("flex h-64 items-center justify-center text-muted-foreground", className)}>
        데이터가 없습니다
      </div>
    );
  }

  // 최근 30일만 표시
  const recent = data.slice(-30);

  // 초 → 시간 변환
  const chartData = recent.map((d) => ({
    date: d.date,
    addedHours: +(d.addedSeconds / 3600).toFixed(1),
    subtractedHours: +(d.subtractedSeconds / 3600).toFixed(1),
  }));

  return (
    <div className={cn("h-64 w-full", className)} role="img" aria-label="일별 활동 그래프">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-foreground)" opacity={0.1} />
          <XAxis
            dataKey="date"
            tickFormatter={(d) => {
              const parts = d.split("-");
              return `${parts[1]}/${parts[2]}`;
            }}
            tick={{ fontSize: 11 }}
            stroke="var(--color-foreground)"
            opacity={0.4}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            stroke="var(--color-foreground)"
            opacity={0.4}
            width={40}
            tickFormatter={(v) => `${v}h`}
          />
          <Tooltip
            labelFormatter={(label) => label}
            formatter={(value, name) => {
              if (name === "addedHours") return [`${value}시간`, "추가"];
              return [`${value}시간`, "차감"];
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
              value === "addedHours" ? "추가" : "차감"
            }
          />
          <Bar dataKey="addedHours" fill="#22c55e" stackId="a" radius={[2, 2, 0, 0]} />
          <Bar dataKey="subtractedHours" fill="#ef4444" stackId="a" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
