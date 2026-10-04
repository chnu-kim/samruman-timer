// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { applyTheme, THEME_INIT_SCRIPT, nextTheme, themeToggleLabel, isTheme } from "../theme";

function mockSystemDark(dark: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query === "(prefers-color-scheme: dark)" ? dark : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

function classes() {
  const list = document.documentElement.classList;
  return { dark: list.contains("dark"), light: list.contains("light") };
}

// 인라인 스크립트는 문자열이라 실제로 실행해서 같은 결과를 내는지 본다
function runInitScript() {
  new Function(THEME_INIT_SCRIPT)();
}

describe("theme", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe.each([
    ["applyTheme", (t: string | null) => applyTheme(t)],
    [
      "THEME_INIT_SCRIPT",
      (t: string | null) => {
        if (t !== null) localStorage.setItem("theme", t);
        runInitScript();
      },
    ],
  ])("%s", (_name, apply) => {
    it.each([
      // [저장값, OS 다크, 기대 결과]
      ["light", true, "light"],
      ["light", false, "light"],
      ["dark", true, "dark"],
      ["dark", false, "dark"],
      ["system", true, "dark"],
      ["system", false, "light"],
      [null, true, "dark"],
      [null, false, "light"],
    ] as const)("저장값 %s, OS 다크 %s → %s 클래스 하나만", (stored, osDark, expected) => {
      mockSystemDark(osDark);
      // 직전 상태가 반대여도 정확히 하나만 남아야 한다
      document.documentElement.classList.add(expected === "dark" ? "light" : "dark");
      apply(stored);
      expect(classes()).toEqual({ dark: expected === "dark", light: expected === "light" });
    });
  });

  it("OS 다크에서 light → dark → system 순서로 바꾸면 시스템을 따라 다크가 된다", () => {
    mockSystemDark(true);
    applyTheme("light");
    expect(classes()).toEqual({ dark: false, light: true });
    applyTheme("dark");
    expect(classes()).toEqual({ dark: true, light: false });
    applyTheme("system");
    expect(classes()).toEqual({ dark: true, light: false });
  });

  it("localStorage 접근이 막혀도 초기 스크립트가 예외를 던지지 않는다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => runInitScript()).not.toThrow();
    vi.restoreAllMocks();
  });

  it("nextTheme은 light → dark → system → light로 순환한다", () => {
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("system");
    expect(nextTheme("system")).toBe("light");
  });

  it("토글 이름에 지금 상태와 다음 동작이 함께 들어간다", () => {
    expect(themeToggleLabel("light")).toBe("테마: 라이트 (눌러서 다크로)");
    expect(themeToggleLabel("dark")).toBe("테마: 다크 (눌러서 시스템으로)");
    expect(themeToggleLabel("system")).toBe("테마: 시스템 (눌러서 라이트로)");
  });

  it("isTheme은 세 값만 받는다", () => {
    expect(isTheme("light")).toBe(true);
    expect(isTheme("system")).toBe(true);
    expect(isTheme("auto")).toBe(false);
    expect(isTheme(null)).toBe(false);
  });
});
