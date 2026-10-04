"use client";

import { useTheme } from "@/components/providers/ThemeProvider";
import { SunIcon, MoonIcon, MonitorIcon } from "@/components/ui/Icons";
import { nextTheme, themeToggleLabel } from "@/lib/theme";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const Icon = theme === "dark" ? MoonIcon : theme === "light" ? SunIcon : MonitorIcon;
  const label = themeToggleLabel(theme);

  return (
    <button
      onClick={() => setTheme(nextTheme(theme))}
      className="rounded-lg p-1.5 min-h-11 min-w-11 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors"
      aria-label={label}
      title={label}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}
