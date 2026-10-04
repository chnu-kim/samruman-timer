"use client";

import { useState, useEffect, useRef, useId } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { authFetch } from "@/lib/auth-fetch";
import { normalizeTimeParts, resolveQuickActor, type TimeParts } from "@/lib/timer-input";
import type { ApiSuccessResponse, ApiErrorResponse, TimerModifyResponse, TimerLogResponse, ModifyAction, TimerStatus } from "@/types";

interface TimerControlsProps {
  timerId: string;
  status?: TimerStatus;
  remainingSeconds?: number;
  /** 추가/차감 방향. 단축키와 같은 상태를 쓰도록 상위(page)가 소유한다 */
  selectedAction: ModifyAction;
  onActionChange: (action: ModifyAction) => void;
  onModified?: (data: TimerModifyResponse) => void;
  /**
   * 즉시 적용 닉네임을 상위와 공유하는 ref. 숫자 단축키(상위 소유)가 모바일 바와 같은 이름으로 기록하게 한다.
   * effect가 아니라 렌더 중에 채워, 닉네임을 바꾼 직후의 단축키도 화면에 보이는 이름을 쓴다
   */
  quickActorRef?: { current: string };
  className?: string;
}

const PRESETS = [
  { label: "1시간", seconds: 3600 },
  { label: "5시간", seconds: 18000 },
  { label: "10시간", seconds: 36000 },
];

const QUICK_PRESETS = [
  { label: "+1h", seconds: 3600 },
  { label: "+5h", seconds: 18000 },
  { label: "+10h", seconds: 36000 },
];

const RECENT_ACTORS_KEY = "recentActors";
const DEFAULT_ACTOR_KEY = "defaultActorName";
const MAX_RECENT_ACTORS = 10;

