// @vitest-environment jsdom
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { SegmentedControl } from "../SegmentedControl";

const OPTIONS = [
  { value: "a", label: "하나" },
  { value: "b", label: "둘" },
  { value: "c", label: "셋", attrs: { "aria-keyshortcuts": "X" } },
] as const;

function Harness({ onSubmit = () => {} }: { onSubmit?: () => void }) {
  const [value, setValue] = useState<(typeof OPTIONS)[number]["value"]>("a");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <span id="label">고르기</span>
      <SegmentedControl options={OPTIONS} value={value} onChange={setValue} ariaLabelledBy="label" />
    </form>
  );
}

// C004: 단일 선택 컨트롤은 이 컴포넌트 한 가지 모양만 쓴다(콘솔 변경 유형·목표 유형·시작 방식)
describe("SegmentedControl", () => {
  it("라벨이 붙은 radiogroup이고 선택 항목만 Tab 정지점이다", () => {
    render(<Harness />);
    expect(screen.getByRole("radiogroup", { name: "고르기" })).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1]);
  });

  it("화살표 키로 선택과 포커스를 함께 옮기고 끝에서 처음으로 돈다", () => {
    render(<Harness />);
    const [a, b, c] = screen.getAllByRole("radio");
    a.focus();
    fireEvent.keyDown(a, { key: "ArrowRight" });
    expect(b).toHaveAttribute("aria-checked", "true");
    expect(b).toHaveFocus();
    fireEvent.keyDown(b, { key: "ArrowDown" });
    expect(c).toHaveFocus();
    fireEvent.keyDown(c, { key: "ArrowRight" });
    expect(a).toHaveAttribute("aria-checked", "true");
    expect(a).toHaveFocus();
    fireEvent.keyDown(a, { key: "ArrowLeft" });
    expect(c).toHaveAttribute("aria-checked", "true");
  });

  it("폼 안에서 Enter·Space·클릭으로 고르면 제출되지 않는다", () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const [, b, c] = screen.getAllByRole("radio");
    fireEvent.click(b);
    expect(b).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(c, { key: "Enter" });
    fireEvent.keyDown(c, { key: " " });
    expect(c).toHaveAttribute("aria-checked", "true");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("항목별 속성을 그 항목에만 붙인다", () => {
    render(<Harness />);
    const [a, , c] = screen.getAllByRole("radio");
    expect(c).toHaveAttribute("aria-keyshortcuts", "X");
    expect(a).not.toHaveAttribute("aria-keyshortcuts");
  });

  it("선택 칸은 선택한 항목 위치로 옮겨지고 foreground로 칠한다", () => {
    const { container } = render(<Harness />);
    const thumb = container.querySelector("[data-segment-thumb]") as HTMLElement;
    expect(thumb).toHaveClass("bg-foreground");
    expect(thumb.style.transform).toBe("translateX(0%)");
    fireEvent.click(screen.getByRole("radio", { name: "셋" }));
    expect(thumb.style.transform).toBe("translateX(200%)");
  });
});
