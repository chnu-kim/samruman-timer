// @vitest-environment jsdom
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ToastProvider, useToast } from "../Toast";

function Trigger() {
  const { toast } = useToast();
  return <button onClick={() => toast("추가 완료", "success")}>알림</button>;
}

describe("Toast", () => {
  // UX-05: 토스트가 모바일 하단 바의 탭을 가로채지 않아야 한다
  it("토스트와 컨테이너 모두 포인터 이벤트를 받지 않는다", () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "알림" }));

    const item = screen.getByText("추가 완료", { selector: "span" }).parentElement!;
    expect(item.className).not.toMatch(/pointer-events-auto/);
    expect(item.parentElement?.className).toMatch(/pointer-events-none/);
  });

  // UX-65: 마운트와 동시에 삽입된 status 노드는 읽히지 않을 수 있으므로 live region을 미리 둔다
  it("성공 토스트는 처음부터 렌더된 polite live region에 들어간다", () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole("button", { name: "알림" }));
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent("추가 완료");
  });

  it("오류 토스트는 개별 role=alert로 렌더되고 status 영역에는 들어가지 않는다", () => {
    function ErrorTrigger() {
      const { toast } = useToast();
      return <button onClick={() => toast("실패했습니다", "error")}>오류</button>;
    }
    render(
      <ToastProvider>
        <ErrorTrigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "오류" }));
    expect(screen.getByRole("alert")).toHaveTextContent("실패했습니다");
    expect(screen.getByRole("status")).not.toHaveTextContent("실패했습니다");
  });

  // C018: 연속 조작에서 토스트가 쌓이지 않는다
  it("한 번에 하나만 보이고 새 토스트가 이전 것을 바로 교체한다", () => {
    function Many() {
      const { toast } = useToast();
      return <button onClick={() => [1, 2, 3, 4, 5].forEach((n) => toast(`+${n}분 · 시청자`, "success"))}>다섯 번</button>;
    }
    render(
      <ToastProvider>
        <Many />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "다섯 번" }));
    expect(screen.queryByText("+1분 · 시청자")).not.toBeInTheDocument();
    expect(screen.getAllByText("+5분 · 시청자")).toHaveLength(2); // 화면 1개 + live region 1개
    expect(screen.getByRole("status")).toHaveTextContent(/^\+5분 · 시청자$/);
  });

  describe("동작 버튼(되돌리기)", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    function ActionTrigger({ onUndo }: { onUndo: () => void }) {
      const { toast } = useToast();
      return (
        <button onClick={() => toast("+10분 · 벌칙룰렛", "success", { action: { label: "되돌리기", onClick: onUndo } })}>
          추가
        </button>
      );
    }

    it("버튼이 있는 토스트만 포인터를 받고, 누르면 실행하고 닫힌다", () => {
      const onUndo = vi.fn();
      render(
        <ToastProvider>
          <ActionTrigger onUndo={onUndo} />
        </ToastProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: "추가" }));
      const undo = screen.getByRole("button", { name: "되돌리기" });
      expect(undo.parentElement!.className).toMatch(/pointer-events-auto/);
      expect(undo.className).toMatch(/min-h-11/); // 44px 터치 타깃

      fireEvent.click(undo);
      expect(onUndo).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("button", { name: "되돌리기" })).not.toBeInTheDocument();
    });

    it("6초 동안 보이고, 마우스를 올린 동안에는 닫히지 않는다", () => {
      render(
        <ToastProvider>
          <ActionTrigger onUndo={vi.fn()} />
        </ToastProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: "추가" }));
      act(() => vi.advanceTimersByTime(5900));
      expect(screen.getByRole("button", { name: "되돌리기" })).toBeInTheDocument();

      const item = screen.getByRole("button", { name: "되돌리기" }).parentElement!;
      fireEvent.mouseEnter(item);
      act(() => vi.advanceTimersByTime(20000));
      expect(screen.getByRole("button", { name: "되돌리기" })).toBeInTheDocument();

      fireEvent.mouseLeave(item);
      act(() => vi.advanceTimersByTime(6300));
      expect(screen.queryByRole("button", { name: "되돌리기" })).not.toBeInTheDocument();
    });
  });
});
