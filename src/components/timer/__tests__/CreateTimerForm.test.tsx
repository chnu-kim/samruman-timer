// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { CreateTimerForm } from "../CreateTimerForm";

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe("CreateTimerForm", () => {
  // UX-51: 제목이 비면 제출이 비활성인데, 그 이유를 라벨로 미리 알린다
  it("제목 라벨에 필수 표시가 있고 제목이 비면 제출할 수 없다", () => {
    render(<CreateTimerForm projectId="p1" />);
    expect(screen.getByLabelText("타이머 제목 (필수)")).toBeRequired();
    expect(screen.getByRole("button", { name: "타이머 만들기" })).toBeDisabled();
  });

  // UX-52: 모바일 다이얼로그에서 연·월·일 select가 한 줄에 들어가도록 월·일은 좁은 폭을 쓴다
  it("예약 날짜의 월·일 select는 두 자리 폭을 쓴다", () => {
    render(<CreateTimerForm projectId="p1" />);
    fireEvent.click(screen.getByRole("radio", { name: "예약 시작" }));
    expect(screen.getByRole("combobox", { name: "월" }).className).toContain("w-14");
    expect(screen.getByRole("combobox", { name: "일" }).className).toContain("w-14");
    expect(screen.getByRole("combobox", { name: "연도" }).className).toContain("w-20");
  });
});
