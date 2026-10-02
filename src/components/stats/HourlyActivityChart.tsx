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

/** 스크린리더용 차트 요약. 막대(추가+차감 횟수)가 가장 높은 시간대와 총 횟수를 알린다 */
export function summarizeHourly(data: HourlyDistribution[]): string {
  const total = data.reduce((sum, d) => sum + d.adds + d.subtracts, 0);
  if (total === 0) return "시간대별 이벤트 횟수 그래프, 기록 없음";
  const peak = data.reduce((best, d) =>
    d.adds + d.subtracts > best.adds + best.subtracts ? d : best,
  );
  return `시간대별 이벤트 횟수 그래프, 최다 ${peak.hour}시 ${peak.adds + peak.subtracts}회, 총 ${total}회`;
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
    <div className={cn("h-64 w-full", className)} role="img" aria-label={summarizeHourly(fullData)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={fullData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-foreground)" opacity={0.1} />
          <XAxis
            dataKey="hour"
            tickFormatter={(h) => `${h}시`}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            stroke="var(--color-border)"
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            stroke="var(--color-border)"
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
            labelStyle={{ color: "var(--color-foreground)" }}
          />
          <Bar dataKey="adds" fill="#22c55e" stackId="a" radius={[2, 2, 0, 0]} />
          <Bar dataKey="subtracts" fill="#ef4444" stackId="a" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
