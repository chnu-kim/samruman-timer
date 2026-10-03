export type Theme = "light" | "dark" | "system";

export const THEMES: readonly Theme[] = ["light", "dark", "system"];

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

// 테마 규칙: 실제로 보일 테마를 하나로 정하고 html에 `dark`·`light` 중 정확히 하나만 남긴다.
// globals.css의 변수는 `html.dark`와 `:root:not(.light)`(시스템 다크)로, `dark:` 유틸리티는
// `.dark` 클래스로만 켜지므로 두 클래스가 엇갈리면 배경과 유틸리티 색이 섞인다.
// 첫 페인트 전 인라인 스크립트(THEME_INIT_SCRIPT)가 이 함수의 소스를 그대로 실행하므로
// 바깥 식별자(import·모듈 상수)를 참조하지 않는다.
export function applyTheme(theme: string | null) {
  const root = document.documentElement;
  const dark =
    theme === "dark" ||
    (theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
  root.classList.toggle("light", !dark);
}

// layout.tsx의 <head>에서 하이드레이션 전에 실행한다. ThemeProvider와 같은 함수 소스를 쓴다
export const THEME_INIT_SCRIPT = `(function(){try{(${applyTheme.toString()})(localStorage.getItem('theme'));}catch(e){}})();`;

export function nextTheme(theme: Theme): Theme {
  return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
}

const THEME_NAMES: Record<Theme, string> = { light: "라이트", dark: "다크", system: "시스템" };
// 받침에 맞춘 조사: 라이트로, 다크로, 시스템으로
const THEME_NAMES_TO: Record<Theme, string> = { light: "라이트로", dark: "다크로", system: "시스템으로" };

// 토글 버튼의 접근 가능한 이름: 지금 상태와 누르면 바뀔 상태를 함께 알린다
export function themeToggleLabel(theme: Theme): string {
  return `테마: ${THEME_NAMES[theme]} (눌러서 ${THEME_NAMES_TO[nextTheme(theme)]})`;
}
