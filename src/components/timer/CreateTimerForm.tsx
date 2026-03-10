"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import type { ApiSuccessResponse, ApiErrorResponse, TimerCreateResponse } from "@/types";

function formatRelativeTime(targetMs: number): string {
  const diffMs = targetMs - Date.now();
  if (diffMs <= 0) return "이미 지난 시각";

  const totalMinutes = Math.floor(diffMs / 60_000);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalDays = Math.floor(totalHours / 24);

  if (totalDays > 0) {
    const remainHours = totalHours % 24;
    return remainHours > 0
      ? `약 ${totalDays}일 ${remainHours}시간 후`
      : `약 ${totalDays}일 후`;
  }
  if (totalHours > 0) {
    const remainMinutes = totalMinutes % 60;
    return remainMinutes > 0
      ? `약 ${totalHours}시간 ${remainMinutes}분 후`
      : `약 ${totalHours}시간 후`;
  }
  if (totalMinutes > 0) {
    return `약 ${totalMinutes}분 후`;
  }
  return "약 1분 이내";
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function range(start: number, end: number): number[] {
  const arr: number[] = [];
  for (let i = start; i <= end; i++) arr.push(i);
  return arr;
}

const selectClass =
  "appearance-none border border-foreground/20 rounded-lg px-3 py-2 bg-background text-foreground text-center outline-none focus:ring-2 focus:ring-foreground/20 transition-colors cursor-pointer";

interface SelectFieldProps {
  value: number;
  options: number[];
  onChange: (v: number) => void;
  suffix: string;
  label: string;
  pad?: number;
  width?: string;
}

function SelectField({ value, options, onChange, suffix, label, pad = 0, width = "w-20" }: SelectFieldProps) {
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(selectClass, width)}
        aria-label={label}
      >
        {options.map((v) => (
          <option key={v} value={v}>
            {pad > 0 ? String(v).padStart(pad, "0") : v}
          </option>
        ))}
      </select>
      <span className="text-sm text-foreground/40 select-none">{suffix}</span>
    </div>
  );
}

interface CreateTimerFormProps {
  projectId: string;
  onSuccess?: (id: string) => void;
}

