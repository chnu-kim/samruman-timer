"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import type { ApiSuccessResponse, ApiErrorResponse, GoalResponse } from "@/types";

const selectClass =
  "appearance-none border border-border rounded-lg px-3 py-2 bg-background text-foreground text-center outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors cursor-pointer";

function range(start: number, end: number): number[] {
  const arr: number[] = [];
  for (let i = start; i <= end; i++) arr.push(i);
  return arr;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

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
      <span className="text-sm text-muted-foreground select-none">{suffix}</span>
    </div>
  );
}

interface GoalFormProps {
  projectId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function GoalForm({ projectId, onSuccess, onCancel }: GoalFormProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [goalType, setGoalType] = useState<"DURATION" | "DEADLINE">("DURATION");
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // DEADLINE fields
  const now = useMemo(() => new Date(), []);
  const init = useMemo(() => new Date(Date.now() + 7 * 24 * 60 * 60_000), []);
  const [schedYear, setSchedYear] = useState(init.getFullYear());
  const [schedMonth, setSchedMonth] = useState(init.getMonth() + 1);
  const [schedDay, setSchedDay] = useState(init.getDate());
  const [schedHour, setSchedHour] = useState(18);
  const [schedMinute, setSchedMinute] = useState(0);
  const [deadlineDatetime, setDeadlineDatetime] = useState("");

  const syncDatetime = useCallback(
    (y: number, mo: number, d: number, h: number, mi: number) => {
      const maxDay = daysInMonth(y, mo);
      const clampedDay = Math.min(d, maxDay);
      const date = new Date(y, mo - 1, clampedDay, h, mi, 0, 0);
      setDeadlineDatetime(date.toISOString());
    },
    [],
  );

  useEffect(() => {
    if (goalType === "DEADLINE") {
      syncDatetime(schedYear, schedMonth, schedDay, schedHour, schedMinute);
    }
  }, [goalType, schedYear, schedMonth, schedDay, schedHour, schedMinute, syncDatetime]);

  function updateField(field: "year" | "month" | "day" | "hour" | "minute", value: number) {
    switch (field) {
      case "year": setSchedYear(value); break;
      case "month": setSchedMonth(value); break;
      case "day": setSchedDay(value); break;
      case "hour": setSchedHour(value); break;
      case "minute": setSchedMinute(value); break;
    }
  }

  const maxDay = daysInMonth(schedYear, schedMonth);
  const clampedDay = Math.min(schedDay, maxDay);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("제목을 입력해주세요.");
      return;
    }

    if (goalType === "DURATION") {
      const targetSeconds = hours * 3600 + minutes * 60;
      if (targetSeconds <= 0) {
        setError("목표 시간은 1분 이상이어야 합니다.");
        return;
      }
      if (targetSeconds > 8_760_000) {
        setError("목표 시간은 최대 약 100일까지 설정할 수 있습니다.");
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(`/api/projects/${projectId}/goals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "DURATION", title: title.trim(), targetSeconds }),
        });
        if (!res.ok) {
          const json = (await res.json()) as ApiErrorResponse;
          setError(json.error.message);
          return;
        }
        await res.json() as ApiSuccessResponse<GoalResponse>;
        toast("목표가 생성되었습니다.", "success");
        onSuccess?.();
      } catch {
        setError("목표 생성에 실패했습니다.");
      } finally {
        setLoading(false);
      }
      return;
    }

    // DEADLINE
    if (!deadlineDatetime) {
      setError("목표 날짜/시간을 설정해주세요.");
      return;
    }
    if (new Date(deadlineDatetime).getTime() <= Date.now()) {
      setError("목표 날짜/시간은 미래여야 합니다.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/goals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "DEADLINE", title: title.trim(), targetDatetime: deadlineDatetime }),
      });
      if (!res.ok) {
        const json = (await res.json()) as ApiErrorResponse;
        setError(json.error.message);
        return;
      }
      await res.json() as ApiSuccessResponse<GoalResponse>;
      toast("목표가 생성되었습니다.", "success");
      onSuccess?.();
    } catch {
      setError("목표 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label="목표 제목"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        maxLength={100}
        placeholder="목표 제목을 입력하세요"
        autoFocus
      />

      <div>
        <label className="text-sm font-medium text-foreground">목표 유형</label>
        <div className="mt-1.5 flex gap-1" role="radiogroup" aria-label="목표 유형 선택">
          <Button
            type="button"
            variant={goalType === "DURATION" ? "primary" : "secondary"}
            size="sm"
            role="radio"
            aria-checked={goalType === "DURATION"}
            onClick={() => setGoalType("DURATION")}
          >
            누적 시간 목표
          </Button>
          <Button
            type="button"
            variant={goalType === "DEADLINE" ? "primary" : "secondary"}
            size="sm"
            role="radio"
            aria-checked={goalType === "DEADLINE"}
            onClick={() => setGoalType("DEADLINE")}
          >
            데드라인 목표
          </Button>
        </div>
      </div>

      {goalType === "DURATION" && (
        <div>
          <label className="text-sm font-medium text-foreground">목표 시간</label>
          <div className="mt-1.5 flex items-center gap-2">
            <Input
              type="number"
              min={0}
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="w-20 text-center"
              placeholder="시"
              aria-label="시간"
            />
            <span className="text-sm text-muted-foreground">시간</span>
            <Input
              type="number"
              min={0}
              max={59}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="w-20 text-center"
              placeholder="분"
              aria-label="분"
            />
            <span className="text-sm text-muted-foreground">분</span>
          </div>
        </div>
      )}

      {goalType === "DEADLINE" && (
        <div className="rounded-xl border border-accent/30 bg-accent-light/10 p-4">
          <label className="text-sm font-medium text-foreground">목표 날짜</label>
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

          <label className="mt-3 block text-sm font-medium text-foreground">목표 시간</label>
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
        </div>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={loading}>
            취소
          </Button>
        )}
        <Button type="submit" size="sm" disabled={loading || !title.trim()}>
          {loading ? "생성 중..." : "목표 만들기"}
        </Button>
      </div>
    </form>
  );
}
