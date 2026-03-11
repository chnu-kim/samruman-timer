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
  ProjectDetailResponse,
  ProjectStatsResponse,
} from "@/types";

export default function ProjectStatsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [project, setProject] = useState<ProjectDetailResponse | null>(null);
  const [stats, setStats] = useState<ProjectStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [projectRes, statsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/stats`),
      ]);

      if (statsRes.status === 401 || statsRes.status === 403) {
        setError(true);
        setErrorMessage("프로젝트 소유자만 통계를 볼 수 있습니다.");
        return;
      }

      if (!projectRes.ok || !statsRes.ok) {
        setError(true);
        return;
      }

      const projectJson = (await projectRes.json()) as ApiSuccessResponse<ProjectDetailResponse>;
      const statsJson = (await statsRes.json()) as ApiSuccessResponse<ProjectStatsResponse>;

      setProject(projectJson.data);
      setStats(statsJson.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

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

  if (error || !project || !stats) {
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
          href={`/projects/${projectId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeftIcon className="w-4 h-4" />
          프로젝트로 돌아가기
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{project.name} 통계</h1>
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
