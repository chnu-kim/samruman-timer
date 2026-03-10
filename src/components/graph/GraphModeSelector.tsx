"use client";

import { cn } from "@/lib/utils";
import type { GraphMode } from "@/types";

interface GraphModeSelectorProps {
  mode: GraphMode;
  onModeChange: (mode: GraphMode) => void;
  className?: string;
}

const MODES: { value: GraphMode; label: string }[] = [
  { value: "remaining", label: "잔여 시간 추이" },
  { value: "cumulative", label: "누적 변경량" },
  { value: "frequency", label: "이벤트 빈도" },
];

export function GraphModeSelector({ mode, onModeChange, className }: GraphModeSelectorProps) {
  return (
    <div className={cn("flex gap-1 rounded-lg bg-foreground/5 p-1", className)} role="tablist" aria-label="그래프 모드">
      {MODES.map((m) => (
        <button
          key={m.value}
          role="tab"
          aria-selected={mode === m.value}
          onClick={() => onModeChange(m.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            mode === m.value
              ? "bg-foreground text-background"
              : "text-foreground/60 hover:text-foreground hover:bg-foreground/10",
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
