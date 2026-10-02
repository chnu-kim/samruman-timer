"use client";

import { cn, formatDuration } from "@/lib/utils";
import type { TopDonor } from "@/types";

interface DonorRankingTableProps {
  donors: TopDonor[];
  className?: string;
}

const RANK_MEDALS = ["🥇", "🥈", "🥉"];

export function DonorRankingTable({ donors, className }: DonorRankingTableProps) {
  if (donors.length === 0) {
    return (
      <div className={cn("flex h-32 items-center justify-center text-muted-foreground", className)}>
        후원 데이터가 없습니다
      </div>
    );
  }

  return (
    <div className={className}>
      {/* 데스크톱: 테이블 */}
      <div className="hidden md:block overflow-x-auto">
        {/* 넓은 화면에서 닉네임과 시간 사이가 벌어지지 않게 폭을 제한한다 */}
        <table className="w-full max-w-2xl text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="pb-2 pr-4 font-medium w-12">순위</th>
              <th className="pb-2 pr-4 font-medium">닉네임</th>
              <th className="pb-2 pr-4 font-medium text-right">후원 시간</th>
              <th className="pb-2 font-medium text-right">이벤트 수</th>
            </tr>
          </thead>
          <tbody>
            {donors.map((donor, i) => (
              <tr key={donor.actorName} className="border-b border-border/50">
                <td className="py-2.5 pr-4 whitespace-nowrap">
                  {i < 3 ? (
                    <span className="text-base">{RANK_MEDALS[i]}</span>
                  ) : (
                    <span className="text-muted-foreground">{i + 1}</span>
                  )}
                </td>
                <td className="py-2.5 pr-4 font-medium">{donor.actorName}</td>
                <td className="py-2.5 pr-4 text-right font-mono text-xs text-green-700 dark:text-green-400">
                  +{formatDuration(donor.totalSeconds)}
                </td>
                <td className="py-2.5 text-right text-muted-foreground">
                  {donor.eventCount}회
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 모바일: 카드 뷰 */}
      <div className="md:hidden space-y-3">
        {donors.map((donor, i) => (
          <div
            key={donor.actorName}
            className="rounded-lg border border-border p-3 space-y-1"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">
                  {i < 3 ? RANK_MEDALS[i] : `${i + 1}위`}
                </span>
                <span className="font-medium">{donor.actorName}</span>
              </div>
              <span className="text-xs text-muted-foreground">{donor.eventCount}회</span>
            </div>
            <p className="font-mono text-sm text-green-700 dark:text-green-400">
              +{formatDuration(donor.totalSeconds)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
