"use client";

import { useEffect, useState, useCallback } from "react";

interface ShortcutAction {
  presetSeconds?: number;
  toggleAction?: boolean;
  showHelp?: boolean;
}

interface UseKeyboardShortcutsOptions {
  enabled: boolean;
  onPreset: (seconds: number) => void;
  onToggleAction: () => void;
}

const SHORTCUTS: Record<string, ShortcutAction> = {
  "1": { presetSeconds: 3600 },
  "5": { presetSeconds: 18000 },
  "0": { presetSeconds: 36000 },
  "Tab": { toggleAction: true },
  "?": { showHelp: true },
};

export function useKeyboardShortcuts({ enabled, onPreset, onToggleAction }: UseKeyboardShortcutsOptions) {
  const [showHelp, setShowHelp] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;

    const target = e.target as HTMLElement;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
      return;
    }

    const action = SHORTCUTS[e.key];
    if (!action) return;

    if (action.presetSeconds) {
      e.preventDefault();
      onPreset(action.presetSeconds);
    } else if (action.toggleAction) {
      e.preventDefault();
      onToggleAction();
    } else if (action.showHelp) {
      e.preventDefault();
      setShowHelp((prev) => !prev);
    }
  }, [enabled, onPreset, onToggleAction]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return { showHelp, setShowHelp };
}

export const SHORTCUT_HELP = [
  { key: "1", description: "+1시간" },
  { key: "5", description: "+5시간" },
  { key: "0", description: "+10시간" },
  { key: "Tab", description: "추가/차감 전환" },
  { key: "?", description: "단축키 도움말" },
];
