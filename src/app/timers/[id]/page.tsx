"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ErrorState } from "@/components/ui/ErrorState";
import { ProjectDetailSkeleton } from "@/components/ui/Skeleton";
import type { ApiSuccessResponse, TimerDetailResponse } from "@/types";

// 타이머 조작은 프로젝트 화면(/projects/[id])으로 합쳤다. 예전에 공유한 타이머 주소가 계속 열리도록
// 상위 프로젝트로 보낸다. OBS 오버레이(/timers/[id]/overlay)와 통계(/timers/[id]/stats)는 그대로다
export default function TimerRedirectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const timerId = params.id;
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);

  const resolve = useCallback(async () => {
    setError(false);
    try {
      const res = await fetch(`/api/timers/${timerId}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) {
        setError(true);
        return;
      }
      const json = (await res.json()) as ApiSuccessResponse<TimerDetailResponse>;
      router.replace(`/projects/${json.data.projectId}`);
    } catch {
      setError(true);
    }
  }, [timerId, router]);

  useEffect(() => {
    resolve();
  }, [resolve]);

  if (notFound) {
    return <ErrorState message="타이머를 찾을 수 없습니다. 삭제되었거나 주소가 잘못되었습니다." />;
  }

  if (error) {
    return <ErrorState message="타이머 정보를 불러오지 못했습니다." onRetry={resolve} />;
  }

  return <ProjectDetailSkeleton />;
}
