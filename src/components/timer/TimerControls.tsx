"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import type { ApiSuccessResponse, ApiErrorResponse, TimerModifyResponse, ModifyAction, TimerStatus } from "@/types";

interface TimerControlsProps {
  timerId: string;
  status?: TimerStatus;
  onModified?: (data: TimerModifyResponse) => void;
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

export function TimerControls({ timerId, status, onModified, className }: TimerControlsProps) {
  const { toast } = useToast();
  const [actorName, setActorName] = useState("");
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [selectedAction, setSelectedAction] = useState<ModifyAction>("ADD");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recentActors, setRecentActors] = useState<string[]>([]);
  const [defaultActor, setDefaultActor] = useState("");
  const [quickMode, setQuickMode] = useState(false);

  useEffect(() => {
    setRecentActors(getRecentActors());
    const saved = getDefaultActor();
    setDefaultActor(saved);
    if (saved) {
      setActorName(saved);
    }
  }, []);

  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  function addPreset(presetSeconds: number) {
    const current = hours * 3600 + minutes * 60 + seconds;
    const next = current + presetSeconds;
    setHours(Math.floor(next / 3600));
    setMinutes(Math.floor((next % 3600) / 60));
    setSeconds(next % 60);
  }

  async function submitModify(action: ModifyAction, delta: number, actor: string) {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/timers/${timerId}/modify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, deltaSeconds: delta, actorName: actor }),
      });

      if (!res.ok) {
        const json = (await res.json()) as ApiErrorResponse;
        setError(json.error.message);
        toast(json.error.message, "error");
        return;
      }

      const json = (await res.json()) as ApiSuccessResponse<TimerModifyResponse>;
      onModified?.(json.data);
      toast(`${action === "ADD" ? "추가" : "차감"} 완료`, "success");
      saveRecentActor(actor);
      setRecentActors(getRecentActors());
      setHours(0);
      setMinutes(0);
      setSeconds(0);
    } catch {
      setError("시간 변경에 실패했습니다.");
      toast("시간 변경에 실패했습니다.", "error");
    } finally {
      setLoading(false);
    }
  }

  function handlePresetClick(presetSeconds: number) {
    addPreset(presetSeconds);
  }

  // 빠른 적용 모드: 프리셋 탭 한 번으로 즉시 적용
  async function handleQuickApply(presetSeconds: number) {
    const actor = actorName.trim() || defaultActor;
    if (!actor) {
      setError("닉네임을 먼저 입력해주세요.");
      toast("닉네임을 먼저 입력해주세요.", "error");
      return;
    }
    await submitModify(selectedAction, presetSeconds, actor);
  }

  async function handleSubmit() {
    if (!actorName.trim()) {
      setError("시청자 닉네임을 입력해주세요.");
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

  if (status === "SCHEDULED") {
    return (
      <div className={className}>
        <p className="text-sm text-muted-foreground">
          예약된 타이머는 시작 전까지 시간을 변경할 수 없습니다.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-5", className)}>
      {/* 시청자 닉네임 */}
      <div>
        <Input
          label="시청자 닉네임"
          value={actorName}
          onChange={(e) => setActorName(e.target.value)}
          required
          maxLength={50}
          placeholder={defaultActor ? `기본: ${defaultActor}` : "시간 변경을 요청한 시청자"}
          list="recent-actors"
        />
        <datalist id="recent-actors">
          {recentActors.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <div className="mt-1.5 flex items-center gap-2">
          {actorName.trim() && actorName.trim() !== defaultActor && (
            <button
              type="button"
              onClick={handleSetDefault}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              기본 닉네임으로 설정
            </button>
          )}
          {defaultActor && (
            <button
              type="button"
              onClick={handleClearDefault}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              기본 닉네임 해제
            </button>
          )}
        </div>
      </div>

      {/* 추가/차감 토글 */}
      <div>
        <label className="mb-2.5 block text-sm font-medium text-foreground">변경 유형</label>
        <div
          className="relative grid grid-cols-2 rounded-xl border border-border bg-muted p-1"
          role="radiogroup"
          aria-label="변경 유형 선택"
        >
          {/* 슬라이딩 인디케이터 */}
          <div
            className={cn(
              "absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg bg-foreground shadow-sm transition-transform duration-200 ease-out pointer-events-none",
              selectedAction === "SUBTRACT" && "translate-x-[calc(100%+8px)]",
            )}
          />
          <span
            role="radio"
            aria-checked={selectedAction === "ADD"}
            tabIndex={0}
            onClick={() => setSelectedAction("ADD")}
            onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setSelectedAction("ADD"); } }}
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
            role="radio"
            aria-checked={selectedAction === "SUBTRACT"}
            tabIndex={0}
            onClick={() => setSelectedAction("SUBTRACT")}
            onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setSelectedAction("SUBTRACT"); } }}
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

      {/* 빠른 적용 모드 토글 */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={quickMode}
            onChange={(e) => setQuickMode(e.target.checked)}
            className="w-4 h-4 accent-accent rounded"
          />
          <span className="text-sm font-medium">빠른 적용 모드</span>
          <span className="text-xs text-muted-foreground">프리셋 탭 한 번으로 즉시 적용</span>
        </label>
      </div>

      {/* 시간 입력 */}
      <div>
        <label className="text-sm font-medium text-foreground">시간</label>

        {/* 빠른 입력 프리셋 */}
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              disabled={loading}
              onClick={() => quickMode ? handleQuickApply(preset.seconds) : handlePresetClick(preset.seconds)}
              className={cn(
                "rounded-md border px-3 py-2 min-h-[48px] min-w-[48px] text-sm font-medium transition-colors disabled:opacity-50",
                quickMode
                  ? "border-accent text-accent hover:bg-accent hover:text-accent-foreground"
                  : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              +{preset.label}
            </button>
          ))}
        </div>

        {/* 직접 입력 */}
        {!quickMode && (
          <div className="mt-2.5 flex items-center gap-2">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={hours}
              onChange={(e) => setHours(Math.max(0, Number(e.target.value)))}
              className="w-20 text-center"
              placeholder="0"
              aria-label="시간"
            />
            <span className="text-sm text-muted-foreground">시</span>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={59}
              value={minutes}
              onChange={(e) => setMinutes(Math.max(0, Math.min(59, Number(e.target.value))))}
              className="w-20 text-center"
              placeholder="0"
              aria-label="분"
            />
            <span className="text-sm text-muted-foreground">분</span>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={59}
              value={seconds}
              onChange={(e) => setSeconds(Math.max(0, Math.min(59, Number(e.target.value))))}
              className="w-20 text-center"
              placeholder="0"
              aria-label="초"
            />
            <span className="text-sm text-muted-foreground">초</span>
          </div>
        )}
      </div>

      {/* 에러 메시지 */}
      {error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}

      {/* 확인 버튼 (빠른 적용 모드가 아닐 때만) */}
      {!quickMode && (
        <Button
          size="lg"
          disabled={loading || totalSeconds <= 0}
          onClick={handleSubmit}
          className="w-full"
        >
          {loading
            ? "처리 중..."
            : totalSeconds > 0
            ? `${selectedAction === "ADD" ? "추가" : "차감"} 확인 (${formatDelta(totalSeconds)})`
            : "시간을 입력해주세요"}
        </Button>
      )}

      {/* 모바일 하단 고정 빠른 액션 바 */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-sm px-4 py-3 safe-area-bottom">
        <div className="flex items-center gap-2">
          {QUICK_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              disabled={loading || (!actorName.trim() && !defaultActor)}
              onClick={() => handleQuickApply(preset.seconds)}
              className={cn(
                "flex-1 rounded-lg py-3 min-h-[48px] text-sm font-bold transition-colors disabled:opacity-50",
                selectedAction === "ADD"
                  ? "bg-green-600 text-white hover:bg-green-700 active:bg-green-800"
                  : "bg-red-600 text-white hover:bg-red-700 active:bg-red-800",
              )}
            >
              {selectedAction === "SUBTRACT" ? "-" : "+"}{preset.label.slice(1)}
            </button>
          ))}
        </div>
        {!actorName.trim() && !defaultActor && (
          <p className="mt-1.5 text-center text-xs text-muted-foreground">
            닉네임을 먼저 입력하세요
          </p>
        )}
      </div>
      {/* 모바일 하단바 높이 보정 */}
      <div className="md:hidden h-20" />
    </div>
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
