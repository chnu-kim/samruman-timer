// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ThemeToggle } from "../ThemeToggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    localStorage.clear();
    // OS 다크
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query === "(prefers-color-scheme: dark)",
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // W37: 헤더 한 줄의 로그인·로그아웃과 같은 높이. 데스크톱 40, 터치 기기 44
  it("데스크톱 40px, 터치 기기에서 44px이다", () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toHaveClass("h-10", "w-10", "pointer-coarse:min-h-11", "pointer-coarse:min-w-11");
  });

  it("OS 다크에서 누를 때마다 이름과 html 클래스가 함께 바뀐다", () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );
    const root = document.documentElement;
    const button = screen.getByRole("button", { name: "테마: 시스템 (눌러서 라이트로)" });
    expect(root.className).toBe("dark");

    fireEvent.click(button);
    expect(button).toHaveAccessibleName("테마: 라이트 (눌러서 다크로)");
    expect(localStorage.getItem("theme")).toBe("light");
    expect(root.classList.contains("light")).toBe(true);
    expect(root.classList.contains("dark")).toBe(false);

    fireEvent.click(button);
    expect(button).toHaveAccessibleName("테마: 다크 (눌러서 시스템으로)");
    expect(root.className).toBe("dark");

    fireEvent.click(button);
    expect(button).toHaveAccessibleName("테마: 시스템 (눌러서 라이트로)");
    expect(root.className).toBe("dark");
  });
});
