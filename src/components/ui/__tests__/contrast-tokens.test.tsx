// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { Input } from "../Input";

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

// 반투명 전경을 불투명 배경 위에 합성한 뒤 대비를 잰다
function contrast(fg: string, bg: string): number {
  const b = parseColor(bg);
  const f = parseColor(fg);
  const a = f[3];
  const mixed: RGBA = [0, 1, 2].map((i) => f[i] * a + b[i] * (1 - a)) as unknown as RGBA;
  const [hi, lo] = [luminance(mixed), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const themes = [":root", ":root:not(.light)", "html.dark"] as const;

describe("대비 토큰", () => {
  it.each(themes)("%s: 입력 경계(--border-input)는 배경과 muted 위에서 3:1 이상", (selector) => {
    const body = block(selector);
    const border = token(body, "border-input");
    expect(contrast(border, token(body, "background"))).toBeGreaterThanOrEqual(3);
    expect(contrast(border, token(body, "muted"))).toBeGreaterThanOrEqual(3);
  });

  it.each(themes)("%s: placeholder가 쓰는 --muted-foreground는 배경과 4.5:1 이상", (selector) => {
    const body = block(selector);
    expect(contrast(token(body, "muted-foreground"), token(body, "background"))).toBeGreaterThanOrEqual(4.5);
  });

  it("placeholder 색을 보조 텍스트 토큰으로 지정한다", () => {
    expect(css).toMatch(/::placeholder\s*\{\s*color:\s*var\(--muted-foreground\);/);
  });

  it("Input은 입력 경계 토큰을 쓰고, 오류일 때는 빨간 경계로 바꾼다", () => {
    const { rerender } = render(<Input aria-label="닉네임" />);
    expect(screen.getByLabelText("닉네임")).toHaveClass("border-border-input");
    rerender(<Input aria-label="닉네임" error="필수" />);
    expect(screen.getByLabelText("닉네임")).toHaveClass("border-red-500");
    expect(screen.getByLabelText("닉네임")).not.toHaveClass("border-border-input");
  });
});
