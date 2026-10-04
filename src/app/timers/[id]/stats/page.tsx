"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
import { fireSessionExpired } from "@/lib/session-expired";
import type {
  ApiErrorResponse,
  ApiSuccessResponse,
  TimerDetailResponse,
  TimerStatsResponse,
  CumulativeGraphPoint,
  GraphResponse,
} from "@/types";

type Notice = {
  title: string;
  message: string;
  action: { href: string; label: string };
  /** 탭 제목. 안내 화면도 '타이머 통계'로 남지 않게 상태를 적는다 */
  documentTitle: string;
};

const BLOCKED_TITLE = `통계를 볼 수 없음 | ${APP_TITLE}`;

function backLink(projectId: string | null) {
  return projectId
    ? { href: `/projects/${projectId}`, label: "프로젝트로 돌아가기" }
    : { href: "/projects", label: "프로젝트 목록으로" };
}

export default function TimerStatsPage() {
  const params = useParams<{ id: string }>();
  const timerId = params.id;

  const [timer, setTimer] = useState<TimerDetailResponse | null>(null);
  const [stats, setStats] = useState<TimerStatsResponse | null>(null);
  // 누적 변경량은 보조 차트라 실패해도 통계 전체를 오류로 바꾸지 않고 해당 섹션만 숨긴다
  const [cumulative, setCumulative] = useState<CumulativeGraphPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // 로드 실패 화면에서도 돌아갈 프로젝트를 가리키도록 타이머 조회가 성공했으면 기억한다
  const [errorProjectId, setErrorProjectId] = useState<string | null>(null);
  // 다시 시도해도 결과가 같은 안내(로그인 필요·권한 없음·찾을 수 없음). 재시도 대신 돌아갈 곳을 준다
  const [notice, setNotice] = useState<Notice | null>(null);

  // 같은 화면에서 id가 바뀌면 늦게 도착한 이전 요청이 새 결과를 덮어쓰지 않도록 가장 최근 요청만 반영한다
  const requestSeq = useRef(0);

  const fetchData = useCallback(async () => {
    const seq = ++requestSeq.current;
    const stale = () => seq !== requestSeq.current;
    // 이전 타이머의 데이터·안내·오류가 새 주소에 남지 않게 지우고 다시 로딩 상태로 둔다
    setLoading(true);
    setNotice(null);
    setError(false);
    setErrorProjectId(null);
    setTimer(null);
    setStats(null);
    setCumulative(null);
    try {
      const [timerRes, statsRes, cumulativeRes] = await Promise.all([
        fetch(`/api/timers/${timerId}`),
        fetch(`/api/timers/${timerId}/stats`),
        fetch(`/api/timers/${timerId}/graph?mode=cumulative`).catch(() => null),
      ]);
      if (stale()) return;

      // 타이머 조회는 공개라 로그인·소유와 무관하게 돌아갈 프로젝트를 알 수 있다
      const timerJson = timerRes.ok ? ((await timerRes.json()) as ApiSuccessResponse<TimerDetailResponse>) : null;
      const projectId = timerJson?.data.projectId ?? null;
      if (stale()) return;

      // 401은 미들웨어가 라우트의 404 판별보다 먼저 내므로 없는 id여도 로그인 안내가 먼저다
      if (statsRes.status === 401) {
        const body = (await statsRes.json().catch(() => null)) as ApiErrorResponse | null;
        if (stale()) return;
        // refresh 쿠키가 있었는데 거부됐으면 세션 만료다. 로그인 화면으로 보내는 흐름은 SessionExpiredHandler가 맡고,
        // 이동 전 잠깐 보이는 화면은 로그아웃 상태와 같은 안내를 쓴다
        if (body?.error?.code === "SESSION_EXPIRED") fireSessionExpired();
        setNotice({
          title: "로그인이 필요합니다",
          message: "로그인한 뒤 내 프로젝트의 통계를 볼 수 있습니다.",
          action: backLink(projectId),
          documentTitle: BLOCKED_TITLE,
        });
        return;
      }

      if (statsRes.status === 403) {
        setNotice({
          title: "통계를 볼 수 없습니다",
          message: "프로젝트 소유자만 통계를 볼 수 있습니다.",
          action: backLink(projectId),
          documentTitle: BLOCKED_TITLE,
        });
        return;
      }

      if (statsRes.status === 404) {
        setNotice({
          title: "타이머를 찾을 수 없습니다",
          message: "삭제되었거나 주소가 잘못되었습니다.",
          action: { href: "/projects", label: "프로젝트 목록으로" },
          documentTitle: `찾을 수 없음 | ${APP_TITLE}`,
        });
        return;
      }

      if (!timerJson || !statsRes.ok) {
        setErrorProjectId(projectId);
        setError(true);
        return;
      }

      const statsJson = (await statsRes.json()) as ApiSuccessResponse<TimerStatsResponse>;
      const graphJson = cumulativeRes?.ok ? ((await cumulativeRes.json()) as ApiSuccessResponse<GraphResponse>) : null;
      if (stale()) return;

      setTimer(timerJson.data);
      setStats(statsJson.data);
      if (graphJson?.data.mode === "cumulative") setCumulative(graphJson.data.points);
    } catch {
      if (!stale()) setError(true);
    } finally {
      if (!stale()) setLoading(false);
    }
  }, [timerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useDocumentTitle(timer ? `${timer.projectName} 통계 · ${APP_TITLE}` : (notice?.documentTitle ?? null));

  if (loading) {
    return (
      <section className="space-y-8">
        <StatsPageSkeleton />
      </section>
    );
  }

  if (notice) {
    const { title, message, action } = notice;
    return <ErrorState tone="neutral" title={title} message={message} action={action} />;
  }

  if (error || !timer || !stats) {
    // 다시 시도할 수 있는 실패라 화면 제목과 돌아갈 경로는 그대로 두고 본문만 오류로 바꾼다
    const back = backLink(errorProjectId);
    return (
      <section className="space-y-8">
        <StatsHeader href={back.href} label={back.label} title="통계" />
        <ErrorState
          message="통계를 불러오지 못했습니다."
          onRetry={() => {
            setError(false);
            setLoading(true);
            fetchData();
          }}
        />
      </section>
    );
  }

  const hasData = stats.summary.totalEvents > 0;

  return (
    <section className="space-y-8">
      <StatsHeader href={`/projects/${timer.projectId}`} label="프로젝트로 돌아가기" title={`${timer.projectName} 통계`} />

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

          {/* 상위 시청자 */}
          <div>
            <h2 className="border-l-2 border-accent pl-3 text-lg font-bold">상위 시청자</h2>
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
            <h2 className="border-l-2 border-accent pl-3 text-lg font-bold">시간대별 변경 횟수</h2>
            <div className="mt-4 rounded-xl border border-border bg-muted p-4">
              <HourlyActivityChart data={stats.hourlyDistribution} />
            </div>
          </div>

          {/* 일별 활동 */}
          <div>
            {/* 30일 창은 마지막 기록일에서 끝난다. 오래된 타이머를 '최근'으로 오해하지 않게 기간은 축의 날짜로 보인다 */}
            <h2 className="border-l-2 border-accent pl-3 text-lg font-bold">일별 활동 (30일)</h2>
            <div className="mt-4 rounded-xl border border-border bg-muted p-4">
              <DailyActivityChart data={stats.dailyActivity} />
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function StatsHeader({ href, label, title }: { href: string; label: string; title: string }) {
  return (
    <div>
      <Link
        href={href}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeftIcon className="w-4 h-4" />
        {label}
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{title}</h1>
    </div>
  );
}
