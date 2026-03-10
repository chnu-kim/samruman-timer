"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { TimerCard } from "@/components/timer/TimerCard";
import { CreateTimerForm } from "@/components/timer/CreateTimerForm";
import { Button } from "@/components/ui/Button";
import type {
  ApiSuccessResponse,
  ProjectDetailResponse,
  TimerListItem,
  MeResponse,
} from "@/types";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [project, setProject] = useState<ProjectDetailResponse | null>(null);
  const [timers, setTimers] = useState<TimerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<MeResponse | null>(null);
  const [showForm, setShowForm] = useState(false);

  const fetchTimers = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/timers`);
      if (res.ok) {
        const json = (await res.json()) as ApiSuccessResponse<TimerListItem[]>;
        setTimers(json.data);
      }
    } catch {
      // ignore
    }
  }, [projectId]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (res.ok) {
          const json = (await res.json()) as ApiSuccessResponse<ProjectDetailResponse>;
          setProject(json.data);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }

    load();
    fetchTimers();
    fetch("/api/auth/me")
      .then(async (res) => {
        if (res.ok) {
          const json = (await res.json()) as { data: MeResponse };
          setUser(json.data);
        }
      })
      .catch(() => {});
  }, [projectId, fetchTimers]);

  // SCHEDULED 타이머가 있으면 30초마다 폴링하여 활성화 감지
  useEffect(() => {
    const hasScheduled = timers.some((t) => t.status === "SCHEDULED");
    if (!hasScheduled) return;
    const interval = setInterval(fetchTimers, 30_000);
    return () => clearInterval(interval);
  }, [timers, fetchTimers]);

  if (loading) {
    return (
      <section>
        <p className="text-foreground/60">로딩 중...</p>
      </section>
    );
  }

  if (!project) {
    return (
      <section>
        <p className="text-foreground/60">프로젝트를 찾을 수 없습니다.</p>
      </section>
    );
  }

  const isOwner = user?.id === project.owner.id;

  function handleCreateSuccess() {
    setShowForm(false);
    fetchTimers();
  }

  return (
    <section>
      <div>
        <h1 className="text-2xl font-bold">{project.name}</h1>
        {project.description && (
          <p className="mt-1 text-foreground/60">{project.description}</p>
        )}
        <p className="mt-1 text-sm text-foreground/40">
          {project.owner.nickname}
        </p>
        {isOwner && timers.length === 0 && (
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? "취소" : "새 타이머"}
          </Button>
        )}
      </div>

      {showForm && (
        <div className="mt-4 rounded-xl border border-foreground/20 p-5">
          <CreateTimerForm
            projectId={projectId}
            onSuccess={handleCreateSuccess}
          />
        </div>
      )}

      <div className="mt-6">
        {timers.length === 0 ? (
          <p className="text-foreground/60">타이머가 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {timers.map((timer) => (
              <TimerCard key={timer.id} timer={timer} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
