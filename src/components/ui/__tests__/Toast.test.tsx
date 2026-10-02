// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
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

    const item = screen.getByText("추가 완료", { selector: "div" });
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
});
