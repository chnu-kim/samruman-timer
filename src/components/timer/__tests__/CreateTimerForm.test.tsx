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
    expect(screen.getByLabelText("오버레이 제목 (필수)")).toBeRequired();
    expect(screen.getByRole("button", { name: "타이머 만들기" })).toBeDisabled();
  });

  // 화면에서는 프로젝트 이름을 쓰므로 제목은 오버레이용이고, 프로젝트 이름으로 미리 채운다
  it("제목을 기본값으로 채우고 어디에 보이는지 알린다", () => {
    render(<CreateTimerForm projectId="p1" defaultTitle="주말 서브어톤" />);
    const input = screen.getByLabelText("오버레이 제목 (필수)");
    expect(input).toHaveValue("주말 서브어톤");
    expect(input).toHaveAccessibleDescription(/타이틀 표시/);
    expect(screen.queryByLabelText("설명")).not.toBeInTheDocument();
  });

  // UX-52: 모바일 다이얼로그에서 연·월·일 select가 한 줄에 들어가도록 월·일은 좁은 폭을 쓴다
  it("예약 날짜의 월·일 select는 두 자리 폭을 쓴다", () => {
    render(<CreateTimerForm projectId="p1" />);
    fireEvent.click(screen.getByRole("radio", { name: "예약 시작" }));
    expect(screen.getByRole("combobox", { name: "월" }).className).toContain("w-14");
    expect(screen.getByRole("combobox", { name: "일" }).className).toContain("w-14");
    expect(screen.getByRole("combobox", { name: "연도" }).className).toContain("w-20");
  });

  // C021: 초기 시간이 0이면 만들 수 없고, 그 이유를 입력칸 아래 한 줄로 알린다(기본값은 채우지 않는다)
  it("초기 시간이 0이면 만들기 버튼이 비활성이고 이유가 연결되어 있다", () => {
    render(<CreateTimerForm projectId="p1" defaultTitle="주말 서브어톤" />);
    const submit = screen.getByRole("button", { name: "타이머 만들기" });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAccessibleDescription("초기 시간을 입력하면 만들 수 있습니다.");

    fireEvent.change(screen.getByRole("spinbutton", { name: "시간" }), { target: { value: "2" } });
    expect(submit).toBeEnabled();
    expect(screen.queryByText("초기 시간을 입력하면 만들 수 있습니다.")).not.toBeInTheDocument();
  });

  // C017과 같은 규칙: 60 이상의 분·초는 윗자리로 올린다
  it("분 90은 1시간 30분으로 올린다", () => {
    render(<CreateTimerForm projectId="p1" defaultTitle="주말 서브어톤" />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "분" }), { target: { value: "90" } });
    expect(screen.getByRole("spinbutton", { name: "시간" })).toHaveValue(1);
    expect(screen.getByRole("spinbutton", { name: "분" })).toHaveValue(30);
    expect(screen.getByRole("spinbutton", { name: "분" })).not.toHaveAttribute("max");
  });

  // C004·C003: 시작 방식은 공용 세그먼트, 푸터는 주 동작 하나(닫기는 다이얼로그 X)
  it("시작 방식은 세그먼트이고 취소 버튼 없이 주 동작 하나로 끝난다", () => {
    render(<CreateTimerForm projectId="p1" />);
    expect(screen.getByRole("radiogroup", { name: "시작 방식" })).toBeInTheDocument();
    const now = screen.getByRole("radio", { name: "즉시 시작" });
    expect(now).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(now, { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "예약 시작" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("combobox", { name: "연도" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "취소" })).not.toBeInTheDocument();
  });
});