function getRecentActors(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_ACTORS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecentActor(name: string) {
  const current = getRecentActors();
  const filtered = current.filter((n) => n !== name);
  const next = [name, ...filtered].slice(0, MAX_RECENT_ACTORS);
  localStorage.setItem(RECENT_ACTORS_KEY, JSON.stringify(next));
}

function getDefaultActor(): string {
  try {
    return localStorage.getItem(DEFAULT_ACTOR_KEY) || "";
  } catch {
    return "";
  }
}

function saveDefaultActor(name: string) {
  localStorage.setItem(DEFAULT_ACTOR_KEY, name);
}

export function TimerControls({ timerId, status, remainingSeconds, selectedAction, onActionChange, onModified, quickActorRef, className }: TimerControlsProps) {
  const { toast } = useToast();
  const [actorName, setActorName] = useState("");
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [recentActors, setRecentActors] = useState<string[]>([]);
  const [defaultActor, setDefaultActor] = useState("");
  // 실패 시 입력을 되돌릴 때, 요청 중에 새로 입력한 값을 덮어쓰지 않도록 최신 입력을 들고 있는다
  const inputsRef = useRef({ hours, minutes, seconds });
  inputsRef.current = { hours, minutes, seconds };
  // 겹친 요청 중 먼저 실패한 쪽이 이미 대체된 금액을 되살리지 않도록 제출 순번을 센다
  const submitSeqRef = useRef(0);
  // 추가/차감 radio: 표준 radio 패턴처럼 선택된 항목만 탭 정지이고 화살표 키로 선택과 포커스를 옮긴다
  const addRadioRef = useRef<HTMLSpanElement>(null);
  const subtractRadioRef = useRef<HTMLSpanElement>(null);
  const actionGroupLabelId = useId();
  const submitHintId = useId();

  useEffect(() => {
    setRecentActors(getRecentActors());
    const saved = getDefaultActor();
    setDefaultActor(saved);
    if (saved) {
      setActorName(saved);
    }
  }, []);

  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  // 즉시 적용(모바일 하단 바·숫자 단축키)이 기록할 닉네임. 표시와 제출이 어긋나지 않도록 한 곳에서 정한다
  const actionLabel = selectedAction === "ADD" ? "추가" : "차감";
  const quickActor = resolveQuickActor(actorName, defaultActor);
  if (quickActorRef) quickActorRef.current = quickActor;

  function setTime({ hours, minutes, seconds }: TimeParts) {
    setHours(hours);
    setMinutes(minutes);
    setSeconds(seconds);
  }

  // 60 이상의 분·초는 자르지 않고 윗자리로 올린다(90분 → 1시간 30분). 결과는 확인 버튼 라벨에 보인다
  function changeTime(field: keyof TimeParts, value: number) {
    const next = { hours, minutes, seconds, [field]: value };
    setTime(normalizeTimeParts(next.hours, next.minutes, next.seconds));
  }

  function addPreset(presetSeconds: number) {
    setTime(normalizeTimeParts(hours, minutes, seconds + presetSeconds));
  }

  async function submitModify(action: ModifyAction, delta: number, actor: string) {
    setError("");

    const prevRemaining = remainingSeconds ?? 0;
    const optimisticRemaining = Math.max(0, prevRemaining + (action === "ADD" ? delta : -delta));

    // Optimistic UI: 즉시 갱신
    onModified?.({
      id: timerId,
      remainingSeconds: optimisticRemaining,
      status: optimisticRemaining > 0 ? "RUNNING" : (status ?? "RUNNING"),
      log: {} as TimerLogResponse,
    });

    // 입력 즉시 초기화 (실패하면 restoreInputs로 되돌린다)
    const submitted = { hours, minutes, seconds };
    const seq = ++submitSeqRef.current;
    saveRecentActor(actor);
    setRecentActors(getRecentActors());
    setHours(0);
    setMinutes(0);
    setSeconds(0);

    function restoreInputs() {
      if (seq !== submitSeqRef.current) return; // 이후 제출이 있으면 그 금액이 사용자 의도다
      const current = inputsRef.current;
      if (current.hours !== 0 || current.minutes !== 0 || current.seconds !== 0) return;
      setHours(submitted.hours);
      setMinutes(submitted.minutes);
      setSeconds(submitted.seconds);
    }

    // 백그라운드에서 서버 확정
    try {
      const res = await authFetch(`/api/timers/${timerId}/modify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, deltaSeconds: delta, actorName: actor }),
      });

      if (!res.ok) {
        const json = (await res.json()) as ApiErrorResponse;
        // 롤백
        onModified?.({
          id: timerId,
          remainingSeconds: prevRemaining,
          status: status ?? "RUNNING",
          log: {} as TimerLogResponse,
        });
        restoreInputs();
        setError(json.error.message);
        toast(json.error.message, "error");
        return;
      }

      const json = (await res.json()) as ApiSuccessResponse<TimerModifyResponse>;
      onModified?.(json.data); // 서버 값으로 확정
      toast(`${action === "ADD" ? "추가" : "차감"} 완료`, "success");
    } catch {
      // 롤백
      onModified?.({
        id: timerId,
        remainingSeconds: prevRemaining,
        status: status ?? "RUNNING",
        log: {} as TimerLogResponse,
      });
      restoreInputs();
      setError("시간 변경에 실패했습니다.");
      toast("시간 변경에 실패했습니다.", "error");
    }
  }

  // 모바일 하단 바: 프리셋 탭 한 번으로 즉시 적용
  async function handleQuickApply(presetSeconds: number) {
    if (!quickActor) {
      setError("닉네임을 먼저 입력해 주세요.");
      toast("닉네임을 먼저 입력해 주세요.", "error");
      return;
    }
    await submitModify(selectedAction, presetSeconds, quickActor);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!actorName.trim()) {
      setError("시청자 닉네임을 입력해 주세요.");
      return;
    }
    if (totalSeconds <= 0) {
      setError("시간은 1초 이상이어야 합니다.");
      return;
    }
    await submitModify(selectedAction, totalSeconds, actorName.trim());
  }

  function handleSetDefault() {
    const name = actorName.trim();
    if (name) {
      saveDefaultActor(name);
      setDefaultActor(name);
      toast("기본 닉네임이 설정되었습니다", "success");
    }
  }

  function handleClearDefault() {
    saveDefaultActor("");
    setDefaultActor("");
    toast("기본 닉네임이 해제되었습니다", "success");
  }

  function handleActionKeyDown(e: React.KeyboardEvent, action: ModifyAction) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onActionChange(action);
      return;
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      // 항목이 둘뿐이라 어느 방향이든 다른 쪽으로 옮긴다
      const next: ModifyAction = action === "ADD" ? "SUBTRACT" : "ADD";
      onActionChange(next);
      (next === "ADD" ? addRadioRef : subtractRadioRef).current?.focus();
    }
  }

  if (status === "SCHEDULED") {
    return (
      <div className={className}>
        <p className="text-sm text-muted-foreground">
          예약된 타이머는 시작 전까지 시간을 변경할 수 없습니다. 시작 시각을 바꾸려면 타이머를 삭제한 뒤 다시 만드세요.
        </p>
      </div>
    );
  }

  // 한국어 IME 조합 중에 누른 Enter는 글자 확정이지 제출이 아니다
  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Enter" && (e.nativeEvent.isComposing || e.keyCode === 229)) {
      e.preventDefault();
    }
  }

  return (
    // Enter로 제출한다. 오류 안내는 아래 role=alert 문구가 맡으므로 브라우저 기본 검증 말풍선은 끈다
    <form noValidate onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className={cn("space-y-5", className)}>
      {/* 만료 상태에서 추가는 곧 재시작이므로 미리 알린다 */}
      {status === "EXPIRED" && (
        <p className="text-sm text-muted-foreground">
          만료된 타이머입니다. 시간을 추가하면 타이머가 다시 시작됩니다.
        </p>
      )}
      {/* 시청자 닉네임과 추가/차감은 넓은 화면에서 한 줄에 두어 조작 카드 높이를 줄인다 */}
      <div className="flex flex-col gap-5 md:grid md:grid-cols-[minmax(0,1fr)_14rem] md:gap-4">
        <div>
          <Input
            label="시청자 닉네임"
            value={actorName}
            onChange={(e) => setActorName(e.target.value)}
            required
            maxLength={50}
            autoComplete="off"
            placeholder={defaultActor ? `기본: ${defaultActor}` : "시간 변경을 요청한 시청자"}
          />
          {/* 최근 닉네임 칩 */}
          {recentActors.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {recentActors.map((name) => {
                const isDefault = name === defaultActor;
                const isSelected = name === actorName;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setActorName(name)}
                    className={cn(
                      "rounded-full border px-3 py-2 text-xs cursor-pointer transition-colors",
                      isDefault
                        ? "border-accent text-accent hover:bg-accent/10"
                        : "border-border text-muted-foreground hover:bg-accent/10 hover:text-foreground",
                      isSelected && "bg-accent/10",
                    )}
                  >
                    {isDefault && <span className="mr-0.5">★</span>}
                    {name}
                  </button>
                );
              })}
            </div>
          )}
          {/* 버튼 터치 영역(px-2)만 넓히고 글자는 칩과 왼쪽 정렬을 맞춘다 */}
          <div className="mt-1.5 -ml-2 flex items-center gap-2">
            {actorName.trim() && actorName.trim() !== defaultActor && (
              <button
                type="button"
                onClick={handleSetDefault}
                className="min-h-11 px-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                기본 닉네임으로 설정
              </button>
            )}
            {defaultActor && (
              <button
                type="button"
                onClick={handleClearDefault}
                className="min-h-11 px-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                기본 닉네임 해제
              </button>
            )}
          </div>
        </div>

        {/* 추가/차감 토글 */}
        <div>
          <span id={actionGroupLabelId} className="mb-1.5 block text-sm font-medium text-foreground">변경 유형</span>
          <div
            className="relative grid grid-cols-2 rounded-xl border border-border bg-muted p-1"
            role="radiogroup"
            aria-labelledby={actionGroupLabelId}
          >
            {/* 슬라이딩 인디케이터 */}
            <div
              className={cn(
                "absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg bg-foreground shadow-sm transition-transform duration-200 ease-out pointer-events-none",
                selectedAction === "SUBTRACT" && "translate-x-[calc(100%+8px)]",
              )}
            />
            <span
              ref={addRadioRef}
              role="radio"
              aria-checked={selectedAction === "ADD"}
              tabIndex={selectedAction === "ADD" ? 0 : -1}
              onClick={() => onActionChange("ADD")}
              onKeyDown={(e) => handleActionKeyDown(e, "ADD")}
              className={cn(
                "relative z-10 flex items-center justify-center rounded-lg py-2.5 text-sm font-medium transition-colors duration-200 select-none cursor-pointer",
                selectedAction === "ADD"
                  ? "text-background"
                  : "text-muted-foreground",
              )}
            >
              추가
            </span>
            <span
              ref={subtractRadioRef}
              role="radio"
              aria-checked={selectedAction === "SUBTRACT"}
              tabIndex={selectedAction === "SUBTRACT" ? 0 : -1}
              onClick={() => onActionChange("SUBTRACT")}
              onKeyDown={(e) => handleActionKeyDown(e, "SUBTRACT")}
              className={cn(
                "relative z-10 flex items-center justify-center rounded-lg py-2.5 text-sm font-medium transition-colors duration-200 select-none cursor-pointer",
                selectedAction === "SUBTRACT"
                  ? "text-background"
                  : "text-muted-foreground",
              )}
            >
              차감
            </span>
          </div>
        </div>
      </div>

      {/* 시간 입력 */}
      <div>
        <span className="text-sm font-medium text-foreground">시간</span>

        {/* 프리셋은 입력값에 더하기만 하고, 적용은 아래 확인 버튼으로 한다(즉시 적용은 모바일 하단 바와 숫자 단축키) */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-2.5">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => addPreset(preset.seconds)}
                className="rounded-md border border-border px-3 py-2 min-h-[48px] min-w-[48px] text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-50"
              >
                +{preset.label}
              </button>
            ))}
          </div>

          {/* 직접 입력. 칸 폭을 고정하지 않고 줄 폭을 나눠 써서 320px에서도 가로로 넘치지 않게 한다
              (Input은 div로 감싸여 있어 flex 항목인 그 div에 flex-1·min-w-0을 준다) */}
          <div className="flex items-center gap-2 [&>div]:min-w-0 [&>div]:flex-1">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={hours}
              onChange={(e) => changeTime("hours", Number(e.target.value))}
              className="w-full text-center"
              placeholder="0"
              aria-label="시간"
            />
            <span className="text-sm text-muted-foreground">시</span>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={minutes}
              onChange={(e) => changeTime("minutes", Number(e.target.value))}
              className="w-full text-center"
              placeholder="0"
              aria-label="분"
            />
            <span className="text-sm text-muted-foreground">분</span>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={seconds}
              onChange={(e) => changeTime("seconds", Number(e.target.value))}
              className="w-full text-center"
              placeholder="0"
              aria-label="초"
            />
            <span className="text-sm text-muted-foreground">초</span>
          </div>
        </div>
        {/* 확인 버튼이 비활성인 이유. 값을 넣으면 사라지고 버튼 라벨이 적용될 양을 보여 준다 */}
        {totalSeconds <= 0 && (
          <p id={submitHintId} className="mt-1 text-xs text-muted-foreground">
            시간을 입력하면 {actionLabel}할 수 있습니다.
          </p>
        )}
      </div>

      {/* 에러 메시지 */}
      {error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}

      {/* 라벨은 늘 동작(동사)이고, 값이 있으면 적용될 양을 덧붙인다 */}
      <Button
        type="submit"
        size="lg"
        variant={selectedAction === "SUBTRACT" ? "danger" : "primary"}
        disabled={totalSeconds <= 0}
        aria-describedby={totalSeconds <= 0 ? submitHintId : undefined}
        className="w-full"
      >
        {totalSeconds > 0 ? `시간 ${actionLabel} (${formatDelta(totalSeconds)})` : `시간 ${actionLabel}`}
      </Button>

      {/* 모바일 하단 고정 빠른 액션 바 */}
      {/* data-quick-bar: 바가 있을 때 body 하단 여백을 잡는다(globals.css) */}
      <div data-quick-bar className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-sm px-4 py-3 safe-area-bottom">
        {/* grid-cols-3 = repeat(3, minmax(0, 1fr)): 좁은 폭에서도 버튼이 바 밖으로 밀리지 않는다 */}
        <div className="grid grid-cols-3 gap-2">
          {QUICK_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              disabled={!quickActor}
              onClick={() => handleQuickApply(preset.seconds)}
              className={cn(
                "rounded-lg py-3 min-h-[48px] text-sm font-bold transition-colors disabled:opacity-50",
                selectedAction === "ADD"
                  ? "bg-green-700 text-white hover:bg-green-800 active:bg-green-900"
                  : "bg-red-600 text-white hover:bg-red-700 active:bg-red-800",
              )}
            >
              {selectedAction === "SUBTRACT" ? "-" : "+"}{preset.label.slice(1)}
            </button>
          ))}
        </div>
        {/* 카드 프리셋(누적)과 달리 확인 없이 바로 적용되고, 누구 이름으로 기록되는지 항상 보여 준다 */}
        <p className="mt-1.5 truncate text-center text-xs text-muted-foreground">
          {quickActor ? `즉시 적용 → ${quickActor}` : "닉네임을 먼저 입력하세요"}
        </p>
      </div>
    </form>
  );
}

function formatDelta(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}시간`);
  if (m > 0) parts.push(`${m}분`);
  if (s > 0) parts.push(`${s}초`);
  return parts.join(" ");
}
