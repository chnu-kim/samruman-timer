"use client";

import { useEffect, useState, useCallback } from "react";

interface ShortcutAction {
  presetSeconds?: number;
  toggleAction?: boolean;
  showHelp?: boolean;
  refresh?: boolean;
}

interface UseKeyboardShortcutsOptions {
  enabled: boolean;
  onPreset: (seconds: number) => void;
  onToggleAction: () => void;
  onRefresh?: () => void;
}

const SHORTCUTS: Record<string, ShortcutAction> = {
  "1": { presetSeconds: 3600 },
  "5": { presetSeconds: 18000 },
  "0": { presetSeconds: 36000 },
  "?": { showHelp: true },
};

// 물리 키(e.code)로 매칭하는 단축키. 한국어 IME가 켜져 있으면 e.key가
// 'ㅌ'이나 'Process'로 들어오므로 문자 대신 키 위치로 판별한다.
// Tab은 포커스 이동에 써야 하므로 단축키로 쓰지 않는다.
const CODE_SHORTCUTS: Record<string, ShortcutAction> = {
  KeyX: { toggleAction: true },
  KeyR: { refresh: true },
};

export function useKeyboardShortcuts({ enabled, onPreset, onToggleAction, onRefresh }: UseKeyboardShortcutsOptions) {
  const [showHelp, setShowHelp] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;

    const target = e.target as HTMLElement;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
      return;
    }

    // Cmd/Ctrl/Alt 조합은 브라우저·OS 단축키(Cmd+1 탭 전환, Cmd+R 새로고침, Cmd+X 잘라내기)에 맡긴다.
    // Shift는 '?' 입력에 필요하므로 거르지 않는다.
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const action: ShortcutAction | undefined = SHORTCUTS[e.key] ?? CODE_SHORTCUTS[e.code];
    if (!action) return;

    // 도움말이나 다른 모달(목표 폼, 삭제 확인, 오버레이 설정 등)이 열려 있는 동안에는
    // 뒤쪽 화면의 시간을 바꾸는 단축키를 막는다('?', R은 유지)
    const modalOpen = showHelp || !!document.querySelector('dialog[open], [aria-modal="true"]');
    if (modalOpen && (action.presetSeconds || action.toggleAction)) return;

    if (action.presetSeconds) {
      e.preventDefault();
      onPreset(action.presetSeconds);
    } else if (action.toggleAction) {
      e.preventDefault();
      onToggleAction();
    } else if (action.showHelp) {
      e.preventDefault();
      setShowHelp((prev) => !prev);
    } else if (action.refresh) {
      e.preventDefault();
      onRefresh?.();
    }
  }, [enabled, showHelp, onPreset, onToggleAction, onRefresh]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return { showHelp, setShowHelp };
}

export const SHORTCUT_HELP = [
  { key: "1", description: "1시간 추가/차감" },
  { key: "5", description: "5시간 추가/차감" },
  { key: "0", description: "10시간 추가/차감" },
  { key: "X", description: "추가/차감 전환" },
  { key: "R", description: "수동 새로고침" },
  { key: "?", description: "단축키 도움말" },
];
