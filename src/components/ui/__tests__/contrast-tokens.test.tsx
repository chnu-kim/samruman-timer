// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Input } from "../Input";
import { Button } from "../Button";
import { EditableText } from "../EditableText";
import { ToastProvider } from "../Toast";
import { CreateTimerForm } from "@/components/timer/CreateTimerForm";
import { TimerControls } from "@/components/timer/TimerControls";
import { GoalForm } from "@/components/goal/GoalForm";
import { chartTooltipStyle } from "@/components/graph/tooltip-style";

vi.stubGlobal("fetch", vi.fn());

// 텍스트·경계 대비(C035, C073). 토큰 값을 바꿔도 WCAG 기준 아래로 내려가지 않게 계산으로 고정한다
const css = readFileSync(resolve(__dirname, "../../../app/globals.css"), "utf8");

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}

function token(body: string, name: string): string {
  const m = body.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`--${name} 없음`);
  return m[1].trim();
}

type RGBA = [number, number, number, number];

function parseColor(value: string): RGBA {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = value.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  if (rgba) return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), Number(rgba[4])];
  throw new Error(`색 해석 실패: ${value}`);
}

function luminance([r, g, b]: RGBA): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// 반투명 전경을 불투명 배경 위에 합성한다. opacity는 Tailwind의 /10 같은 불투명도 수정자
function over(fg: string, bg: string, opacity = 1): string {
  const b = parseColor(bg);
  const f = parseColor(fg);
  const a = f[3] * opacity;
  const [r, g, bl] = [0, 1, 2].map((i) => Math.round(f[i] * a + b[i] * (1 - a)));
  return `rgba(${r}, ${g}, ${bl}, 1)`;
}

