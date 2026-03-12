"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { StatsCardGrid } from "@/components/stats/StatsCardGrid";
import { DonorRankingTable } from "@/components/stats/DonorRankingTable";
import { HourlyActivityChart } from "@/components/stats/HourlyActivityChart";
import { DailyActivityChart } from "@/components/stats/DailyActivityChart";
import { ErrorState } from "@/components/ui/ErrorState";
import { ChevronLeftIcon } from "@/components/ui/Icons";
import { StatsPageSkeleton } from "@/components/ui/Skeleton";
import type {
  ApiSuccessResponse,
  TimerDetailResponse,
  TimerStatsResponse,
} from "@/types";

export default function TimerStatsPage() {
  const params = useParams<{ id: string }>();
  const timerId = params.id;

  const [timer, setTimer] = useState<TimerDetailResponse | null>(null);
  const [stats, setStats] = useState<TimerStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [timerRes, statsRes] = await Promise.all([
        fetch(`/api/timers/${timerId}`),
        fetch(`/api/timers/${timerId}/stats`),
      ]);

      if (statsRes.status === 401 || statsRes.status === 403) {
        setError(true);
        setErrorMessage("프로젝트 소유자만 통계를 볼 수 있습니다.");
        return;
      }

      if (!timerRes.ok || !statsRes.ok) {
        setError(true);
        return;
      }

      const timerJson = (await timerRes.json()) as ApiSuccessResponse<TimerDetailResponse>;
      const statsJson = (await statsRes.json()) as ApiSuccessResponse<TimerStatsResponse>;

      setTimer(timerJson.data);
      setStats(statsJson.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [timerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <section className="space-y-8">
        <StatsPageSkeleton />
      </section>
    );
  }

  if (error || !timer || !stats) {
    return (
      <ErrorState
        message={errorMessage || "통계 데이터를 불러오는데 실패했습니다."}
        onRetry={errorMessage ? undefined : () => {
          setError(false);
          setLoading(true);
          fetchData();
        }}
      />
    );
  }

  const hasData = stats.summary.totalEvents > 0;

  return (
    <section className="space-y-8">
      {/* 헤더 */}
      <div>
        <Link
          href={`/timers/${timerId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeftIcon className="w-4 h-4" />
          타이머로 돌아가기
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{timer.title} 통계</h1>
      </div>

      {!hasData ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground">
            아직 타이머 활동 기록이 없습니다.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            타이머에 시간이 추가되거나 차감되면 통계가 표시됩니다.
          </p>
        </div>
      ) : (
        <>
          {/* KPI 카드 */}
          <StatsCardGrid summary={stats.summary} />

          {/* 상위 후원자 */}
          <div>
            <h2 className="border-l-2 border-accent pl-3 text-lg font-bold">상위 후원자</h2>
            <DonorRankingTable donors={stats.topDonors} className="mt-4" />
          </div>

          {/* 시간대별 활동 */}
          <div>
            <h2 className="border-l-2 border-accent pl-3 text-lg font-bold">시간대별 활동</h2>
            <div className="mt-4 rounded-xl border border-border bg-muted p-4">
              <HourlyActivityChart data={stats.hourlyDistribution} />
            </div>
          </div>

          {/* 일별 활동 */}
          <div>
            <h2 className="border-l-2 border-accent pl-3 text-lg font-bold">일별 활동</h2>
            <div className="mt-4 rounded-xl border border-border bg-muted p-4">
              <DailyActivityChart data={stats.dailyActivity} />
            </div>
          </div>
        </>
      )}
    </section>
  );
}
