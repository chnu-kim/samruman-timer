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
  ReferenceLine,
} from "recharts";
import { cn, durationAxisTicks, formatDuration, formatDurationTick } from "@/lib/utils";
import type { DailyActivity } from "@/types";

interface DailyActivityChartProps {
  data: DailyActivity[];
  className?: string;
}

const WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 마지막 기록일까지 days일을 빈 날은 0으로 채워 돌려준다.
 * 날짜는 서버가 KST로 묶은 'YYYY-MM-DD' 문자열이라 브라우저 시간대와 무관하게 UTC 날짜 연산만 한다.
 * 기록이 하루뿐이어도 축이 30칸이라 막대가 화면을 채우지 않고, 활동이 없던 날도 보인다.
 */
export function fillDailyWindow(data: DailyActivity[], days = WINDOW_DAYS): DailyActivity[] {
  if (data.length === 0) return [];
  const byDate = new Map(data.map((d) => [d.date, d]));
  const last = data.reduce((max, d) => (d.date > max ? d.date : max), data[0].date);
  const [y, m, d] = last.split("-").map(Number);
  const end = Date.UTC(y, m - 1, d);
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(end - (days - 1 - i) * DAY_MS).toISOString().slice(0, 10);
    return byDate.get(date) ?? { date, eventCount: 0, addedSeconds: 0, subtractedSeconds: 0 };
  });
}

/**
 * 0을 사이에 두고 위(추가)·아래(차감)로 같은 간격의 눈금을 만든다.
 * 간격은 두 방향을 합친 폭으로 고르고(콘솔 그래프와 같은 durationAxisTicks), 양쪽을 그 간격으로 늘린다.
 */
export function signedDurationTicks(maxUp: number, maxDown: number): number[] {
  const base = durationAxisTicks(maxUp + maxDown);
  const step = base.length > 1 ? base[1] - base[0] : 3600;
  const up = Math.max(1, Math.ceil(maxUp / step));
  const down = Math.ceil(maxDown / step);
  return Array.from({ length: up + down + 1 }, (_, i) => (i - down) * step);
}

/** 축 눈금 라벨. 차감 쪽은 '-30분'처럼 부호를 붙인다 */
export function formatSignedDurationTick(seconds: number, ticks: number[]): string {
  const label = formatDurationTick(Math.abs(seconds), ticks);
  return seconds < 0 ? `-${label}` : label;
}

function formatMonthDay(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
}

/**
 * 스크린리더용 차트 요약. 표시 기간과 추가·차감 합계, 추가가 가장 많은 날을 알린다.
 * 창은 오늘이 아니라 마지막 기록일에서 끝나므로 기간을 날짜로 밝힌다.
 */
export function summarizeDaily(data: DailyActivity[]): string {
  const active = data.filter((d) => d.eventCount > 0 || d.addedSeconds > 0 || d.subtractedSeconds > 0);
  if (active.length === 0) return "일별 활동 그래프, 기록 없음";
  const added = active.reduce((sum, d) => sum + d.addedSeconds, 0);
  const subtracted = active.reduce((sum, d) => sum + d.subtractedSeconds, 0);
  const peak = active.reduce((best, d) => (d.addedSeconds > best.addedSeconds ? d : best));
  const peakText = peak.addedSeconds > 0
    ? `, 추가 최다 ${formatMonthDay(peak.date)} ${formatDuration(peak.addedSeconds)}`
    : "";
  const range = `${formatMonthDay(data[0].date)}~${formatMonthDay(data[data.length - 1].date)}`;
  return `일별 활동 그래프(${range}, 기록 있는 날 ${active.length}일), 추가 합계 ${formatDuration(added)}, 차감 합계 ${formatDuration(subtracted)}${peakText}`;
}

export function DailyActivityChart({ data, className }: DailyActivityChartProps) {
  if (data.length === 0) {
    return (
      <div className={cn("flex h-64 items-center justify-center text-muted-foreground", className)}>
        데이터가 없습니다
      </div>
    );
  }

  const days = fillDailyWindow(data);

  // 차감은 0선 아래 음수로 그려 색이 아니라 위치로도 추가와 구분되게 한다
  const chartData = days.map((d) => ({
    date: d.date,
    added: d.addedSeconds,
    subtracted: -d.subtractedSeconds,
  }));
  const ticks = signedDurationTicks(
    Math.max(...days.map((d) => d.addedSeconds)),
    Math.max(...days.map((d) => d.subtractedSeconds)),
  );

  return (
    <div className={cn("h-64 w-full", className)} role="img" aria-label={summarizeDaily(days)}>
      <ResponsiveContainer width="100%" height="100%">
        {/* stackOffset="sign": 같은 날의 추가는 0선 위로, 차감은 0선 아래로 갈라진다(합이 아니다) */}
        <BarChart
          data={chartData}
          stackOffset="sign"
          margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
          accessibilityLayer={false}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-foreground)" opacity={0.1} />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => {
              const parts = d.split("-");
              return `${parts[1]}/${parts[2]}`;
            }}
            minTickGap={16}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            stroke="var(--color-border)"
          />
          <YAxis
            domain={[ticks[0], ticks[ticks.length - 1]]}
            ticks={ticks}
            tickFormatter={(v: number) => formatSignedDurationTick(v, ticks)}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            stroke="var(--color-border)"
            width={52}
          />
          <ReferenceLine y={0} stroke="var(--color-muted-foreground)" />
          <Tooltip
            labelFormatter={(label) => formatMonthDay(String(label))}
            formatter={(value, name) =>
              name === "added"
                ? [`+${formatDuration(Number(value))}`, "추가"]
                : [`-${formatDuration(Math.abs(Number(value)))}`, "차감"]
            }
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
            formatter={(value: string) => (value === "added" ? "+ 추가" : "- 차감")}
            wrapperStyle={{ fontSize: "12px" }}
            labelStyle={{ color: "var(--color-foreground)" }}
          />
          <Bar dataKey="added" stackId="day" fill="#22c55e" maxBarSize={24} radius={[2, 2, 0, 0]} />
          <Bar dataKey="subtracted" stackId="day" fill="#ef4444" maxBarSize={24} radius={[0, 0, 2, 2]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
