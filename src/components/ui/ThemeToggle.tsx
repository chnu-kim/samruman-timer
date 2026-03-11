"use client";

import { useTheme } from "@/components/providers/ThemeProvider";
import { SunIcon, MoonIcon, MonitorIcon } from "@/components/ui/Icons";

const CYCLE: ("light" | "dark" | "system")[] = ["light", "dark", "system"];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  function handleClick() {
    const idx = CYCLE.indexOf(theme);
    setTheme(CYCLE[(idx + 1) % CYCLE.length]);
  }

  const Icon = theme === "dark" ? MoonIcon : theme === "light" ? SunIcon : MonitorIcon;
  const label = theme === "dark" ? "다크 모드" : theme === "light" ? "라이트 모드" : "시스템 모드";

  return (
    <button
      onClick={handleClick}
      className="rounded-lg p-1.5 min-h-11 min-w-11 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={label}
      title={label}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}