export function CreateTimerForm({ projectId, onSuccess }: CreateTimerFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [useScheduled, setUseScheduled] = useState(false);
  const [scheduledStartAt, setScheduledStartAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const now = useMemo(() => new Date(), []);
  const [schedYear, setSchedYear] = useState(now.getFullYear());
  const [schedMonth, setSchedMonth] = useState(now.getMonth() + 1);
  const [schedDay, setSchedDay] = useState(now.getDate());
  const [schedHour, setSchedHour] = useState(now.getHours());
  const [schedMinute, setSchedMinute] = useState(now.getMinutes());
  const [relativeTimeText, setRelativeTimeText] = useState("");

  const syncScheduledStartAt = useCallback(
    (y: number, mo: number, d: number, h: number, mi: number) => {
      const maxDay = daysInMonth(y, mo);
      const clampedDay = Math.min(d, maxDay);
      const date = new Date(y, mo - 1, clampedDay, h, mi, 0, 0);
      const p = (n: number) => String(n).padStart(2, "0");
      setScheduledStartAt(
        `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`,
      );
    },
    [],
  );

  const updateRelativeTime = useCallback(() => {
    if (!scheduledStartAt) {
      setRelativeTimeText("");
      return;
    }
    const targetMs = new Date(scheduledStartAt).getTime();
    if (isNaN(targetMs)) {
      setRelativeTimeText("");
      return;
    }
    setRelativeTimeText(formatRelativeTime(targetMs));
  }, [scheduledStartAt]);

  useEffect(() => {
    updateRelativeTime();
    if (!scheduledStartAt) return;
    const interval = setInterval(updateRelativeTime, 30_000);
    return () => clearInterval(interval);
  }, [scheduledStartAt, updateRelativeTime]);

  function handleToggleScheduled(scheduled: boolean) {
    setUseScheduled(scheduled);
    if (scheduled) {
      const init = new Date(Date.now() + 60 * 60_000);
      setSchedYear(init.getFullYear());
      setSchedMonth(init.getMonth() + 1);
      setSchedDay(init.getDate());
      setSchedHour(init.getHours());
      setSchedMinute(init.getMinutes());
      syncScheduledStartAt(
        init.getFullYear(),
        init.getMonth() + 1,
        init.getDate(),
        init.getHours(),
        init.getMinutes(),
      );
    } else {
      setScheduledStartAt("");
      setRelativeTimeText("");
    }
  }

  function updateField(
    field: "year" | "month" | "day" | "hour" | "minute",
    value: number,
  ) {
    let y = schedYear, mo = schedMonth, d = schedDay, h = schedHour, mi = schedMinute;
    switch (field) {
      case "year": y = value; setSchedYear(value); break;
      case "month": mo = value; setSchedMonth(value); break;
      case "day": d = value; setSchedDay(value); break;
      case "hour": h = value; setSchedHour(value); break;
      case "minute": mi = value; setSchedMinute(value); break;
    }
    syncScheduledStartAt(y, mo, d, h, mi);
  }

  const maxDay = daysInMonth(schedYear, schedMonth);
  const clampedDay = Math.min(schedDay, maxDay);

  const isPast = useMemo(() => {
    if (!scheduledStartAt) return false;
    return new Date(scheduledStartAt).getTime() <= Date.now();
  }, [scheduledStartAt]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const initialSeconds = hours * 3600 + minutes * 60 + seconds;
    if (initialSeconds <= 0) {
      setError("초기 시간은 1초 이상이어야 합니다.");
      return;
    }

    if (useScheduled) {
      if (!scheduledStartAt) {
        setError("예약 시작 시각을 입력해주세요.");
        return;
      }
      const scheduled = new Date(scheduledStartAt);
      if (scheduled.getTime() <= Date.now()) {
        setError("예약 시작 시각은 미래여야 합니다.");
        return;
      }
    }

    setLoading(true);

    try {
      const body: Record<string, unknown> = {
        title,
        description: description || undefined,
        initialSeconds,
      };
      if (useScheduled && scheduledStartAt) {
        body.scheduledStartAt = new Date(scheduledStartAt).toISOString();
      }

      const res = await fetch(`/api/projects/${projectId}/timers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = (await res.json()) as ApiErrorResponse;
        setError(json.error.message);
        return;
      }

      const json = (await res.json()) as ApiSuccessResponse<TimerCreateResponse>;
      onSuccess?.(json.data.id);
    } catch {
      setError("타이머 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  const scheduledDate = scheduledStartAt ? new Date(scheduledStartAt) : null;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label="타이머 제목"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        maxLength={100}
        placeholder="타이머 제목을 입력하세요"
      />
      <Input
        label="설명"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={500}
        placeholder="타이머 설명 (선택)"
      />

      {/* 초기 시간 */}
      <div>
        <label className="text-sm font-medium text-foreground">초기 시간</label>
        <div className="mt-1.5 flex items-center gap-2">
          <Input
            type="number"
            min={0}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="w-20 text-center"
            placeholder="시"
          />
          <span className="text-sm text-foreground/40">시</span>
          <Input
            type="number"
            min={0}
            max={59}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="w-20 text-center"
            placeholder="분"
          />
          <span className="text-sm text-foreground/40">분</span>
          <Input
            type="number"
            min={0}
            max={59}
            value={seconds}
            onChange={(e) => setSeconds(Number(e.target.value))}
            className="w-20 text-center"
            placeholder="초"
          />
          <span className="text-sm text-foreground/40">초</span>
        </div>
      </div>

      {/* 시작 방식 */}
      <div>
        <label className="text-sm font-medium text-foreground">시작 방식</label>
        <div className="mt-1.5 flex gap-1" role="radiogroup" aria-label="시작 방식 선택">
          <Button
            type="button"
            variant={!useScheduled ? "primary" : "secondary"}
            size="sm"
            role="radio"
            aria-checked={!useScheduled}
            onClick={() => handleToggleScheduled(false)}
          >
            즉시 시작
          </Button>
          <Button
            type="button"
            variant={useScheduled ? "primary" : "secondary"}
            size="sm"
            role="radio"
            aria-checked={useScheduled}
            onClick={() => handleToggleScheduled(true)}
          >
            예약 시작
          </Button>
        </div>

        {/* 예약 패널 */}
        {useScheduled && (
          <div className="mt-2 rounded-xl border border-purple-200 bg-purple-50/30 p-4 dark:border-purple-800/60 dark:bg-purple-950/20">
            {/* 날짜 */}
            <label className="text-sm font-medium text-foreground">
              날짜
            </label>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <SelectField
                value={schedYear}
                options={range(now.getFullYear(), now.getFullYear() + 5)}
                onChange={(v) => updateField("year", v)}
                suffix="년"
                label="연도"
                width="w-20"
              />
              <SelectField
                value={schedMonth}
                options={range(1, 12)}
                onChange={(v) => updateField("month", v)}
                suffix="월"
                label="월"
                pad={2}
              />
              <SelectField
                value={clampedDay}
                options={range(1, maxDay)}
                onChange={(v) => updateField("day", v)}
                suffix="일"
                label="일"
                pad={2}
              />
            </div>

            {/* 시간 */}
            <label className="mt-3 block text-sm font-medium text-foreground">
              시간
            </label>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <SelectField
                value={schedHour}
                options={range(0, 23)}
                onChange={(v) => updateField("hour", v)}
                suffix="시"
                label="시"
                pad={2}
              />
              <SelectField
                value={schedMinute}
                options={range(0, 59)}
                onChange={(v) => updateField("minute", v)}
                suffix="분"
                label="분"
                pad={2}
              />
            </div>

            {/* 상대 시간 인디케이터 */}
            {scheduledDate && !isNaN(scheduledDate.getTime()) && relativeTimeText && (
              <div
                className={cn(
                  "mt-3 flex items-center gap-2 rounded-lg px-3 py-2",
                  isPast
                    ? "bg-red-50 dark:bg-red-950/30"
                    : "bg-purple-100/60 dark:bg-purple-900/20",
                )}
                aria-live="polite"
              >
                <Badge variant={isPast ? "expired" : "scheduled"}>
                  {isPast ? "지난 시각" : "예약됨"}
                </Badge>
                <span className={cn(
                  "text-sm",
                  isPast
                    ? "text-red-600 dark:text-red-400"
                    : "text-purple-700 dark:text-purple-300",
                )}>
                  {relativeTimeText}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button type="submit" disabled={loading || !title.trim()}>
        {loading ? "생성 중..." : "타이머 만들기"}
      </Button>
    </form>
  );
}
