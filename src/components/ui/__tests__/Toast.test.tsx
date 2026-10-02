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

    const item = screen.getByRole("status");
    expect(item).toHaveTextContent("추가 완료");
    expect(item.className).not.toMatch(/pointer-events-auto/);
    expect(item.parentElement?.className).toMatch(/pointer-events-none/);
  });
});