function contrast(fg: string, bg: string): number {
  const mixed = parseColor(over(fg, bg));
  const [hi, lo] = [luminance(mixed), luminance(parseColor(bg))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const themes = [":root", ":root:not(.light)", "html.dark"] as const;

describe("대비 토큰", () => {
  // 알파 값이라 표면에 따라 합성 결과가 바뀐다. 입력이 놓이는 표면을 모두 잰다:
  // 페이지·하단 바(bg-background/95), 위치 칸(bg-muted), 예약·목표 패널(bg-accent-light/10·/20)
  it.each(themes)("%s: 입력 경계(--border-input)는 입력이 놓이는 모든 표면에서 3:1 이상", (selector) => {
    const body = block(selector);
    const border = token(body, "border-input");
    const bg = token(body, "background");
    const accentLight = token(body, "accent-light");
    const surfaces = [bg, token(body, "muted"), over(accentLight, bg, 0.1), over(accentLight, bg, 0.2)];
    for (const surface of surfaces) {
      expect(contrast(border, surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(themes)("%s: placeholder가 쓰는 --muted-foreground는 배경과 4.5:1 이상", (selector) => {
    const body = block(selector);
    expect(contrast(token(body, "muted-foreground"), token(body, "background"))).toBeGreaterThanOrEqual(4.5);
  });

  // 층 밖에 두면 @layer utilities의 placeholder:text-*를 이겨 버린다. preflight와 같은 base 층에 둔다
  it("placeholder 색을 base 층에서 보조 텍스트 토큰으로 지정한다", () => {
    expect(css).toMatch(/@layer base\s*\{\s*::placeholder\s*\{\s*color:\s*var\(--muted-foreground\);/);
  });

  it("Input은 입력 경계 토큰을 쓰고, 오류일 때는 빨간 경계로 바꾼다", () => {
    const { rerender } = render(<Input aria-label="닉네임" />);
    expect(screen.getByLabelText("닉네임")).toHaveClass("border-border-input");
    rerender(<Input aria-label="닉네임" error="필수" />);
    expect(screen.getByLabelText("닉네임")).toHaveClass("border-red-500");
    expect(screen.getByLabelText("닉네임")).not.toHaveClass("border-border-input");
  });
});

// 각 호출부가 장식 경계(border-border, 0.12 알파 ≈ 1.3:1)로 되돌아가면 실패한다
describe("입력 경계 토큰을 쓰는 호출부", () => {
  function expectInputBorder(el: HTMLElement) {
    expect(el).toHaveClass("border-border-input");
    expect(el).not.toHaveClass("border-border");
  }

  it("새 타이머 예약 날짜 select", () => {
    render(
      <ToastProvider>
        <CreateTimerForm projectId="p1" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("radio", { name: "예약 시작" }));
    const selects = screen.getAllByRole("combobox");
    expect(selects.length).toBeGreaterThan(0);
    selects.forEach(expectInputBorder);
  });

  it("데드라인 목표 날짜 select", () => {
    render(
      <ToastProvider>
        <GoalForm projectId="p1" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("radio", { name: "데드라인 목표" }));
    const selects = screen.getAllByRole("combobox");
    expect(selects.length).toBeGreaterThan(0);
    selects.forEach(expectInputBorder);
  });

  it("제목 인라인 편집 칸", () => {
    render(<EditableText value="제목" onSave={async () => {}} editable as="h1" />);
    fireEvent.click(screen.getByRole("button", { name: "제목 편집" }));
    expectInputBorder(screen.getByRole("textbox"));
  });
});

describe("글자 대비", () => {
  // 흰 글자에 green-600은 3.2:1, green-700은 5.0:1
  it("모바일 하단 바의 추가 버튼은 green-700 배경이다", () => {
    const { container } = render(
      <ToastProvider>
        <TimerControls timerId="t1" status="RUNNING" selectedAction="ADD" onActionChange={() => {}} />
      </ToastProvider>,
    );
    const bar = container.querySelector("[data-quick-bar]") as HTMLElement;
    const buttons = within(bar).getAllByRole("button");
    const add = buttons.find((b) => b.className.includes("bg-green-"));
    expect(add).toBeDefined();
    expect(add).toHaveClass("bg-green-700", "text-white");
    expect(add).not.toHaveClass("bg-green-600");
  });

  // 계열 색(#22c55e)을 따르면 라이트 배경에서 2.3:1이다
  it("그래프 툴팁 값 글자는 계열 색이 아니라 본문색이다", () => {
    expect(chartTooltipStyle.itemStyle.color).toBe("var(--color-foreground)");
  });

  it.each([
    "graph/RemainingChart.tsx",
    "graph/CumulativeChart.tsx",
    "stats/HourlyActivityChart.tsx",
    "stats/DailyActivityChart.tsx",
  ])("%s 툴팁은 공용 스타일을 쓴다", (file) => {
    const src = readFileSync(resolve(__dirname, "../..", file), "utf8");
    expect(src).toMatch(/<Tooltip\b(?:(?!\/>)[\s\S])*\{\.\.\.chartTooltipStyle\}/);
  });
});

// R18(W33): 비활성 버튼을 opacity로 흐리면 라이트·다크에서 다른 색이 된다. 변형과 상관없이 중립 토큰으로 칠한다
describe("비활성 버튼", () => {
  it.each(["primary", "secondary", "danger"] as const)("%s 비활성은 opacity 없이 bg-muted·text-muted-foreground다", (variant) => {
    render(<Button variant={variant} disabled>비활성 {variant}</Button>);
    const el = screen.getByRole("button", { name: `비활성 ${variant}` });
    expect(el).toHaveClass("bg-muted", "text-muted-foreground", "border-border");
    expect(el.className).not.toMatch(/opacity-/);
    // 변형 색·hover가 남으면 CSS 순서에 따라 비활성 배경을 덮는다
    expect(el.className).not.toMatch(/bg-accent|bg-red-|hover:bg-/);
  });

  it.each(themes)("%s: 비활성 글자(--muted-foreground)는 --muted 배경에서 4.5:1 이상", (selector) => {
    const body = block(selector);
    expect(contrast(token(body, "muted-foreground"), token(body, "muted"))).toBeGreaterThanOrEqual(4.5);
  });
});
