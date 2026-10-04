// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@testing-library/react";
import { ConfirmDialog } from "../ConfirmDialog";
import { FormDialog } from "../FormDialog";

// 다크 테마 다이얼로그 글자색. <dialog>는 UA 스타일이 color: CanvasText라 body의 글자색을 물려받지 않는다.
// 토큰 글자색을 직접 지정하지 않으면 다크 배경 위에 검은 글자가 남는다(C001)
describe("다이얼로그 테마", () => {
  const noop = () => {};

  it("FormDialog는 글자색을 토큰으로 지정한다", () => {
    const { container } = render(
      <FormDialog open={false} title="새 타이머" onClose={noop}>
        <p>본문</p>
      </FormDialog>,
    );
    expect(container.querySelector("dialog")).toHaveClass("bg-background", "text-foreground");
  });

  it("ConfirmDialog는 글자색을 토큰으로 지정한다", () => {
    const { container } = render(
      <ConfirmDialog open={false} title="삭제할까요?" onConfirm={noop} onCancel={noop} />,
    );
    expect(container.querySelector("dialog")).toHaveClass("bg-background", "text-foreground");
  });

  // 라이트·OS 다크·수동 다크 세 경로 모두 color-scheme을 맞춰야 CanvasText·select·스크롤바가 테마를 따른다
  it("globals.css의 세 테마 블록이 color-scheme을 선언한다", () => {
    const css = readFileSync(resolve(__dirname, "../../../app/globals.css"), "utf8");
    const block = (selector: string) => {
      const start = css.indexOf(`${selector} {`);
      expect(start).toBeGreaterThanOrEqual(0);
      return css.slice(start, css.indexOf("}", start));
    };
    expect(block(":root")).toContain("color-scheme: light;");
    expect(block(":root:not(.light)")).toContain("color-scheme: dark;");
    expect(block("html.dark")).toContain("color-scheme: dark;");
  });
});
