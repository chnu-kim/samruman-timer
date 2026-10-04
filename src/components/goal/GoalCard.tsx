"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { MoreMenu, type MoreMenuItem } from "@/components/ui/MoreMenu";
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

const statusVariant: Record<string, "running" | "expired" | "completed" | "delete"> = {
  ACTIVE: "running",
  COMPLETED: "completed",
  FAILED: "expired",
  CANCELLED: "delete",
};

const typeLabel: Record<string, string> = {
  DURATION: "방송 시간",
  DEADLINE: "데드라인",
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 마감 시각을 '10. 05 (일) 00:00' 형식으로. 데드라인 목표에서 퍼센트 대신 보여 주는 핵심 정보다 */
export function formatDeadlineAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}. ${pad(d.getDate())} (${WEEKDAYS[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDeadlineIn(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `D-${days}`;
  if (hours > 0) return `${hours}시간 남음`;
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}분 남음` : "곧 마감";
}

/** 접힌 카드 오른쪽의 요약. 데드라인은 퍼센트보다 마감 시각이 뜻이 있다 */
function summaryText(goal: GoalResponse): string {
  if (goal.type === "DEADLINE" && goal.targetDatetime) return formatDeadlineAt(goal.targetDatetime);
  return `${goal.progress.percentage}%`;
}

export function GoalCard({ goal, projectId, isOwner, onUpdate, compact = false }: GoalCardProps) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
      } else {
        toast("목표 취소에 실패했습니다", "error");
      }
    } catch {
      toast("목표 취소에 실패했습니다", "error");
    } finally {
      setCancelling(false);
    }
  }

  async function handleDelete() {
    setShowDeleteDialog(false);
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/goals/${goal.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast("목표가 삭제되었습니다", "success");
        onUpdate?.();
      } else {
        toast("목표 삭제에 실패했습니다", "error");
      }
    } catch {
      toast("목표 삭제에 실패했습니다", "error");
    } finally {
      setDeleting(false);
    }
  }

  // 진행 중이면 '목표 취소'(기록은 남는다), 실패·취소로 끝났으면 '삭제'(기록에서 사라진다).
  // 달성한 목표는 기록으로 남기므로 고칠 동작이 없다
  const menuItems: MoreMenuItem[] = [];
  if (isOwner && goal.status === "ACTIVE") {
    menuItems.push({ label: "목표 취소", onSelect: () => setShowCancelDialog(true), danger: true, disabled: cancelling });
  } else if (isOwner && (goal.status === "FAILED" || goal.status === "CANCELLED")) {
    menuItems.push({ label: "삭제", onSelect: () => setShowDeleteDialog(true), danger: true, disabled: deleting });
  }
  const menu = menuItems.length > 0 && (
    <MoreMenu label={`${goal.title} 더보기`} items={menuItems} className="shrink-0" />
  );

  const dialogs = (
    <>
      <ConfirmDialog
        open={showCancelDialog}
        title="목표 취소"
        description="취소한 목표는 종료 탭에 기록으로 남고, 다시 진행할 수 없습니다."
        confirmLabel="목표 취소"
        variant="danger"
        onConfirm={handleCancel}
        onCancel={() => setShowCancelDialog(false)}
      />

      <ConfirmDialog
        open={showDeleteDialog}
        title="목표 삭제"
        description="이 목표가 기록에서 사라집니다. 되돌릴 수 없습니다."
        confirmLabel="목표 삭제"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </>
  );

  // 진행 중 탭에서는 탭 이름이 이미 상태라 배지를 반복하지 않는다. 종료 탭의 달성·실패·취소만 보인다
  const badge = goal.status !== "ACTIVE" && (
    <Badge variant={statusVariant[goal.status]} className="shrink-0">{statusLabel[goal.status]}</Badge>
  );

  if (isCompact) {
    return (
      <div className="flex items-center border-b border-border/50 py-1 transition-colors last:border-b-0 hover:bg-foreground/5">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          aria-label={`${goal.title} - ${statusLabel[goal.status]} ${summaryText(goal)} 상세 보기`}
          className="min-w-0 flex-1 rounded-lg px-3 py-2 min-h-11 text-left"
        >
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-foreground truncate">{goal.title}</h3>
            {badge}
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">{summaryText(goal)}</span>
          </div>
        </button>
        {menu}
        {dialogs}
      </div>
    );
  }

  const isDeadline = goal.type === "DEADLINE";

  return (
    <div className="border-b border-border/50 py-4 last:border-b-0">
      <div className="flex items-center gap-2">
        {compact ? (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-expanded={true}
            aria-label={`${goal.title} 접기`}
            className="min-w-0 flex-1 text-left cursor-pointer rounded-lg -m-1 p-1"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-foreground truncate">{goal.title}</h3>
              {badge}
              <span className="shrink-0 text-xs text-muted-foreground">{typeLabel[goal.type]}</span>
            </div>
          </button>
        ) : (
          <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-foreground truncate">{goal.title}</h3>
            {badge}
            <span className="shrink-0 text-xs text-muted-foreground">{typeLabel[goal.type]}</span>
          </div>
        )}
        {/* 44px 히트 영역은 유지하되 제목 줄 높이는 늘리지 않는다 */}
        {menu && <div className="-my-3 -mr-2">{menu}</div>}
      </div>

      <div className="mt-2">
        <GoalProgressBar percentage={goal.progress.percentage} status={goal.status} />
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {!isDeadline && <span>{goal.progress.percentage}%</span>}
        {!isDeadline && goal.progress.currentSeconds != null && (
          <span>
            방송 {formatDuration(goal.progress.currentSeconds)} 경과 / {formatDuration(goal.targetSeconds ?? 0)}
          </span>
        )}
        {isDeadline && goal.targetDatetime && (
          <span>
            {formatDeadlineAt(goal.targetDatetime)}
            {goal.status === "ACTIVE" && goal.progress.deadlineIn != null && ` · ${formatDeadlineIn(goal.progress.deadlineIn)}`}
          </span>
        )}
        {isDeadline && goal.status === "ACTIVE" && goal.progress.deadlineAfterTimerEnd && (
          <span className="font-medium text-amber-700 dark:text-amber-400">종료 예정보다 뒤</span>
        )}
      </div>

      {dialogs}
    </div>
  );
}
