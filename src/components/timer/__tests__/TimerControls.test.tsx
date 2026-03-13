// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { TimerControls } from "../TimerControls";

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
    render(<TimerControls timerId={timerId} status="RUNNING" />);
    expect(screen.getByLabelText("시청자 닉네임")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "추가" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "차감" })).toBeInTheDocument();
  });

  it("shows message for SCHEDULED timers", () => {
    render(<TimerControls timerId={timerId} status="SCHEDULED" />);
    expect(screen.getByText(/예약된 타이머/)).toBeInTheDocument();
    expect(screen.queryByLabelText("시청자 닉네임")).not.toBeInTheDocument();
  });

  it("renders time presets", () => {
    render(<TimerControls timerId={timerId} status="RUNNING" />);
    expect(screen.getByRole("button", { name: "+1시간" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+5시간" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+10시간" })).toBeInTheDocument();
  });

  it("accumulates preset clicks in standard mode", () => {
    render(<TimerControls timerId={timerId} status="RUNNING" />);
    const btn1h = screen.getByRole("button", { name: "+1시간" });

    fireEvent.click(btn1h);
    fireEvent.click(btn1h);

    const submit = screen.getByRole("button", { name: /추가 확인/ });
    expect(submit).toHaveTextContent("2시간");
  });

  it("validates empty nickname on submit", async () => {
    render(<TimerControls timerId={timerId} status="RUNNING" />);

    fireEvent.click(screen.getByRole("button", { name: "+1시간" }));

    const submit = screen.getByRole("button", { name: /추가 확인/ });
    fireEvent.click(submit);

    expect(screen.getByRole("alert")).toHaveTextContent("시청자 닉네임을 입력해주세요");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("validates zero time on submit", async () => {
    render(<TimerControls timerId={timerId} status="RUNNING" />);

    fireEvent.change(screen.getByLabelText("시청자 닉네임"), {
      target: { value: "테스터" },
    });

    const submit = screen.getByRole("button", { name: /시간을 입력해주세요/ });
    expect(submit).toBeDisabled();
  });

  it("switches to SUBTRACT action", () => {
    render(<TimerControls timerId={timerId} status="RUNNING" />);

    const subtract = screen.getByRole("radio", { name: "차감" });
    fireEvent.click(subtract);

    expect(subtract).toHaveAttribute("aria-checked", "true");
  });

  // ─── Optimistic UI Tests ───

  describe("optimistic UI", () => {
    it("calls onModified immediately with optimistic value before API resolves", async () => {
      let fetchResolve: (value: Response) => void;
      mockFetch.mockReturnValueOnce(new Promise((resolve) => { fetchResolve = resolve; }));

      const onModified = vi.fn();
      render(
        <TimerControls
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
      fireEvent.click(screen.getByRole("button", { name: /추가 확인/ }));

      // onModified는 fetch 완료 전에 optimistic 값으로 즉시 호출됨
      expect(onModified).toHaveBeenCalledTimes(1);
      expect(onModified).toHaveBeenCalledWith(
        expect.objectContaining({
          id: timerId,
          remainingSeconds: 10800, // 7200 + 3600
          status: "RUNNING",
        }),
      );

      // 토스트도 즉시 표시
      expect(mockToast).toHaveBeenCalledWith("추가 완료", "success");

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

      // 서버 값으로 확정
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
        <TimerControls
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
      expect(screen.getByRole("button", { name: /추가 확인/ })).toHaveTextContent("1시간");

      fireEvent.click(screen.getByRole("button", { name: /추가 확인/ }));

      // 입력 필드가 즉시 초기화됨 (API 응답 전)
      expect(screen.getByRole("button", { name: /시간을 입력해주세요/ })).toBeInTheDocument();
    });

    it("calculates optimistic SUBTRACT correctly (clamped to 0)", async () => {
      mockFetch.mockReturnValueOnce(new Promise(() => {}));

      const onModified = vi.fn();
      render(
        <TimerControls
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
      fireEvent.click(screen.getByRole("button", { name: /차감 확인/ }));

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
        <TimerControls
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
      fireEvent.click(screen.getByRole("button", { name: /추가 확인/ }));

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
    });

    it("rolls back on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const onModified = vi.fn();
      render(
        <TimerControls
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
      fireEvent.click(screen.getByRole("button", { name: /추가 확인/ }));

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
    });

    it("quick mode applies optimistically on preset tap", async () => {
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
        <TimerControls
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

      // 빠른 적용 모드 활성화
      fireEvent.click(screen.getByRole("checkbox"));

      // 프리셋 클릭 — 즉시 optimistic 적용
      fireEvent.click(screen.getByRole("button", { name: "+1시간" }));

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
        <TimerControls
          timerId={timerId}
          status="RUNNING"
          remainingSeconds={3600}
          onModified={onModified}
        />,
      );

      // 닉네임 + 빠른 적용 모드
      fireEvent.change(screen.getByLabelText("시청자 닉네임"), {
        target: { value: "테스터" },
      });
      fireEvent.click(screen.getByRole("checkbox"));

      // 첫 번째 프리셋 클릭
      fireEvent.click(screen.getByRole("button", { name: "+1시간" }));
      expect(onModified).toHaveBeenCalledTimes(1);

      // 두 번째 프리셋 클릭 — 첫 번째 API 완료 전
      fireEvent.click(screen.getByRole("button", { name: "+1시간" }));
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
});
