"use client";

import { useState, useEffect, useCallback, useMemo, useId } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { authFetch } from "@/lib/auth-fetch";
import { changeTimeField, EMPTY_TIME_FIELDS, timeFieldsToSeconds, type TimeFields, type TimeParts } from "@/lib/timer-input";
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
  "appearance-none border border-border-input rounded-lg px-3 py-2 bg-background text-foreground text-center transition-colors cursor-pointer";

interface SelectFieldProps {
  value: number;
  options: number[];
  onChange: (v: number) => void;
  suffix: string;
  label: string;
  pad?: number;
  width?: string;
}

// 기본 폭은 두 자리 값 기준이다. 모바일 다이얼로그에서도 연·월·일이 한 줄에 들어가야 한다
function SelectField({ value, options, onChange, suffix, label, pad = 0, width = "w-14" }: SelectFieldProps) {
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

const START_MODE_OPTIONS = [
  { value: "now", label: "즉시 시작" },
  { value: "scheduled", label: "예약 시작" },
] as const;

interface CreateTimerFormProps {
  projectId: string;
  /** 제목 기본값. 프로젝트 화면은 프로젝트 이름을 넘긴다 */
  defaultTitle?: string;
  onSuccess?: (id: string) => void;
}

export function CreateTimerForm({ projectId, defaultTitle = "", onSuccess }: CreateTimerFormProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState(defaultTitle);
  const titleHintId = useId();
  const submitHintId = useId();
  const startModeLabelId = useId();
  // 문자열로 들고 있어야 칸을 지웠을 때 '0'이 다시 채워지지 않는다(빈 칸은 placeholder '0')
  const [time, setTime] = useState<TimeFields>(EMPTY_TIME_FIELDS);
  const initialSeconds = timeFieldsToSeconds(time);

  // 시간 조작 폼과 같은 규칙: 60 이상의 분·초는 윗자리로 올린다(90분 → 1시간 30분)
  function changeTime(field: keyof TimeParts, raw: string) {
    setTime((t) => changeTimeField(t, field, raw));
  }
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

    if (initialSeconds <= 0) {
      setError("초기 시간은 1초 이상이어야 합니다.");
      return;
    }

    if (useScheduled) {
      if (!scheduledStartAt) {
        setError("예약 시작 시각을 입력해 주세요.");
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
        initialSeconds,
      };
      if (useScheduled && scheduledStartAt) {
        body.scheduledStartAt = new Date(scheduledStartAt).toISOString();
      }

      const res = await authFetch(`/api/projects/${projectId}/timers`, {
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
      toast("타이머가 생성되었습니다.", "success");
      onSuccess?.(json.data.id);
    } catch {
      setError("타이머 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  const scheduledDate = scheduledStartAt ? new Date(scheduledStartAt) : null;

  // 만들기 버튼이 비활성인 이유. 기본값을 채우지 않고 막기만 하며, 새 목표와 같은 자리(버튼 아래)에 한 줄로 알린다
  const noTitle = !title.trim();
  const submitHint =
    initialSeconds <= 0
      ? noTitle ? "제목과 초기 시간을 입력하면 만들 수 있습니다." : "초기 시간을 입력하면 만들 수 있습니다."
      : noTitle ? "제목을 입력하면 만들 수 있습니다." : "";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* 화면에서는 프로젝트 이름을 쓰므로 타이머 제목은 오버레이의 '제목 표시'에만 나온다 */}
      <div>
        <Input
          label="제목 (필수)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={100}
          placeholder="오버레이에 표시할 제목"
          aria-describedby={titleHintId}
        />
        <p id={titleHintId} className="mt-1 text-xs text-muted-foreground">
          OBS 오버레이 설정에서 &lsquo;제목 표시&rsquo;를 켜면 방송 화면에 보입니다.
        </p>
      </div>

      {/* 초기 시간 */}
      <div>
        <label className="text-sm font-medium text-foreground">초기 시간</label>
        {/* 칸 폭을 고정하지 않고 줄 폭을 나눠 써서 좁은 모달에서도 넘치지 않게 한다 */}
        <div className="mt-1.5 flex items-center gap-2 [&>div]:min-w-0 [&>div]:flex-1">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={time.hours}
            onChange={(e) => changeTime("hours", e.target.value)}
            className="w-full text-center"
            placeholder="0"
            aria-label="시간"
            // 제목은 프로젝트 이름으로 미리 채워지므로 모달을 열면 비어 있는 시간부터 입력한다
            data-autofocus
          />
          <span className="text-sm text-muted-foreground">시</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={time.minutes}
            onChange={(e) => changeTime("minutes", e.target.value)}
            className="w-full text-center"
            placeholder="0"
            aria-label="분"
          />
          <span className="text-sm text-muted-foreground">분</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={time.seconds}
            onChange={(e) => changeTime("seconds", e.target.value)}
            className="w-full text-center"
            placeholder="0"
            aria-label="초"
          />
          <span className="text-sm text-muted-foreground">초</span>
        </div>
      </div>

      {/* 시작 방식 */}
      <div>
        <span id={startModeLabelId} className="mb-1.5 block text-sm font-medium text-foreground">시작 방식</span>
        <SegmentedControl
          options={START_MODE_OPTIONS}
          value={useScheduled ? "scheduled" : "now"}
          onChange={(mode) => handleToggleScheduled(mode === "scheduled")}
          ariaLabelledBy={startModeLabelId}
        />

        {/* 예약 패널 */}
        {useScheduled && (
          <div className="mt-2 rounded-xl border border-accent/30 bg-accent-light/10 p-4">
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
                    : "bg-accent-light",
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
                    : "text-accent",
                )}>
                  {relativeTimeText}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
      {/* 다이얼로그 푸터: 주 동작 하나를 오른쪽에. 닫기(X)가 있어 취소 버튼은 두지 않는다 */}
      {/* 본문 주 버튼과 같은 md(40px), 터치 기기에서는 44px */}
      <div className="flex flex-col items-end gap-1 pt-2">
        <Button
          type="submit"
          size="md"
          disabled={loading || submitHint !== ""}
          aria-describedby={submitHint ? submitHintId : undefined}
          className="whitespace-nowrap pointer-coarse:min-h-11"
        >
          {loading ? "생성 중…" : "타이머 만들기"}
        </Button>
        {submitHint && (
          <p id={submitHintId} className="text-xs text-muted-foreground">
            {submitHint}
          </p>
        )}
      </div>
    </form>
  );
}
