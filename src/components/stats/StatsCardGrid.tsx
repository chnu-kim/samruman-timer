"use client";

import { StatsCard } from "./StatsCard";
import { formatDuration } from "@/lib/utils";
import type { StatsSummary } from "@/types";

interface StatsCardGridProps {
  summary: StatsSummary;
}

/** 순 추가 시간은 부호로 방향을 보인다. 0이면 부호를 붙이지 않는다 */
export function formatNetDuration(seconds: number): string {
  const text = formatDuration(Math.abs(seconds));
  if (seconds > 0) return `+${text}`;
  if (seconds < 0) return `-${text}`;
  return text;
}

// 숫자만 봐도 아는 보조문구('추가가 더 많음', '추가 + 차감', '가장 활발한 시간')는 두지 않는다
export function StatsCardGrid({ summary }: StatsCardGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      <StatsCard
        label="총 추가 시간"
        value={formatDuration(summary.totalAddedSeconds)}
      />
      <StatsCard
        label="총 차감 시간"
        value={formatDuration(summary.totalSubtractedSeconds)}
      />
      <StatsCard
        label="순 추가 시간"
        value={formatNetDuration(summary.netAddedSeconds)}
      />
      <StatsCard
        label="변경 횟수"
        value={summary.totalEvents.toLocaleString()}
      />
      <StatsCard
        label="시청자 수"
        value={summary.uniqueDonors.toLocaleString()}
        subtext="고유 닉네임 기준"
      />
      <StatsCard
        label="피크 시간대"
        value={summary.peakHour !== null ? `${summary.peakHour}시` : "—"}
      />
    </div>
  );
}
