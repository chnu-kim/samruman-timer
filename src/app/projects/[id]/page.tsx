"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { TimerCard } from "@/components/timer/TimerCard";
import { CreateTimerForm } from "@/components/timer/CreateTimerForm";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EditableText } from "@/components/ui/EditableText";
import { ErrorState } from "@/components/ui/ErrorState";
import { PlusIcon, TimerIcon, TrashIcon, LinkIcon, ChartBarIcon } from "@/components/ui/Icons";
import { TimerCardGridSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import Link from "next/link";
import type {
  ApiSuccessResponse,
  ProjectDetailResponse,
  TimerListItem,
  MeResponse,
} from "@/types";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const projectId = params.id;

  const [project, setProject] = useState<ProjectDetailResponse | null>(null);
  const [timers, setTimers] = useState<TimerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [user, setUser] = useState<MeResponse | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (res.ok) {
        const json = (await res.json()) as ApiSuccessResponse<ProjectDetailResponse>;
        setProject(json.data);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    }
  }, [projectId]);

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
      await fetchProject();
      setLoading(false);
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
  }, [projectId, fetchProject, fetchTimers]);

  useEffect(() => {
    const hasScheduled = timers.some((t) => t.status === "SCHEDULED");
    if (!hasScheduled) return;
    const interval = setInterval(fetchTimers, 30_000);
    return () => clearInterval(interval);
  }, [timers, fetchTimers]);

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href);
    toast("링크가 복사되었습니다", "success");
  }

  async function handleSaveName(name: string) {
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error();
    const json = (await res.json()) as ApiSuccessResponse<ProjectDetailResponse>;
    setProject(json.data);
    toast("프로젝트 이름이 수정되었습니다", "success");
  }

  async function handleSaveDescription(description: string) {
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });
    if (!res.ok) throw new Error();
    const json = (await res.json()) as ApiSuccessResponse<ProjectDetailResponse>;
    setProject(json.data);
    toast("프로젝트 설명이 수정되었습니다", "success");
  }

  if (loading) {
    return (
      <section className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
        <TimerCardGridSkeleton count={3} />
      </section>
    );
  }

  if (error || !project) {
    return (
      <ErrorState
        message="프로젝트를 찾을 수 없습니다."
        onRetry={async () => { setError(false); setLoading(true); await fetchProject(); setLoading(false); }}
      />
    );
  }

  const isOwner = user?.id === project.owner.id;

  function handleCreateSuccess() {
    setShowForm(false);
    fetchTimers();
  }

  async function handleDelete() {
    setShowDeleteDialog(false);
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/projects");
      } else {
        setDeleting(false);
      }
    } catch {
      setDeleting(false);
    }
  }

  return (
    <section>
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <EditableText
              value={project.name}
              onSave={handleSaveName}
              editable={isOwner}
              as="h1"
              className="text-2xl font-bold"
            />
            {(project.description || isOwner) && (
              <EditableText
                value={project.description || ""}
                onSave={handleSaveDescription}
                editable={isOwner}
                as="p"
                className="mt-1 text-muted-foreground"
                placeholder="설명 추가..."
              />
            )}
            <p className="mt-1 text-sm text-muted-foreground">
              {project.owner.nickname}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0 mt-1">
            <Link
              href={`/projects/${projectId}/stats`}
              aria-label="통계"
              title="통계"
              className="rounded-lg p-1.5 min-h-11 min-w-11 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChartBarIcon className="w-5 h-5" />
            </Link>
            <button
              onClick={handleCopyLink}
              aria-label="링크 복사"
              title="링크 복사"
              className="rounded-lg p-1.5 min-h-11 min-w-11 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LinkIcon className="w-5 h-5" />
            </button>
            {isOwner && (
              <button
                disabled={deleting}
                aria-label="프로젝트 삭제"
                title="프로젝트 삭제"
                onClick={() => setShowDeleteDialog(true)}
                className={
                  deleting
                    ? "rounded-lg p-1.5 min-h-11 min-w-11 flex items-center justify-center opacity-50 cursor-not-allowed"
                    : "rounded-lg p-1.5 min-h-11 min-w-11 flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                }
              >
                <TrashIcon className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
        {isOwner && (timers.length > 0 || showForm) && (
          <Button
            variant={showForm ? "secondary" : "primary"}
            size="sm"
            className="mt-3"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? (
              "취소"
            ) : (
              <>
                <PlusIcon className="w-4 h-4 mr-1" />
                새 타이머
              </>
            )}
          </Button>
        )}
      </div>

      {showForm && (
        <div
          className="mt-4 rounded-xl border border-accent/30 bg-accent-light/20 p-5"
          style={{ animation: "fade-in 0.2s ease-out" }}
        >
          <h2 className="text-sm font-bold text-foreground mb-4">새 타이머 만들기</h2>
          <CreateTimerForm
            projectId={projectId}
            onSuccess={handleCreateSuccess}
          />
        </div>
      )}

      <div className="mt-6">
        {timers.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <TimerIcon className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="mt-4 text-muted-foreground">아직 타이머가 없습니다.</p>
            {isOwner && !showForm && (
              <Button
                size="sm"
                className="mt-4"
                onClick={() => setShowForm(true)}
              >
                <PlusIcon className="w-4 h-4 mr-1" />
                첫 타이머 만들기
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {timers.map((timer) => (
              <TimerCard key={timer.id} timer={timer} />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={showDeleteDialog}
        title="프로젝트 삭제"
        description="정말로 이 프로젝트를 삭제하시겠습니까? 하위 타이머도 함께 삭제됩니다."
        confirmLabel="삭제"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </section>
  );
}
