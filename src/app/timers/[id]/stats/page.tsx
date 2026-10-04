"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { StatsCardGrid } from "@/components/stats/StatsCardGrid";
import { DonorRankingTable } from "@/components/stats/DonorRankingTable";
import { HourlyActivityChart } from "@/components/stats/HourlyActivityChart";
import { DailyActivityChart } from "@/components/stats/DailyActivityChart";
import { CumulativeChart } from "@/components/graph/CumulativeChart";
import { ErrorState } from "@/components/ui/ErrorState";
import { ChevronLeftIcon } from "@/components/ui/Icons";
import { StatsPageSkeleton } from "@/components/ui/Skeleton";
import { useDocumentTitle, APP_TITLE } from "@/hooks/useDocumentTitle";
import type {
  ApiSuccessResponse,
  TimerDetailResponse,
  TimerStatsResponse,
  CumulativeGraphPoint,
  GraphResponse,
} from "@/types";

export default function TimerStatsPage() {
  const params = useParams<{ id: string }>();
  const timerId = params.id;

  const [timer, setTimer] = useState<TimerDetailResponse | null>(null);
  const [stats, setStats] = useState<TimerStatsResponse | null>(null);
  // 누적 변경량은 보조 차트라 실패해도 통계 전체를 오류로 바꾸지 않고 해당 섹션만 숨긴다
  const [cumulative, setCumulative] = useState<CumulativeGraphPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // 다시 시도해도 결과가 같은 안내(권한 없음·찾을 수 없음). 재시도 대신 돌아갈 곳을 준다
  const [notice, setNotice] = useState<{ title: string; message: string; action: { href: string; label: string } } | null>(null);

  const fetchData = useCallback(async () => {
    // 같은 화면에서 다른 타이머를 다시 불러올 때 이전 결과의 안내·오류가 남지 않게 지운다
    setNotice(null);
    setError(false);
    try {
      const [timerRes, statsRes, cumulativeRes] = await Promise.all([
        fetch(`/api/timers/${timerId}`),
        fetch(`/api/timers/${timerId}/stats`),
        fetch(`/api/timers/${timerId}/graph?mode=cumulative`).catch(() => null),
      ]);

      if (statsRes.status === 401 || statsRes.status === 403) {
        // 타이머 조회는 공개라 소유자가 아니어도 프로젝트로 돌려보낼 수 있다
        const projectId = timerRes.ok
          ? ((await timerRes.json()) as ApiSuccessResponse<TimerDetailResponse>).data.projectId
          : null;
        setNotice({
          title: "통계를 볼 수 없습니다",
          message: "프로젝트 소유자만 통계를 볼 수 있습니다.",
          action: projectId
            ? { href: `/projects/${projectId}`, label: "프로젝트로 돌아가기" }
            : { href: "/projects", label: "프로젝트 목록으로" },
        });
        return;
      }

      if (statsRes.status === 404) {
        setNotice({
          title: "타이머를 찾을 수 없습니다",
          message: "삭제되었거나 주소가 잘못되었습니다.",
          action: { href: "/projects", label: "프로젝트 목록으로" },
        });
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
      if (cumulativeRes?.ok) {
        const graphJson = (await cumulativeRes.json()) as ApiSuccessResponse<GraphResponse>;
        if (graphJson.data.mode === "cumulative") setCumulative(graphJson.data.points);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [timerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useDocumentTitle(timer ? `${timer.projectName} 통계 · ${APP_TITLE}` : null);

  if (loading) {
    return (
      <section className="space-y-8">
        <StatsPageSkeleton />
      </section>
    );
  }

  if (notice) {
    return <ErrorState tone="neutral" {...notice} />;
  }

  if (error || !timer || !stats) {
    return (
      <ErrorState
        message="통계 데이터를 불러오는데 실패했습니다."
        onRetry={() => {
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
          href={`/projects/${timer.projectId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeftIcon className="w-4 h-4" />
          프로젝트로 돌아가기
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{timer.projectName} 통계</h1>
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

          {/* 누적 변경량 */}
          {cumulative && (
            <div>
              <h2 className="border-l-2 border-accent pl-3 text-lg font-bold">누적 변경량</h2>
              <div className="mt-4 rounded-xl border border-border bg-muted p-4">
                <CumulativeChart points={cumulative} />
              </div>
            </div>
          )}

          {/* 시간대별 활동 */}
          <div>
            <h2 className="border-l-2 border-accent pl-3 text-lg font-bold">시간대별 이벤트 횟수</h2>
            <div className="mt-4 rounded-xl border border-border bg-muted p-4">
              <HourlyActivityChart data={stats.hourlyDistribution} />
            </div>
          </div>

          {/* 일별 활동 */}
          <div>
            <h2 className="border-l-2 border-accent pl-3 text-lg font-bold">일별 활동 (최근 30일)</h2>
            <div className="mt-4 rounded-xl border border-border bg-muted p-4">
              <DailyActivityChart data={stats.dailyActivity} />
            </div>
          </div>
        </>
      )}
    </section>
  );
}
