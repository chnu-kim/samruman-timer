// @vitest-environment jsdom
import { render, screen, fireEvent, act } from "@testing-library/react";
import { CreateTimerForm } from "../CreateTimerForm";

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe("CreateTimerForm", () => {
  // UX-51: 제목이 비면 제출이 비활성인데, 그 이유를 라벨로 미리 알린다
  it("제목 라벨에 필수 표시가 있고 제목이 비면 제출할 수 없다", () => {
    render(<CreateTimerForm projectId="p1" />);
    expect(screen.getByLabelText("제목 (필수)")).toBeRequired();
    expect(screen.getByRole("button", { name: "타이머 만들기" })).toBeDisabled();
  });

  // 화면에서는 프로젝트 이름을 쓰므로 제목은 오버레이용이고, 프로젝트 이름으로 미리 채운다
  it("제목을 기본값으로 채우고 어디에 보이는지 알린다", () => {
    render(<CreateTimerForm projectId="p1" defaultTitle="주말 서브어톤" />);
    const input = screen.getByLabelText("제목 (필수)");
    expect(input).toHaveValue("주말 서브어톤");
    expect(input).toHaveAccessibleDescription(/제목 표시/);
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

  // C021·R13: 초기 시간이 0이면 만들 수 없고, 그 이유를 버튼 아래 한 줄로 알린다(기본값은 채우지 않는다)
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

  // R13: 시간 칸은 빈 값으로 시작하고(placeholder '0'), 지우면 '0'이 다시 채워지지 않는다
  it("시·분·초 칸은 비어 있고 지우면 빈 칸으로 남는다", () => {
    render(<CreateTimerForm projectId="p1" defaultTitle="주말 서브어톤" />);
    for (const name of ["시간", "분", "초"]) {
      const input = screen.getByRole("spinbutton", { name });
      expect(input).toHaveValue(null);
      expect(input).toHaveAttribute("placeholder", "0");
    }
    const hours = screen.getByRole("spinbutton", { name: "시간" });
    fireEvent.change(hours, { target: { value: "3" } });
    fireEvent.change(hours, { target: { value: "" } });
    expect(hours).toHaveValue(null);
    expect(screen.getByRole("button", { name: "타이머 만들기" })).toBeDisabled();
  });

  it("제목을 지우면 그 이유도 같은 자리에 알린다", () => {
    render(<CreateTimerForm projectId="p1" defaultTitle="주말 서브어톤" />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "분" }), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("제목 (필수)"), { target: { value: " " } });
    const submit = screen.getByRole("button", { name: "타이머 만들기" });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAccessibleDescription("제목을 입력하면 만들 수 있습니다.");
  });

  // 5a 이월: 예약 시각이 지나면 제출 전에 버튼을 막고 새 목표의 기한과 같은 꼴로 이유를 알린다(제출 뒤 오류로 미루지 않는다)
  describe("예약 시각이 지나면", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    function renderScheduledInOneMinute() {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
      vi.setSystemTime(new Date(2026, 9, 4, 17, 59, 0));
      render(<CreateTimerForm projectId="p1" defaultTitle="주말 서브어톤" />);
      fireEvent.change(screen.getByRole("spinbutton", { name: "시간" }), { target: { value: "2" } });
      fireEvent.click(screen.getByRole("radio", { name: "예약 시작" }));
      // 오늘 18:00 = 1분 뒤
      fireEvent.change(screen.getByRole("combobox", { name: "시" }), { target: { value: "18" } });
      fireEvent.change(screen.getByRole("combobox", { name: "분" }), { target: { value: "0" } });
      return screen.getByRole("button", { name: "타이머 만들기" });
    }

    it("열어 둔 채 그 시각이 지나면 버튼이 비활성이 되고 이유와 '지난 시각'을 함께 알린다", () => {
      const submit = renderScheduledInOneMinute();
      expect(submit).toBeEnabled();
      expect(screen.getByText("예약됨")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(submit).toBeDisabled();
      expect(submit).toHaveAccessibleDescription("지금 이후의 시각을 고르면 만들 수 있습니다.");
      // 배지와 상대 시간 문구가 같은 순간에 바뀐다(30초 주기를 기다리지 않는다)
      expect(screen.getByText("지난 시각")).toBeInTheDocument();
      expect(screen.getByText("이미 지난 시각")).toBeInTheDocument();
    });

    it("다른 이유와 함께면 한 문장으로 알린다", () => {
      const submit = renderScheduledInOneMinute();
      fireEvent.change(screen.getByRole("spinbutton", { name: "시간" }), { target: { value: "" } });
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(submit).toHaveAccessibleDescription("초기 시간을 입력하고 지금 이후의 시각을 고르면 만들 수 있습니다.");
    });

    it("즉시 시작으로 바꾸면 지난 예약 시각은 막지 않는다", () => {
      const submit = renderScheduledInOneMinute();
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(submit).toBeDisabled();
      fireEvent.click(screen.getByRole("radio", { name: "즉시 시작" }));
      expect(submit).toBeEnabled();
    });
  });

  // R04: 다이얼로그 제출도 본문 주 버튼과 같은 md(데스크톱 40px, 터치 44px)
  it("제출 버튼은 md 크기이고 터치 기기에서 44px을 보장한다", () => {
    render(<CreateTimerForm projectId="p1" />);
    expect(screen.getByRole("button", { name: "타이머 만들기" })).toHaveClass("h-10", "pointer-coarse:min-h-11");
  });
});
