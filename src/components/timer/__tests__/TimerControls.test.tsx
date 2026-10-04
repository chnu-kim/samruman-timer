// @vitest-environment jsdom
import { useState, type ComponentProps } from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { TimerControls } from "../TimerControls";
import type { ModifyAction } from "@/types";

type HarnessProps = Omit<ComponentProps<typeof TimerControls>, "selectedAction" | "onActionChange"> & {
  initialAction?: ModifyAction;
};

// 추가/차감 방향은 상위(page)가 소유하므로 테스트에서도 상태를 들고 내려 준다
function Harness({ initialAction = "ADD", ...props }: HarnessProps) {
  const [action, setAction] = useState<ModifyAction>(initialAction);
  return <TimerControls {...props} selectedAction={action} onActionChange={setAction} />;
}

// Mock Toast
const mockToast = vi.fn();
vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
vi.stubGlobal("localStorage", localStorageMock);

describe("TimerControls", () => {
  const timerId = "abc123";

  beforeEach(() => {
    mockFetch.mockReset();
    mockToast.mockReset();
    localStorageMock.clear();
  });

  it("renders nickname input and action toggle", () => {
    render(<Harness timerId={timerId} status="RUNNING" />);
    expect(screen.getByLabelText("시청자 닉네임")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "추가" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "차감" })).toBeInTheDocument();
  });

  it("shows message for SCHEDULED timers", () => {
    render(<Harness timerId={timerId} status="SCHEDULED" />);
    expect(screen.getByText(/예약된 타이머/)).toBeInTheDocument();
    // UX-43: 일정을 바꿀 유일한 방법(삭제 후 재생성)을 안내한다
    expect(screen.getByText(/삭제한 뒤 다시 만드세요/)).toBeInTheDocument();
    expect(screen.queryByLabelText("시청자 닉네임")).not.toBeInTheDocument();
  });

  it("renders time presets", () => {
    render(<Harness timerId={timerId} status="RUNNING" />);
    expect(screen.getByRole("button", { name: "+1시간" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+5시간" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+10시간" })).toBeInTheDocument();
  });

  it("accumulates preset clicks in standard mode", () => {
    render(<Harness timerId={timerId} status="RUNNING" />);
    const btn1h = screen.getByRole("button", { name: "+1시간" });

    fireEvent.click(btn1h);
    fireEvent.click(btn1h);

    const submit = screen.getByRole("button", { name: /시간 추가/ });
    expect(submit).toHaveTextContent("2시간");
  });

  it("validates empty nickname on submit", async () => {
    render(<Harness timerId={timerId} status="RUNNING" />);

    fireEvent.click(screen.getByRole("button", { name: "+1시간" }));

    const submit = screen.getByRole("button", { name: /시간 추가/ });
    fireEvent.click(submit);

    expect(screen.getByRole("alert")).toHaveTextContent("시청자 닉네임을 입력해 주세요");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("validates zero time on submit", async () => {
    render(<Harness timerId={timerId} status="RUNNING" />);

    fireEvent.change(screen.getByLabelText("시청자 닉네임"), {
      target: { value: "테스터" },
    });

    const submit = screen.getByRole("button", { name: "시간 추가" });
    expect(submit).toBeDisabled();
  });

  // UX-13: 만료 상태에서 추가가 곧 재시작임을 미리 알린다
  it("shows restart notice for EXPIRED timers", () => {
    render(<Harness timerId={timerId} status="EXPIRED" remainingSeconds={0} />);
    expect(screen.getByText("만료된 타이머입니다. 시간을 추가하면 타이머가 다시 시작됩니다.")).toBeInTheDocument();
    expect(screen.getByLabelText("시청자 닉네임")).toBeInTheDocument();
  });

  it("does not show restart notice for RUNNING timers", () => {
    render(<Harness timerId={timerId} status="RUNNING" />);
    expect(screen.queryByText(/만료된 타이머입니다/)).not.toBeInTheDocument();
  });

  it("switches to SUBTRACT action", () => {
    render(<Harness timerId={timerId} status="RUNNING" />);

    const subtract = screen.getByRole("radio", { name: "차감" });
    fireEvent.click(subtract);

    expect(subtract).toHaveAttribute("aria-checked", "true");
  });

  // UX-66: 표준 radio 패턴 — 선택된 항목만 탭 정지, 화살표 키로 선택과 포커스 이동
  it("추가/차감 radio는 선택된 항목만 탭 정지이고 화살표 키로 선택과 포커스가 함께 옮겨진다", () => {
    render(<Harness timerId={timerId} status="RUNNING" />);
    const add = screen.getByRole("radio", { name: "추가" });
    const subtract = screen.getByRole("radio", { name: "차감" });
    expect(screen.getByRole("radiogroup", { name: "변경 유형" })).toBeInTheDocument();
    expect(add).toHaveAttribute("tabindex", "0");
    expect(subtract).toHaveAttribute("tabindex", "-1");

    add.focus();
    fireEvent.keyDown(add, { key: "ArrowRight" });
    expect(subtract).toHaveAttribute("aria-checked", "true");
    expect(subtract).toHaveAttribute("tabindex", "0");
    expect(add).toHaveAttribute("tabindex", "-1");
    expect(document.activeElement).toBe(subtract);

    fireEvent.keyDown(subtract, { key: "ArrowLeft" });
    expect(add).toHaveAttribute("aria-checked", "true");
    expect(document.activeElement).toBe(add);
  });

  // C017: 60 이상의 분·초는 잘라 버리지 않고 윗자리로 올린다. 결과는 버튼 라벨이 보여 주므로 범위 힌트는 없다
  it("분 90은 1시간 30분, 초 75는 1분 15초로 올린다", () => {
    render(<Harness timerId={timerId} status="RUNNING" />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "분" }), { target: { value: "90" } });
    expect(screen.getByRole("spinbutton", { name: "시간" })).toHaveValue(1);
    expect(screen.getByRole("spinbutton", { name: "분" })).toHaveValue(30);
    expect(screen.getByRole("button", { name: "시간 추가 (1시간 30분)" })).toBeEnabled();

    fireEvent.change(screen.getByRole("spinbutton", { name: "초" }), { target: { value: "75" } });
    expect(screen.getByRole("spinbutton", { name: "분" })).toHaveValue(31);
    expect(screen.getByRole("spinbutton", { name: "초" })).toHaveValue(15);
    expect(screen.queryByText(/0~59/)).not.toBeInTheDocument();
  });

  it("올림이 윗자리까지 이어진다(59분 + 초 75 → 1시간 0분 15초)", () => {
    render(<Harness timerId={timerId} status="RUNNING" />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "분" }), { target: { value: "59" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "초" }), { target: { value: "75" } });
    expect(screen.getByRole("button", { name: "시간 추가 (1시간 15초)" })).toBeInTheDocument();
  });

  // C087: 버튼 라벨은 늘 동작이고, 비활성 이유는 입력칸 아래 한 줄로 알린다
  it("값이 0이면 확인 버튼은 '시간 추가'로 비활성이고 이유가 연결되어 있다", () => {
    render(<Harness timerId={timerId} status="RUNNING" />);
    const submit = screen.getByRole("button", { name: "시간 추가" });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAccessibleDescription("시간을 입력하면 추가할 수 있습니다.");

    fireEvent.click(screen.getByRole("radio", { name: "차감" }));
    expect(screen.getByRole("button", { name: "시간 차감" })).toHaveAccessibleDescription("시간을 입력하면 차감할 수 있습니다.");

    fireEvent.click(screen.getByRole("button", { name: "+1시간" }));
    expect(screen.getByRole("button", { name: "시간 차감 (1시간)" })).not.toHaveAccessibleDescription();
    expect(screen.queryByText(/시간을 입력하면/)).not.toBeInTheDocument();
  });

  // C146: 입력부는 form이라 Enter로 제출되고, 한국어 IME 조합 중 Enter는 막는다
  it("form 제출(Enter)로 시간을 적용한다", () => {
    mockFetch.mockReturnValueOnce(new Promise(() => {}));
    render(<Harness timerId={timerId} status="RUNNING" remainingSeconds={60} />);
    fireEvent.change(screen.getByLabelText("시청자 닉네임"), { target: { value: "테스터" } });
    const minutes = screen.getByRole("spinbutton", { name: "분" });
    fireEvent.change(minutes, { target: { value: "10" } });

    fireEvent.submit(minutes.closest("form")!);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchObject({ action: "ADD", deltaSeconds: 600, actorName: "테스터" });
  });

  it("IME 조합 중 Enter는 기본 동작(암묵적 제출)을 막고, 일반 Enter는 막지 않는다", () => {
    render(<Harness timerId={timerId} status="RUNNING" />);
    const nickname = screen.getByLabelText("시청자 닉네임");

    const composing = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, isComposing: true });
    nickname.dispatchEvent(composing);
    expect(composing.defaultPrevented).toBe(true);

    const plain = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    nickname.dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(false);
  });

  // C014: 즉시 적용 닉네임(입력한 이름 우선, 없으면 기본 닉네임)을 상위와 ref로 공유해 숫자 단축키가 같은 이름을 쓰게 한다
  it("즉시 적용 닉네임을 입력 이름 우선으로 정해 quickActorRef에 채운다", () => {
    localStorageMock.setItem("defaultActorName", "기본냥");
    const quickActorRef = { current: "" };
    render(<Harness timerId={timerId} status="RUNNING" quickActorRef={quickActorRef} />);
    expect(quickActorRef.current).toBe("기본냥");

    fireEvent.change(screen.getByLabelText("시청자 닉네임"), { target: { value: " 벌칙룰렛 " } });
    expect(quickActorRef.current).toBe("벌칙룰렛");

    fireEvent.change(screen.getByLabelText("시청자 닉네임"), { target: { value: "" } });
    expect(quickActorRef.current).toBe("기본냥");
  });

  // UX-02: 방향 상태는 상위가 소유한다
  it("reflects selectedAction prop and reports changes via onActionChange", () => {
    const onActionChange = vi.fn();
    render(
      <TimerControls
        timerId={timerId}
        status="RUNNING"
        selectedAction="SUBTRACT"
        onActionChange={onActionChange}
      />,
    );

    // 상위에서 받은 값이 세그먼트에 그대로 보인다 (단축키로 바뀐 경우 포함)
    expect(screen.getByRole("radio", { name: "차감" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "추가" })).toHaveAttribute("aria-checked", "false");

    fireEvent.click(screen.getByRole("radio", { name: "추가" }));
    expect(onActionChange).toHaveBeenCalledWith("ADD");
  });

  // UX-03: 즉시 적용되는 하단 바의 라벨 부호가 실제 방향을 따른다
  it("shows '-' labels on the instant bar when subtracting and sends SUBTRACT", () => {
    mockFetch.mockReturnValueOnce(new Promise(() => {}));
    render(<Harness timerId={timerId} status="RUNNING" remainingSeconds={7200} initialAction="SUBTRACT" />);

    // 카드 프리셋은 입력값에 더하는 누적 입력이므로 방향과 무관하게 '+'다
    expect(screen.getByRole("button", { name: "+1시간" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("시청자 닉네임"), { target: { value: "테스터" } });
    fireEvent.click(screen.getByRole("button", { name: "-1h" }));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ action: "SUBTRACT", deltaSeconds: 3600 });
  });

  it("has no quick-apply mode toggle; card presets only fill the input", () => {
    render(<Harness timerId={timerId} status="RUNNING" />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("시청자 닉네임"), { target: { value: "테스터" } });
    fireEvent.click(screen.getByRole("button", { name: "+1시간" }));
    expect(mockFetch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "시간 추가 (1시간)" })).toBeEnabled();
  });

  it("uses danger style for the confirm button when subtracting", () => {
    render(<Harness timerId={timerId} status="RUNNING" />);
    fireEvent.click(screen.getByRole("button", { name: "+1시간" }));
    const addConfirm = screen.getByRole("button", { name: /시간 추가/ });
    const addClass = addConfirm.className;

    fireEvent.click(screen.getByRole("radio", { name: "차감" }));
    const subtractConfirm = screen.getByRole("button", { name: /시간 차감/ });
    expect(subtractConfirm.className).not.toBe(addClass);
    expect(subtractConfirm.className).toMatch(/red/);
  });

  // ─── Optimistic UI Tests ───

  describe("optimistic UI", () => {
    it("calls onModified immediately with optimistic value before API resolves", async () => {
      let fetchResolve: (value: Response) => void;
      mockFetch.mockReturnValueOnce(new Promise((resolve) => { fetchResolve = resolve; }));

      const onModified = vi.fn();
      render(
        <Harness
          timerId={timerId}
          status="RUNNING"
          remainingSeconds={7200}
          onModified={onModified}
        />,
      );

      fireEvent.change(screen.getByLabelText("시청자 닉네임"), {
        target: { value: "테스터" },
      });
      fireEvent.click(screen.getByRole("button", { name: "+1시간" }));
      fireEvent.click(screen.getByRole("button", { name: /시간 추가/ }));

      // onModified는 fetch 완료 전에 optimistic 값으로 즉시 호출됨
      expect(onModified).toHaveBeenCalledTimes(1);
      expect(onModified).toHaveBeenCalledWith(
        expect.objectContaining({
          id: timerId,
          remainingSeconds: 10800, // 7200 + 3600
          status: "RUNNING",
        }),
      );

      // UX-10: 성공 토스트는 서버 응답 전에는 뜨지 않는다
      expect(mockToast).not.toHaveBeenCalledWith("추가 완료", "success");

      // fetch 완료
      await act(async () => {
        fetchResolve!({
          ok: true,
          json: async () => ({
            data: {
              id: timerId,
              remainingSeconds: 10800,
              status: "RUNNING",
              log: { id: "log1", actionType: "ADD", actorName: "테스터", actorUserId: null, deltaSeconds: 3600, beforeSeconds: 7200, afterSeconds: 10800, createdAt: "2026-01-01T00:00:00Z" },
            },
          }),
        } as Response);
      });

      // 서버 값으로 확정된 뒤 성공 토스트
      expect(mockToast).toHaveBeenCalledWith("추가 완료", "success");
      expect(onModified).toHaveBeenCalledTimes(2);
      expect(onModified).toHaveBeenLastCalledWith(
        expect.objectContaining({
          id: timerId,
          remainingSeconds: 10800,
          log: expect.objectContaining({ id: "log1" }),
        }),
      );
    });

    it("resets input fields immediately on submit (before API response)", async () => {
      mockFetch.mockReturnValueOnce(new Promise(() => {})); // never resolves

      const onModified = vi.fn();
      render(
        <Harness
          timerId={timerId}
          status="RUNNING"
          remainingSeconds={3600}
          onModified={onModified}
        />,
      );

      fireEvent.change(screen.getByLabelText("시청자 닉네임"), {
        target: { value: "테스터" },
      });
      fireEvent.click(screen.getByRole("button", { name: "+1시간" }));

      // 제출 전 확인 버튼에 시간이 표시됨
      expect(screen.getByRole("button", { name: /시간 추가/ })).toHaveTextContent("1시간");

      fireEvent.click(screen.getByRole("button", { name: /시간 추가/ }));

      // 입력 필드가 즉시 초기화됨 (API 응답 전)
      expect(screen.getByRole("button", { name: "시간 추가" })).toBeInTheDocument();
    });

    it("calculates optimistic SUBTRACT correctly (clamped to 0)", async () => {
      mockFetch.mockReturnValueOnce(new Promise(() => {}));

      const onModified = vi.fn();
      render(
        <Harness
          timerId={timerId}
          status="RUNNING"
          remainingSeconds={1800}
          onModified={onModified}
        />,
      );

      // 차감 모드 선택
      fireEvent.click(screen.getByRole("radio", { name: "차감" }));
      fireEvent.change(screen.getByLabelText("시청자 닉네임"), {
        target: { value: "테스터" },
      });
      fireEvent.click(screen.getByRole("button", { name: "+1시간" }));
      fireEvent.click(screen.getByRole("button", { name: /시간 차감/ }));

      // 1800 - 3600 = -1800 → clamped to 0
      expect(onModified).toHaveBeenCalledWith(
        expect.objectContaining({
          remainingSeconds: 0,
        }),
      );
    });

    it("rolls back to previous value on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { code: "BAD_REQUEST", message: "잘못된 요청입니다" },
        }),
      });

      const onModified = vi.fn();
      render(
        <Harness
          timerId={timerId}
          status="RUNNING"
          remainingSeconds={7200}
          onModified={onModified}
        />,
      );

      fireEvent.change(screen.getByLabelText("시청자 닉네임"), {
        target: { value: "테스터" },
      });
      fireEvent.click(screen.getByRole("button", { name: "+1시간" }));
      fireEvent.click(screen.getByRole("button", { name: /시간 추가/ }));

      // 1차: optimistic
      expect(onModified).toHaveBeenCalledWith(
        expect.objectContaining({ remainingSeconds: 10800 }),
      );

      await waitFor(() => {
        // 2차: 롤백 — 원래 값으로 복원
        expect(onModified).toHaveBeenCalledWith(
          expect.objectContaining({ remainingSeconds: 7200, status: "RUNNING" }),
        );
      });

      // 에러 메시지 표시
      expect(screen.getByRole("alert")).toHaveTextContent("잘못된 요청입니다");
      expect(mockToast).toHaveBeenCalledWith("잘못된 요청입니다", "error");
      // UX-10: 모순되는 성공 토스트가 없고, 입력값이 복원된다
      expect(mockToast).not.toHaveBeenCalledWith("추가 완료", "success");
      expect(screen.getByRole("button", { name: /시간 추가/ })).toHaveTextContent("1시간");
    });

    it("rolls back on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const onModified = vi.fn();
      render(
        <Harness
          timerId={timerId}
          status="RUNNING"
          remainingSeconds={5000}
          onModified={onModified}
        />,
      );

      fireEvent.change(screen.getByLabelText("시청자 닉네임"), {
        target: { value: "테스터" },
      });
      fireEvent.click(screen.getByRole("button", { name: "+1시간" }));
      fireEvent.click(screen.getByRole("button", { name: /시간 추가/ }));

      // 1차: optimistic
      expect(onModified).toHaveBeenCalledWith(
        expect.objectContaining({ remainingSeconds: 8600 }),
      );

      await waitFor(() => {
        // 2차: 롤백
        expect(onModified).toHaveBeenCalledWith(
          expect.objectContaining({ remainingSeconds: 5000 }),
        );
      });

      expect(screen.getByRole("alert")).toHaveTextContent("시간 변경에 실패했습니다");
      expect(mockToast).not.toHaveBeenCalledWith("추가 완료", "success");
      expect(screen.getByRole("button", { name: /시간 추가/ })).toHaveTextContent("1시간");
    });

    it("does not overwrite a new amount typed while the failed request was in flight", async () => {
      let rejectFirst: (reason: unknown) => void;
      mockFetch.mockReturnValueOnce(new Promise((_, reject) => { rejectFirst = reject; }));

      render(<Harness timerId={timerId} status="RUNNING" remainingSeconds={5000} />);

      fireEvent.change(screen.getByLabelText("시청자 닉네임"), { target: { value: "테스터" } });
      fireEvent.click(screen.getByRole("button", { name: "+1시간" }));
      fireEvent.click(screen.getByRole("button", { name: /시간 추가/ }));

      // 응답 전에 다음 금액을 입력
      fireEvent.click(screen.getByRole("button", { name: "+5시간" }));

      await act(async () => {
        rejectFirst!(new Error("Network error"));
      });

      expect(screen.getByRole("button", { name: /시간 추가/ })).toHaveTextContent("5시간");
    });

    it("does not restore a failed amount after a newer amount was submitted", async () => {
      let rejectFirst: (reason: unknown) => void;
      let resolveSecond: (value: unknown) => void;
      mockFetch
        .mockReturnValueOnce(new Promise((_, reject) => { rejectFirst = reject; }))
        .mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve; }));

      render(<Harness timerId={timerId} status="RUNNING" remainingSeconds={5000} />);

      fireEvent.change(screen.getByLabelText("시청자 닉네임"), { target: { value: "테스터" } });
      fireEvent.click(screen.getByRole("button", { name: "+1시간" }));
      fireEvent.click(screen.getByRole("button", { name: /시간 추가/ }));

      // 응답 전에 다른 금액을 다시 제출
      fireEvent.click(screen.getByRole("button", { name: "+5시간" }));
      fireEvent.click(screen.getByRole("button", { name: /시간 추가/ }));

      await act(async () => {
        rejectFirst!(new Error("Network error"));
      });
      await act(async () => {
        resolveSecond!({
          ok: true,
          json: async () => ({
            data: {
              id: timerId,
              remainingSeconds: 23000,
              status: "RUNNING",
              log: { id: "log2", actionType: "ADD", actorName: "테스터", actorUserId: null, deltaSeconds: 18000, beforeSeconds: 5000, afterSeconds: 23000, createdAt: "2026-01-01T00:00:00Z" },
            },
          }),
        });
      });

      // 대체된 1시간이 되살아나지 않고 입력은 비어 있어야 한다
      expect(screen.queryByRole("button", { name: /시간 추가 \(/ })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "시간 추가" })).toBeDisabled();
    });

    it("instant bar applies optimistically on tap", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            id: timerId,
            remainingSeconds: 10800,
            status: "RUNNING",
            log: { id: "log1", actionType: "ADD", actorName: "테스터", actorUserId: null, deltaSeconds: 3600, beforeSeconds: 7200, afterSeconds: 10800, createdAt: "2026-01-01T00:00:00Z" },
          },
        }),
      });

      const onModified = vi.fn();
      render(
        <Harness
          timerId={timerId}
          status="RUNNING"
          remainingSeconds={7200}
          onModified={onModified}
        />,
      );

      // 닉네임 입력
      fireEvent.change(screen.getByLabelText("시청자 닉네임"), {
        target: { value: "테스터" },
      });

      // 하단 바 클릭 — 즉시 optimistic 적용
      fireEvent.click(screen.getByRole("button", { name: "+1h" }));

      expect(onModified).toHaveBeenCalledTimes(1);
      expect(onModified).toHaveBeenCalledWith(
        expect.objectContaining({
          remainingSeconds: 10800,
        }),
      );

      // 서버 확정
      await waitFor(() => {
        expect(onModified).toHaveBeenCalledTimes(2);
      });
    });

    it("allows consecutive submissions without blocking", async () => {
      let resolveFirst: (value: Response) => void;
      let resolveSecond: (value: Response) => void;

      mockFetch
        .mockReturnValueOnce(new Promise((r) => { resolveFirst = r; }))
        .mockReturnValueOnce(new Promise((r) => { resolveSecond = r; }));

      const onModified = vi.fn();
      render(
        <Harness
          timerId={timerId}
          status="RUNNING"
          remainingSeconds={3600}
          onModified={onModified}
        />,
      );

      fireEvent.change(screen.getByLabelText("시청자 닉네임"), {
        target: { value: "테스터" },
      });

      // 첫 번째 하단 바 클릭
      fireEvent.click(screen.getByRole("button", { name: "+1h" }));
      expect(onModified).toHaveBeenCalledTimes(1);

      // 두 번째 클릭 — 첫 번째 API 완료 전
      fireEvent.click(screen.getByRole("button", { name: "+1h" }));
      expect(onModified).toHaveBeenCalledTimes(2);

      // fetch가 2번 호출됨 (loading으로 블로킹되지 않음)
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // 정리
      await act(async () => {
        resolveFirst!({ ok: true, json: async () => ({ data: { id: timerId, remainingSeconds: 7200, status: "RUNNING", log: { id: "l1" } } }) } as Response);
        resolveSecond!({ ok: true, json: async () => ({ data: { id: timerId, remainingSeconds: 10800, status: "RUNNING", log: { id: "l2" } } }) } as Response);
      });
    });
  });

  // UX-15·UX-16: 모바일 하단 바는 즉시 적용되므로 그 사실과 기록될 닉네임을 항상 보여 준다
  describe("mobile quick bar caption", () => {
    it("asks for a nickname and disables the bar when no actor is available", () => {
      render(<Harness timerId={timerId} status="RUNNING" />);
      expect(screen.getByText("닉네임을 먼저 입력하세요")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "+1h" })).toBeDisabled();
    });

    it("shows the typed nickname as the target", () => {
      render(<Harness timerId={timerId} status="RUNNING" />);
      fireEvent.change(screen.getByLabelText("시청자 닉네임"), { target: { value: " 치즈냥 " } });
      expect(screen.getByText("즉시 적용 → 치즈냥")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "+1h" })).toBeEnabled();
    });

    it("falls back to the default nickname and submits with the shown name", async () => {
      localStorageMock.setItem("defaultActorName", "기본냥");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: timerId, remainingSeconds: 7200, status: "RUNNING", log: { id: "l1" } } }),
      });
      render(<Harness timerId={timerId} status="RUNNING" remainingSeconds={3600} />);

      // 기본 닉네임이 입력란에 채워진 뒤 비워도 기본 닉네임으로 기록된다
      fireEvent.change(screen.getByLabelText("시청자 닉네임"), { target: { value: "" } });
      expect(screen.getByText("즉시 적용 → 기본냥")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "+1h" }));
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toEqual({ action: "ADD", deltaSeconds: 3600, actorName: "기본냥" });
      await waitFor(() => expect(mockToast).toHaveBeenCalledWith("추가 완료", "success"));
    });
  });
});
