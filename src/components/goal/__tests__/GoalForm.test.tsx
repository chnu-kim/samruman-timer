// @vitest-environment jsdom
import { render, screen, fireEvent, act } from "@testing-library/react";
import { GoalForm } from "../GoalForm";
import { ToastProvider } from "@/components/ui/Toast";

describe("GoalForm", () => {
  // C120: 이전 유형의 검증 오류가 남아 무엇이 틀렸는지 알 수 없던 문제
  it("유형을 바꾸면 이전 유형의 오류가 사라진다", () => {
    render(
      <ToastProvider>
        <GoalForm projectId="p1" />
      </ToastProvider>,
    );
    fireEvent.change(screen.getByLabelText("목표 제목"), { target: { value: "오류 확인" } });
    // 0은 버튼이 막으므로 제출 뒤 오류는 상한 초과로 만든다
    fireEvent.change(screen.getByRole("spinbutton", { name: "시간" }), { target: { value: "3000" } });
    fireEvent.click(screen.getByRole("button", { name: "목표 만들기" }));
    expect(screen.getByRole("alert")).toHaveTextContent("목표 시간은 최대 약 100일까지 설정할 수 있습니다.");

    fireEvent.click(screen.getByRole("radio", { name: "데드라인 목표" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // C160: '누적'이 무엇을 세는지 드러낸다
  it("시간형 목표의 이름은 '방송 시간 목표'다", () => {
    render(
      <ToastProvider>
        <GoalForm projectId="p1" />
      </ToastProvider>,
    );
    expect(screen.getByRole("radio", { name: "방송 시간 목표" })).toBeInTheDocument();
  });

  // C004·C003: 목표 유형은 공용 세그먼트(선택 항목만 Tab 정지점), 푸터는 주 동작 하나(닫기는 다이얼로그 X)
  it("목표 유형은 세그먼트이고 취소 버튼 없이 주 동작 하나로 끝난다", () => {
    render(
      <ToastProvider>
        <GoalForm projectId="p1" />
      </ToastProvider>,
    );
    const group = screen.getByRole("radiogroup", { name: "목표 유형" });
    const radios = screen.getAllByRole("radio");
    expect(group).toContainElement(radios[0]);
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1]);
    fireEvent.keyDown(radios[0], { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "데드라인 목표" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("button", { name: "취소" })).not.toBeInTheDocument();
  });

  // R13: 시·분 칸은 빈 값으로 시작하고(placeholder '0'), 지우면 '0'이 다시 채워지지 않는다
  it("시·분 칸은 비어 있고 지우면 빈 칸으로 남는다", () => {
    render(
      <ToastProvider>
        <GoalForm projectId="p1" />
      </ToastProvider>,
    );
    const hours = screen.getByRole("spinbutton", { name: "시간" });
    const minutes = screen.getByRole("spinbutton", { name: "분" });
    for (const input of [hours, minutes]) {
      expect(input).toHaveValue(null);
      expect(input).toHaveAttribute("placeholder", "0");
    }
    fireEvent.change(hours, { target: { value: "2" } });
    expect(hours).toHaveValue(2);
    fireEvent.change(hours, { target: { value: "" } });
    expect(hours).toHaveValue(null);
  });

  // R13: 타이머 만들기와 같은 규칙. 시간이 0이면 제출 전에 막고 이유를 버튼 아래 한 줄로 알린다
  it("제목만 입력하면 버튼이 비활성이고 이유가 연결되며, 시간을 넣으면 활성이 된다", () => {
    render(
      <ToastProvider>
        <GoalForm projectId="p1" />
      </ToastProvider>,
    );
    const submit = screen.getByRole("button", { name: "목표 만들기" });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAccessibleDescription("제목과 목표 시간을 입력하면 만들 수 있습니다.");

    fireEvent.change(screen.getByLabelText("목표 제목"), { target: { value: "10시간 돌파" } });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAccessibleDescription("목표 시간을 입력하면 만들 수 있습니다.");

    fireEvent.change(screen.getByRole("spinbutton", { name: "분" }), { target: { value: "30" } });
    expect(submit).toBeEnabled();
    expect(submit).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByText(/만들 수 있습니다/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // 타이머 생성·시간 추가/차감과 같은 올림 규칙
  it("분 90은 1시간 30분으로 올린다", () => {
    render(
      <ToastProvider>
        <GoalForm projectId="p1" />
      </ToastProvider>,
    );
    fireEvent.change(screen.getByRole("spinbutton", { name: "분" }), { target: { value: "90" } });
    expect(screen.getByRole("spinbutton", { name: "시간" })).toHaveValue(1);
    expect(screen.getByRole("spinbutton", { name: "분" })).toHaveValue(30);
    expect(screen.getByRole("spinbutton", { name: "분" })).not.toHaveAttribute("max");
  });

  it("데드라인 목표는 제목과 미래 날짜가 있으면 만들 수 있다", () => {
    render(
      <ToastProvider>
        <GoalForm projectId="p1" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("radio", { name: "데드라인 목표" }));
    const submit = screen.getByRole("button", { name: "목표 만들기" });
    expect(submit).toHaveAccessibleDescription("제목을 입력하면 만들 수 있습니다.");
    fireEvent.change(screen.getByLabelText("목표 제목"), { target: { value: "마감" } });
    expect(submit).toBeEnabled();

    // 올해 1월 1일 0시는 (1월 1일 0시 정각이 아닌 한) 지난 시각이다
    const year = screen.getByRole("combobox", { name: "연도" }) as HTMLSelectElement;
    fireEvent.change(year, { target: { value: year.options[0].value } });
    fireEvent.change(screen.getByRole("combobox", { name: "월" }), { target: { value: "1" } });
    fireEvent.change(screen.getByRole("combobox", { name: "일" }), { target: { value: "1" } });
    fireEvent.change(screen.getAllByRole("combobox", { name: "시" })[0], { target: { value: "0" } });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAccessibleDescription("지금 이후의 날짜를 고르면 만들 수 있습니다.");
  });

  // 5a 이월: 기한을 effect로 채우면 '데드라인 목표'로 처음 바꾼 프레임에 값이 비어 비활성 안내가 한 번 깜빡였다
  it("처음 '데드라인 목표'로 바꿀 때 비활성 안내가 한 프레임도 나타나지 않는다", () => {
    const { container } = render(
      <ToastProvider>
        <GoalForm projectId="p1" />
      </ToastProvider>,
    );
    fireEvent.change(screen.getByLabelText("목표 제목"), { target: { value: "마감" } });
    const observer = new MutationObserver(() => {});
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    fireEvent.click(screen.getByRole("radio", { name: "데드라인 목표" }));
    const records = observer.takeRecords();
    observer.disconnect();
    const flashed = records.some((r) =>
      [...r.addedNodes].some((n) => n.textContent?.includes("지금 이후의 날짜")) ||
      (r.type === "characterData" && r.target.textContent?.includes("지금 이후의 날짜")),
    );
    expect(flashed).toBe(false);
    expect(screen.getByRole("button", { name: "목표 만들기" })).toBeEnabled();
  });

  // 5a 이월: 대화상자를 연 채 기한이 지나면 그 순간 버튼을 막는다(날짜를 바꾼 순간에 판정이 고정되지 않는다)
  describe("열어 둔 채 기한이 지나면", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("버튼이 비활성이 되고 같은 자리에 이유를 알린다", () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
      vi.setSystemTime(new Date(2026, 9, 4, 17, 59, 0));
      render(
        <ToastProvider>
          <GoalForm projectId="p1" />
        </ToastProvider>,
      );
      fireEvent.change(screen.getByLabelText("목표 제목"), { target: { value: "마감" } });
      fireEvent.click(screen.getByRole("radio", { name: "데드라인 목표" }));
      // 오늘 18:00 = 1분 뒤
      fireEvent.change(screen.getByRole("combobox", { name: "월" }), { target: { value: "10" } });
      fireEvent.change(screen.getByRole("combobox", { name: "일" }), { target: { value: "4" } });
      fireEvent.change(screen.getAllByRole("combobox", { name: "시" })[0], { target: { value: "18" } });
      fireEvent.change(screen.getAllByRole("combobox", { name: "분" })[0], { target: { value: "0" } });
      const submit = screen.getByRole("button", { name: "목표 만들기" });
      expect(submit).toBeEnabled();

      act(() => {
        vi.advanceTimersByTime(59_000);
      });
      expect(submit).toBeEnabled();
      act(() => {
        vi.advanceTimersByTime(1_000);
      });
      expect(submit).toBeDisabled();
      expect(submit).toHaveAccessibleDescription("지금 이후의 날짜를 고르면 만들 수 있습니다.");
    });
  });

  // W34·5a 이월: 목표 만들기도 authFetch를 거친다. 세션 만료면 그 안내에 맡기고 폼 오류를 겹쳐 띄우지 않는다
  it("세션 만료(401 SESSION_EXPIRED)면 세션 만료 이벤트만 내고 폼 오류를 띄우지 않는다", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: "SESSION_EXPIRED", message: "유효하지 않은 세션입니다" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const expired = vi.fn();
    window.addEventListener("session-expired", expired);
    try {
      render(
        <ToastProvider>
          <GoalForm projectId="p1" />
        </ToastProvider>,
      );
      fireEvent.change(screen.getByLabelText("목표 제목"), { target: { value: "열 시간" } });
      fireEvent.change(screen.getByRole("spinbutton", { name: "시간" }), { target: { value: "10" } });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "목표 만들기" }));
      });
      expect(fetchMock).toHaveBeenCalledWith("/api/projects/p1/goals", expect.objectContaining({ method: "POST" }));
      expect(expired).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } finally {
      window.removeEventListener("session-expired", expired);
      vi.unstubAllGlobals();
    }
  });

  // R04: 다이얼로그 제출도 본문 주 버튼과 같은 md(데스크톱 40px, 터치 44px)
  it("제출 버튼은 md 크기이고 터치 기기에서 44px을 보장한다", () => {
    render(
      <ToastProvider>
        <GoalForm projectId="p1" />
      </ToastProvider>,
    );
    expect(screen.getByRole("button", { name: "목표 만들기" })).toHaveClass("h-10", "pointer-coarse:min-h-11");
  });
});
