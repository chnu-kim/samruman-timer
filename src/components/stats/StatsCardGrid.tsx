"use client";

import { StatsCard } from "./StatsCard";
import { formatDuration } from "@/lib/utils";
import type { StatsSummary } from "@/types";

interface StatsCardGridProps {
  summary: StatsSummary;
}

export function StatsCardGrid({ summary }: StatsCardGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      <StatsCard
        label="총 후원 시간"
        value={formatDuration(summary.totalAddedSeconds)}
        subtext={`${summary.totalAddedSeconds.toLocaleString()}초`}
      />
      <StatsCard
        label="총 차감 시간"
        value={formatDuration(summary.totalSubtractedSeconds)}
        subtext={`${summary.totalSubtractedSeconds.toLocaleString()}초`}
      />
      <StatsCard
        label="순 추가 시간"
        value={formatDuration(Math.abs(summary.netAddedSeconds))}
        subtext={summary.netAddedSeconds >= 0 ? "추가가 더 많음" : "차감이 더 많음"}
      />
      <StatsCard
        label="총 이벤트"
        value={summary.totalEvents.toLocaleString()}
        subtext="추가 + 차감"
      />
      <StatsCard
        label="후원자 수"
        value={summary.uniqueDonors.toLocaleString()}
        subtext="고유 닉네임 기준"
      />
      <StatsCard
        label="피크 시간대"
        value={summary.peakHour !== null ? `${summary.peakHour}시` : "—"}
        subtext={summary.peakHour !== null ? "가장 활발한 시간" : "데이터 없음"}
      />
    </div>
  );
}
