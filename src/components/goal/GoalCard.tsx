"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { GoalProgressBar } from "./GoalProgressBar";
import { formatDuration } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import type { GoalResponse } from "@/types";

interface GoalCardProps {
  goal: GoalResponse;
  projectId: string;
  isOwner: boolean;
  onUpdate?: () => void;
  compact?: boolean;
}

const statusLabel: Record<string, string> = {
  ACTIVE: "진행 중",
  COMPLETED: "달성",
  FAILED: "실패",
  CANCELLED: "취소",
};

const statusVariant: Record<string, "running" | "expired" | "scheduled" | "delete"> = {
  ACTIVE: "running",
  COMPLETED: "scheduled",
  FAILED: "expired",
  CANCELLED: "delete",
};

const typeLabel: Record<string, string> = {
  DURATION: "누적 시간",
  DEADLINE: "데드라인",
};

function formatDeadlineIn(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `D-${days}`;
  if (hours > 0) return `${hours}시간 남음`;
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}분 남음` : "곧 마감";
}

export function GoalCard({ goal, projectId, isOwner, onUpdate, compact = false }: GoalCardProps) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const isCompact = compact && !expanded;

  async function handleCancel() {
    setShowCancelDialog(false);
    setCancelling(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/goals/${goal.id}`, {
        method: "PATCH",
      });
      if (res.ok) {
        toast("목표가 취소되었습니다", "success");
        onUpdate?.();
      }
    } catch {
      // ignore
    } finally {
      setCancelling(false);
    }
  }

  if (isCompact) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-expanded={false}
        aria-label={`${goal.title} - ${statusLabel[goal.status]} ${goal.progress.percentage}% 상세 보기`}
        className="w-full rounded-lg border border-accent/20 bg-accent-light/5 px-3 py-2 text-left transition-colors hover:bg-accent-light/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-foreground truncate">{goal.title}</h3>
          <Badge variant={statusVariant[goal.status]}>{statusLabel[goal.status]}</Badge>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{goal.progress.percentage}%</span>
        </div>
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-accent/30 bg-accent-light/10 p-4">
      {compact ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-expanded={true}
          aria-label={`${goal.title} 접기`}
          className="w-full text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg -m-1 p-1"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-foreground truncate">{goal.title}</h3>
            <Badge variant={statusVariant[goal.status]}>{statusLabel[goal.status]}</Badge>
            <span className="text-xs text-muted-foreground">{typeLabel[goal.type]}</span>
          </div>
        </button>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-bold text-foreground truncate">{goal.title}</h3>
          <Badge variant={statusVariant[goal.status]}>{statusLabel[goal.status]}</Badge>
          <span className="text-xs text-muted-foreground">{typeLabel[goal.type]}</span>
        </div>
      )}

      <div className="mt-2">
        <GoalProgressBar percentage={goal.progress.percentage} status={goal.status} />
      </div>

      <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
        <span>{goal.progress.percentage}%</span>
        {goal.type === "DURATION" && goal.progress.currentSeconds != null && (
          <span>
            {formatDuration(goal.progress.currentSeconds)} / {formatDuration(goal.targetSeconds ?? 0)}
          </span>
        )}
        {goal.type === "DEADLINE" && goal.status === "ACTIVE" && goal.progress.deadlineIn != null && (
          <span>{formatDeadlineIn(goal.progress.deadlineIn)}</span>
        )}
      </div>

      {isOwner && goal.status === "ACTIVE" && (
        <div className="mt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCancelDialog(true)}
            disabled={cancelling}
            className="text-red-500 hover:text-red-400 hover:bg-red-500/10 dark:text-red-400 dark:hover:text-red-300"
          >
            취소
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={showCancelDialog}
        title="목표 취소"
        description="정말로 이 목표를 취소하시겠습니까? 취소된 목표는 다시 활성화할 수 없습니다."
        confirmLabel="취소하기"
        variant="danger"
        onConfirm={handleCancel}
        onCancel={() => setShowCancelDialog(false)}
      />
    </div>
  );
}
