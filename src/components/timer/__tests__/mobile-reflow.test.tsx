// @vitest-environment jsdom
// C049·C050·C053: 좁은 모바일 폭(320·360px)에서 시·분·초 입력 줄이 레이아웃을 넓히지 않고,
// 하단 고정 바가 포커스된 요소를 가리지 않으며, 숫자 칸은 숫자 키보드를 띄운다.
// jsdom에는 레이아웃이 없으므로 실제 폭(scrollWidth === clientWidth)과 포커스 가림은 Playwright로 잰다.
// 여기서는 그 결과를 만드는 구조(고정 폭 없음, inputmode, 바 그리드, scroll-padding)를 고정한다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { TimerControls } from "../TimerControls";
import { CreateTimerForm } from "../CreateTimerForm";
import { GoalForm } from "@/components/goal/GoalForm";
import { ToastProvider } from "@/components/ui/Toast";

vi.stubGlobal("fetch", vi.fn());

function expectFlexibleNumberInputs(inputs: HTMLElement[]) {
  expect(inputs.length).toBeGreaterThan(0);
  for (const input of inputs) {
    expect(input).toHaveAttribute("inputmode", "numeric");
    // 고정 폭(w-20 = 80px × 3)이 320px 폭을 넘겨 가로 스크롤을 만들었다
    expect(input.className).not.toMatch(/\bw-20\b/);
    expect(input.className).toMatch(/\bw-full\b/);
    // Input은 div로 감싸여 있어 그 div가 flex 항목이다. 줄이 그 div를 줄일 수 있어야 한다
    const row = input.parentElement!.parentElement!;
    expect(row.className).toContain("[&>div]:min-w-0");
    expect(row.className).toContain("[&>div]:flex-1");
  }
}

describe("모바일 리플로우·숫자 키보드", () => {
  it("시간 조작: 시·분·초가 줄 폭을 나눠 쓰고 닉네임 칸은 자동완성을 끈다", () => {
    render(
      <ToastProvider>
        <TimerControls timerId="t1" status="RUNNING" selectedAction="ADD" onActionChange={() => {}} />
      </ToastProvider>,
    );
    expectFlexibleNumberInputs(screen.getAllByRole("spinbutton"));
    expect(screen.getByLabelText("시청자 닉네임")).toHaveAttribute("autocomplete", "off");
  });

  it("시간 조작: 하단 바 버튼은 minmax(0,1fr) 세 칸이라 좁은 폭에서도 바 밖으로 밀리지 않는다", () => {
    const { container } = render(
      <ToastProvider>
        <TimerControls timerId="t1" status="RUNNING" selectedAction="ADD" onActionChange={() => {}} />
      </ToastProvider>,
    );
    const bar = container.querySelector("[data-quick-bar]") as HTMLElement;
    const grid = within(bar).getAllByRole("button")[0].parentElement!;
    expect(grid.className).toMatch(/\bgrid-cols-3\b/);
  });

  it("새 타이머: 초기 시간 칸이 줄 폭을 나눠 쓰고 숫자 키보드를 띄운다", () => {
    render(
      <ToastProvider>
        <CreateTimerForm projectId="p1" />
      </ToastProvider>,
    );
    expectFlexibleNumberInputs(screen.getAllByRole("spinbutton"));
  });

  it("새 목표: 목표 시간 칸이 줄 폭을 나눠 쓰고 숫자 키보드를 띄운다", () => {
    render(
      <ToastProvider>
        <GoalForm projectId="p1" />
      </ToastProvider>,
    );
    expectFlexibleNumberInputs(screen.getAllByRole("spinbutton"));
  });

  it("하단 바 높이를 변수 하나로 두고 body 여백과 scroll-padding-bottom이 같이 쓴다(WCAG 2.4.11)", () => {
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    const block = css.match(/@media \(width < 48rem\) \{[\s\S]*?\n\}/g)?.find((b) => b.includes("data-quick-bar"));
    expect(block).toBeDefined();
    expect(block).toMatch(/--quick-bar-h:\s*calc\(/);
    expect(block).toMatch(/html:has\(\[data-quick-bar\]\)\s*\{[^}]*scroll-padding-bottom:\s*var\(--quick-bar-h\)/);
    expect(block).toMatch(/body:has\(\[data-quick-bar\]\)\s*\{[^}]*padding-bottom:\s*var\(--quick-bar-h\)/);
  });
});
