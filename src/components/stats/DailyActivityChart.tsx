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

/** 스크린리더용 차트 요약. 표시 중인 기간과 추가·차감 합계, 추가가 가장 많은 날을 알린다 */
export function summarizeDaily(data: DailyActivity[]): string {
  if (data.length === 0) return "일별 활동 그래프, 기록 없음";
  const added = data.reduce((sum, d) => sum + d.addedSeconds, 0);
  const subtracted = data.reduce((sum, d) => sum + d.subtractedSeconds, 0);
  const peak = data.reduce((best, d) => (d.addedSeconds > best.addedSeconds ? d : best));
  const [, month, day] = peak.date.split("-");
  const peakText = peak.addedSeconds > 0
    ? `, 추가 최다 ${Number(month)}월 ${Number(day)}일 ${formatDuration(peak.addedSeconds)}`
    : "";
  return `일별 활동 그래프(${data.length}일), 추가 합계 ${formatDuration(added)}, 차감 합계 ${formatDuration(subtracted)}${peakText}`;
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
    <div className={cn("h-64 w-full", className)} role="img" aria-label={summarizeDaily(recent)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-foreground)" opacity={0.1} />
          <XAxis
            dataKey="date"
            tickFormatter={(d) => {
              const parts = d.split("-");
              return `${parts[1]}/${parts[2]}`;
            }}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            stroke="var(--color-border)"
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            stroke="var(--color-border)"
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
            labelStyle={{ color: "var(--color-foreground)" }}
          />
          {/* 추가와 차감은 시간이 반대 방향이라 쌓으면 막대 높이가 의미 없는 합이 되므로 나란히 둔다 */}
          <Bar dataKey="addedHours" fill="#22c55e" radius={[2, 2, 0, 0]} />
          <Bar dataKey="subtractedHours" fill="#ef4444" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
