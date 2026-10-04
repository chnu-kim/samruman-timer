// @vitest-environment jsdom
import { useState, type ComponentProps } from "react";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { TimerControls, MODIFY_FAILED_FORM_MESSAGE, MODIFY_FAILED_QUICK_MESSAGE, NICKNAME_REQUIRED_MESSAGE, NICKNAME_PROMPT_MESSAGE, DISCONNECTED_HINT_MESSAGE } from "../TimerControls";
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

// jsdom에는 native <dialog>의 showModal/close가 없다('지금 시작' 확인창). scrollIntoView도 없다(닉네임 안내)
const scrollIntoViewMock = vi.fn();
beforeAll(() => {
  Element.prototype.scrollIntoView = scrollIntoViewMock;
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});

// '지금 시작'은 되돌릴 수 없어 확인창을 한 번 거친다
async function confirmActivate() {
  fireEvent.click(screen.getByRole("button", { name: "지금 시작" }));
  const title = await screen.findByRole("heading", { name: "지금 시작" });
  fireEvent.click(within(title.closest("dialog")!).getByRole("button", { name: "지금 시작" }));
}

// jsdom은 CSS를 적용하지 않아 카드(md 이상)와 모바일 하단 바의 같은 이름 버튼이 함께 렌더된다. 둘을 나눠 찾는다
function quickBar() {
  return within(document.querySelector("[data-quick-bar]") as HTMLElement);
}
function cardButton(name: string | RegExp) {
  const found = screen.getAllByRole("button", { name }).filter((b) => !b.closest("[data-quick-bar]"));
  if (found.length !== 1) throw new Error(`card button ${String(name)}: ${found.length}`);
  return found[0];
}

describe("TimerControls", () => {
  const timerId = "abc123";

  beforeEach(() => {
    mockFetch.mockReset();
    mockToast.mockReset();
    scrollIntoViewMock.mockReset();
    localStorageMock.clear();
  });

  it("renders nickname input and action toggle", () => {
    render(<Harness timerId={timerId} status="RUNNING" />);
    expect(screen.getByLabelText("시청자 닉네임")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "추가" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "차감" })).toBeInTheDocument();
  });

  // C122: 단축키를 알리는 것은 추가/차감 토글의 X 하나뿐이다(프리셋 칩은 숫자키와 동작이 달라 붙이지 않는다)
  it("추가/차감 토글만 aria-keyshortcuts='X'를 가진다", () => {
    const { container } = render(<Harness timerId={timerId} status="RUNNING" />);
    const radios = [screen.getByRole("radio", { name: "추가" }), screen.getByRole("radio", { name: "차감" })];
    for (const radio of radios) expect(radio).toHaveAttribute("aria-keyshortcuts", "X");
    expect([...container.querySelectorAll("[aria-keyshortcuts]")]).toEqual(radios);
  });

  // C031: 예약 타이머는 시간 변경 대신 '지금 시작' 하나만 둔다
  it("SCHEDULED에서는 안내 한 줄과 '지금 시작' 버튼만 보인다", () => {
    render(<Harness timerId={timerId} status="SCHEDULED" />);
    expect(screen.getByText(/시작 시각까지 기다리거나 지금 시작할 수 있습니다/)).toBeInTheDocument();
    // 시작을 늦추는 방법(삭제 후 다시 만들기)은 계속 알린다
    expect(screen.getByText(/삭제한 뒤 다시 만드세요/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "지금 시작" })).toBeInTheDocument();
    expect(screen.queryByLabelText("시청자 닉네임")).not.toBeInTheDocument();
  });

  // 카드 바닥 여백이 위와 같도록 space-y(숨은 마지막 자식에 margin이 남음) 대신 gap을 쓴다
  it("루트가 gap 레이아웃이라 숨은 마지막 자식이 바닥 여백을 만들지 않는다", () => {
    const { container: scheduled } = render(<Harness timerId={timerId} status="SCHEDULED" />);
    const sRoot = scheduled.firstElementChild as HTMLElement;
    expect(sRoot.className).toMatch(/\bgap-3\b/);
    expect(sRoot.className).not.toMatch(/space-y/);
    const { container: running } = render(<Harness timerId={timerId} status="RUNNING" />);
    const form = running.querySelector("form") as HTMLElement;
    expect(form.className).toMatch(/\bgap-5\b/);
    expect(form.className).not.toMatch(/space-y/);
  });

  it("'지금 시작'은 activate API를 부르고 서버 응답으로 상위를 갱신한다", async () => {
    const data = {
      id: timerId,
      remainingSeconds: 3600,
      status: "RUNNING",
      log: { id: "log1", actionType: "ACTIVATE", actorName: "owner", actorUserId: "u1", deltaSeconds: 0, beforeSeconds: 3600, afterSeconds: 3600, createdAt: "2026-10-04T00:00:00.000Z" },
    };
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data }), { status: 200 }));
    const onModified = vi.fn();
    render(<Harness timerId={timerId} status="SCHEDULED" onModified={onModified} />);

    const button = screen.getByRole("button", { name: "지금 시작" });
    // 확인 전에는 요청하지 않는다
    fireEvent.click(button);
    expect(mockFetch).not.toHaveBeenCalled();
    fireEvent.click(within((await screen.findByRole("heading", { name: "지금 시작" })).closest("dialog")!).getByRole("button", { name: "지금 시작" }));
    // 요청 중에는 두 번 누를 수 없다
    expect(button).toBeDisabled();

    await waitFor(() => expect(onModified).toHaveBeenCalledWith(data));
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe(`/api/timers/${timerId}/activate`);
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: "POST" });
    // 낙관적 반영을 하지 않으므로 상위 갱신은 서버 응답 한 번뿐이다
    expect(onModified).toHaveBeenCalledTimes(1);
  });

  it("확인창에서 돌아가기를 누르면 시작하지 않는다", async () => {
    render(<Harness timerId={timerId} status="SCHEDULED" />);
    fireEvent.click(screen.getByRole("button", { name: "지금 시작" }));
    const dialog = (await screen.findByRole("heading", { name: "지금 시작" })).closest("dialog")!;
    fireEvent.click(within(dialog).getByRole("button", { name: "돌아가기" }));
    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("이미 삭제된 타이머(404)면 상위에 알려 '타이머 없음'으로 바꾼다", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "타이머를 찾을 수 없습니다" } }), { status: 404 }),
    );
    const onTimerRemoved = vi.fn();
    render(<Harness timerId={timerId} status="SCHEDULED" onTimerRemoved={onTimerRemoved} />);
    await confirmActivate();
    await waitFor(() => expect(onTimerRemoved).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("'지금 시작'이 실패하면 서버 메시지를 버튼 아래에 알리고 상위를 바꾸지 않는다", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "잠시 후 다시 시도해 주세요" } }), { status: 500 }),
    );
    const onModified = vi.fn();
    render(<Harness timerId={timerId} status="SCHEDULED" onModified={onModified} />);

    await confirmActivate();

    expect(await screen.findByRole("alert")).toHaveTextContent("잠시 후 다시 시도해 주세요");
    expect(screen.getByRole("button", { name: "지금 시작" })).toBeEnabled();
    expect(onModified).not.toHaveBeenCalled();
  });

  it("시간 입력 묶음의 이름은 카드 제목·칸 이름과 겹치지 않는다", () => {
    render(<Harness timerId={timerId} status="RUNNING" />);
    const group = screen.getByRole("group", { name: "변경할 시간" });
    expect(within(group).getByRole("spinbutton", { name: "시" })).toBeInTheDocument();
    expect(within(group).getByRole("spinbutton", { name: "분" })).toBeInTheDocument();
    expect(within(group).getByRole("spinbutton", { name: "초" })).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: "시간" })).not.toBeInTheDocument();
  });

  it("renders time presets", () => {
    render(<Harness timerId={timerId} status="RUNNING" />);
    expect(cardButton("+1시간")).toBeInTheDocument();
    expect(cardButton("+5시간")).toBeInTheDocument();
    expect(cardButton("+10시간")).toBeInTheDocument();
  });

  it("accumulates preset clicks in standard mode", () => {
    render(<Harness timerId={timerId} status="RUNNING" />);
    const btn1h = cardButton("+1시간");

    fireEvent.click(btn1h);
    fireEvent.click(btn1h);

    const submit = cardButton(/시간 추가/);
    expect(submit).toHaveTextContent("2시간");
  });

  it("validates empty nickname on submit", async () => {
    render(<Harness timerId={timerId} status="RUNNING" />);

    fireEvent.click(cardButton("+1시간"));

    const submit = cardButton(/시간 추가/);
    fireEvent.click(submit);

    expect(screen.getByRole("alert")).toHaveTextContent("시청자 닉네임을 입력해 주세요");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("validates zero time on submit", async () => {
    render(<Harness timerId={timerId} status="RUNNING" />);

    fireEvent.change(screen.getByLabelText("시청자 닉네임"), {
      target: { value: "테스터" },
    });

    const submit = cardButton("시간 추가");
    expect(submit).toBeDisabled();
  });

  // UX-13·R25: 만료 상태에서 추가가 곧 재시작임을 결과 한 줄로 미리 알린다
  it("shows restart notice for EXPIRED timers", () => {
    render(<Harness timerId={timerId} status="EXPIRED" remainingSeconds={0} />);
    expect(screen.getByText("시간을 추가하면 다시 시작됩니다")).toBeInTheDocument();
    expect(screen.getByLabelText("시청자 닉네임")).toBeInTheDocument();
  });

  it("does not show restart notice for RUNNING timers", () => {
    render(<Harness timerId={timerId} status="RUNNING" />);
    expect(screen.queryByText("시간을 추가하면 다시 시작됩니다")).not.toBeInTheDocument();
  });

  // R25: 만료(잔여 0)에서는 차감할 시간이 없으므로 세그먼트를 숨기고 모든 경로를 '추가'로 고정한다
  describe("만료 상태는 추가로 고정", () => {
    function okResponse(action: ModifyAction, delta: number) {
      return {
        ok: true,
        json: async () => ({ data: { id: timerId, remainingSeconds: delta, status: "RUNNING", log: { id: "l1", actionType: action, actorName: "시청자A", deltaSeconds: delta } } }),
      };
    }

    it("만료면 추가/차감 radio가 없고 닉네임 칸이 한 줄을 다 쓴다", () => {
      render(<Harness timerId={timerId} status="EXPIRED" remainingSeconds={0} initialAction="SUBTRACT" />);
      expect(screen.queryAllByRole("radio")).toHaveLength(0);
      expect(screen.queryByText("변경 유형")).not.toBeInTheDocument();
      expect(screen.getByLabelText("시청자 닉네임").closest(".flex-col.gap-5")!.className).not.toContain("md:grid-cols");
    });

    it("차감을 고른 뒤 만료되면 바 프리셋은 '+'로 보이고 ADD로 보낸다", async () => {
      mockFetch.mockResolvedValueOnce(okResponse("ADD", 3600));
      const { rerender } = render(<Harness timerId={timerId} status="RUNNING" remainingSeconds={60} initialAction="SUBTRACT" />);
      fireEvent.change(screen.getByLabelText("시청자 닉네임"), { target: { value: "시청자A" } });
      expect(quickBar().getAllByRole("button").map((b) => b.textContent)).toEqual(["-1시간", "-5시간", "-10시간"]);

      // 카운트다운이 0에 닿음(상위가 expired로 알린다. status는 폴링 전이라 아직 RUNNING)
      rerender(<Harness timerId={timerId} status="RUNNING" remainingSeconds={60} initialAction="SUBTRACT" expired />);
      expect(screen.queryAllByRole("radio")).toHaveLength(0);
      expect(quickBar().getAllByRole("button").map((b) => b.textContent)).toEqual(["+1시간", "+5시간", "+10시간"]);

      fireEvent.click(quickBar().getByRole("button", { name: "+1시간" }));
      expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ action: "ADD", deltaSeconds: 3600, actorName: "시청자A" });
    });

    // 토글은 카운트다운이 0에 닿으면 사용자 조작 없이 사라진다. 그 안의 포커스가 body로 떨어지지 않게 재시작 안내로 옮긴다
    it("차감 radio에 포커스가 있을 때 만료되면 포커스가 재시작 안내로 옮겨지고 바는 숨지 않는다", () => {
      const { rerender } = render(<Harness timerId={timerId} status="RUNNING" remainingSeconds={3} initialAction="SUBTRACT" />);
      const radio = screen.getByRole("radio", { name: "차감" });
      act(() => radio.focus());
      expect(document.activeElement).toBe(radio);

      rerender(<Harness timerId={timerId} status="RUNNING" remainingSeconds={3} initialAction="SUBTRACT" expired />);
      expect(document.activeElement).not.toBe(document.body);
      expect(document.activeElement).toBe(screen.getByText("시간을 추가하면 다시 시작됩니다"));
      expect((document.querySelector("[data-quick-bar]") as HTMLElement).classList.contains("hidden")).toBe(false);
    });

    // 반대 방향: 안내에 포커스가 있는 채로 시간이 추가돼 재시작하면 안내가 사라진다. 포커스는 돌아온 토글의 선택 항목으로 간다
    it("재시작 안내에 포커스가 있을 때 재시작하면 포커스가 돌아온 토글의 선택 항목으로 간다(스크롤 없이)", () => {
      const { rerender } = render(<Harness timerId={timerId} status="RUNNING" remainingSeconds={3} initialAction="SUBTRACT" />);
      act(() => screen.getByRole("radio", { name: "차감" }).focus());
      rerender(<Harness timerId={timerId} status="RUNNING" remainingSeconds={3} initialAction="SUBTRACT" expired />);
      const notice = screen.getByText("시간을 추가하면 다시 시작됩니다");
      expect(document.activeElement).toBe(notice);

      const focusSpy = vi.spyOn(HTMLElement.prototype, "focus");
      rerender(<Harness timerId={timerId} status="RUNNING" remainingSeconds={3600} initialAction="SUBTRACT" />);
      expect(screen.queryByText("시간을 추가하면 다시 시작됩니다")).not.toBeInTheDocument();
      expect(document.activeElement).not.toBe(document.body);
      const selected = screen.getAllByRole("radio").find((r) => r.getAttribute("aria-checked") === "true");
      expect(document.activeElement).toBe(selected);
      expect(focusSpy).toHaveBeenLastCalledWith({ preventScroll: true });
      focusSpy.mockRestore();
    });

    it("재시작 안내를 떠난 뒤(다른 칸으로 이동) 재시작하면 포커스를 옮기지 않는다", () => {
      const { rerender } = render(<Harness timerId={timerId} status="RUNNING" remainingSeconds={3} initialAction="SUBTRACT" />);
      act(() => screen.getByRole("radio", { name: "차감" }).focus());
      rerender(<Harness timerId={timerId} status="RUNNING" remainingSeconds={3} initialAction="SUBTRACT" expired />);
      const input = screen.getByLabelText("시청자 닉네임");
      act(() => input.focus());
      rerender(<Harness timerId={timerId} status="RUNNING" remainingSeconds={3600} initialAction="SUBTRACT" />);
      expect(document.activeElement).toBe(input);
    });

    it("재시작 안내로 옮길 때 스크롤하지 않는다(preventScroll)", () => {
      const { rerender } = render(<Harness timerId={timerId} status="RUNNING" remainingSeconds={3} initialAction="SUBTRACT" />);
      act(() => screen.getByRole("radio", { name: "차감" }).focus());
      const focusSpy = vi.spyOn(HTMLElement.prototype, "focus");
      try {
        rerender(<Harness timerId={timerId} status="RUNNING" remainingSeconds={3} initialAction="SUBTRACT" expired />);
        const notice = screen.getByText("시간을 추가하면 다시 시작됩니다");
        expect(document.activeElement).toBe(notice);
        const call = focusSpy.mock.contexts.findIndex((el) => el === notice);
        expect(focusSpy.mock.calls[call]).toEqual([{ preventScroll: true }]);
      } finally {
        focusSpy.mockRestore();
      }
    });

    // 빈 곳 클릭은 relatedTarget 없이 body로 포커스를 보낸다. 그 뒤 만료돼도 보던 위치에서 끌어오지 않는다
    it("토글에서 빈 곳으로 포커스가 빠진(relatedTarget 없음) 뒤 만료되면 포커스를 옮기지 않는다", async () => {
      const { rerender } = render(<Harness timerId={timerId} status="RUNNING" remainingSeconds={3} initialAction="SUBTRACT" />);
      const radio = screen.getByRole("radio", { name: "차감" });
      act(() => radio.focus());
      act(() => radio.blur());
      expect(document.activeElement).toBe(document.body);
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

      rerender(<Harness timerId={timerId} status="RUNNING" remainingSeconds={3} initialAction="SUBTRACT" expired />);
      expect(document.activeElement).toBe(document.body);
    });

    // 창 전환(OBS로 이동)은 relatedTarget 없이 blur가 오지만 activeElement는 radio로 남는다. 이때는 여전히 토글 안이다
    it("창 전환으로 blur만 오고 activeElement가 radio면 만료 때 재시작 안내로 옮긴다", async () => {
      const { rerender } = render(<Harness timerId={timerId} status="RUNNING" remainingSeconds={3} initialAction="SUBTRACT" />);
      const radio = screen.getByRole("radio", { name: "차감" });
      act(() => radio.focus());
      fireEvent.blur(radio);
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      expect(document.activeElement).toBe(radio);

      rerender(<Harness timerId={timerId} status="RUNNING" remainingSeconds={3} initialAction="SUBTRACT" expired />);
      expect(document.activeElement).toBe(screen.getByText("시간을 추가하면 다시 시작됩니다"));
    });

    it("포커스가 토글 밖에 있으면 만료돼도 포커스를 옮기지 않는다", () => {
      const { rerender } = render(<Harness timerId={timerId} status="RUNNING" remainingSeconds={3} initialAction="SUBTRACT" />);
      const radio = screen.getByRole("radio", { name: "차감" });
      act(() => radio.focus());
      const chipless = screen.getAllByLabelText("분")[0];
      act(() => chipless.focus());
      rerender(<Harness timerId={timerId} status="RUNNING" remainingSeconds={3} initialAction="SUBTRACT" expired />);
      expect(document.activeElement).toBe(chipless);
    });

    it("차감을 고른 뒤 만료되면 카드 확인 버튼도 '시간 추가'로 ADD를 보낸다", async () => {
      mockFetch.mockResolvedValueOnce(okResponse("ADD", 600));
      render(<Harness timerId={timerId} status="EXPIRED" remainingSeconds={0} initialAction="SUBTRACT" />);
      fireEvent.change(screen.getByLabelText("시청자 닉네임"), { target: { value: "시청자A" } });
      fireEvent.change(screen.getAllByLabelText("분")[0], { target: { value: "10" } });
      const submit = cardButton("시간 추가 (10분)");
      expect(submit.className).not.toMatch(/bg-red/);
      fireEvent.click(submit);
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
      expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchObject({ action: "ADD", deltaSeconds: 600 });
    });
  });

  // R27: 연결이 끊겨도 버튼은 막지 않고 안내 줄 문구만 바꾼다
  it("연결이 끊기면 안내 줄만 바뀌고 버튼은 그대로 활성이다", () => {
    render(<Harness timerId={timerId} status="RUNNING" disconnected />);
    fireEvent.change(screen.getByLabelText("시청자 닉네임"), { target: { value: "시청자A" } });
    expect(screen.getByText(DISCONNECTED_HINT_MESSAGE)).toBeInTheDocument();
    for (const b of quickBar().getAllByRole("button")) expect(b).toBeEnabled();
    // 바 캡션(모드의 색 외 단서)은 그대로 둔다
    expect(screen.getByText("즉시 적용 → 시청자A")).toBeInTheDocument();
    fireEvent.change(screen.getAllByLabelText("분")[0], { target: { value: "10" } });
    expect(cardButton("시간 추가 (10분)")).toBeEnabled();
    expect(screen.getByText(DISCONNECTED_HINT_MESSAGE)).toBeInTheDocument();
  });

  // 시간이 비어 비활성인 확인 버튼은 연결이 끊겨도 진짜 이유(시간 입력)를 설명에 남긴다. 재연결만 기다리라고 읽히면 안 된다
  it("연결이 끊기고 시간이 0이면 확인 버튼 설명에 시간 입력 이유와 연결 안내가 함께 있다", () => {
    render(<Harness timerId={timerId} status="RUNNING" disconnected />);
    const submit = cardButton("시간 추가");
    expect(submit).toBeDisabled();
    expect(submit).toHaveAccessibleDescription(`시간을 입력하면 추가할 수 있습니다. ${DISCONNECTED_HINT_MESSAGE}`);
    fireEvent.change(screen.getAllByLabelText("분")[0], { target: { value: "10" } });
    expect(cardButton("시간 추가 (10분)")).toHaveAccessibleDescription(DISCONNECTED_HINT_MESSAGE);
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
    expect(screen.getByRole("spinbutton", { name: "시" })).toHaveValue(1);
    expect(screen.getByRole("spinbutton", { name: "분" })).toHaveValue(30);
    expect(cardButton("시간 추가 (1시간 30분)")).toBeEnabled();

    fireEvent.change(screen.getByRole("spinbutton", { name: "초" }), { target: { value: "75" } });
    expect(screen.getByRole("spinbutton", { name: "분" })).toHaveValue(31);
    expect(screen.getByRole("spinbutton", { name: "초" })).toHaveValue(15);
    expect(screen.queryByText(/0~59/)).not.toBeInTheDocument();
  });

  // W36과 같은 규칙: 칸을 비우면 '0'을 다시 채우지 않고 빈 칸(placeholder '0')으로 둔다. 빈 칸은 0으로 센다
  it("시간 칸을 비우면 빈 칸으로 남고 0으로 센다", () => {
    render(<Harness timerId={timerId} status="RUNNING" />);
    const hours = screen.getByRole("spinbutton", { name: "시" });
    const minutes = screen.getByRole("spinbutton", { name: "분" });
    // 처음에는 빈 칸(placeholder '0')이다
    expect(hours).toHaveValue(null);
    expect(hours).toHaveAttribute("placeholder", "0");

    fireEvent.change(hours, { target: { value: "2" } });
    fireEvent.change(minutes, { target: { value: "5" } });
    expect(cardButton("시간 추가 (2시간 5분)")).toBeEnabled();

    fireEvent.change(hours, { target: { value: "" } });
    expect(hours).toHaveValue(null);
    expect(minutes).toHaveValue(5);
    expect(cardButton("시간 추가 (5분)")).toBeEnabled();

    fireEvent.change(minutes, { target: { value: "" } });
    expect(minutes).toHaveValue(null);
    expect(cardButton("시간 추가")).toBeDisabled();
  });

  it("프리셋은 빈 칸을 0으로 보고 더하고, 0인 칸은 빈 칸으로 둔다", () => {
    render(<Harness timerId={timerId} status="RUNNING" />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "분" }), { target: { value: "30" } });
    fireEvent.click(cardButton("+1시간"));
    expect(screen.getByRole("spinbutton", { name: "시" })).toHaveValue(1);
    expect(screen.getByRole("spinbutton", { name: "분" })).toHaveValue(30);
    expect(screen.getByRole("spinbutton", { name: "초" })).toHaveValue(null);
  });

  it("올림이 윗자리까지 이어진다(59분 + 초 75 → 1시간 0분 15초)", () => {
    render(<Harness timerId={timerId} status="RUNNING" />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "분" }), { target: { value: "59" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "초" }), { target: { value: "75" } });
    expect(cardButton("시간 추가 (1시간 15초)")).toBeInTheDocument();
  });

  // C087: 버튼 라벨은 늘 동작이고, 비활성 이유는 입력칸 아래 한 줄로 알린다
  it("값이 0이면 확인 버튼은 '시간 추가'로 비활성이고 이유가 연결되어 있다", () => {
    render(<Harness timerId={timerId} status="RUNNING" />);
    const submit = cardButton("시간 추가");
    expect(submit).toBeDisabled();
    expect(submit).toHaveAccessibleDescription("시간을 입력하면 추가할 수 있습니다.");

    fireEvent.click(screen.getByRole("radio", { name: "차감" }));
    expect(cardButton("시간 차감")).toHaveAccessibleDescription("시간을 입력하면 차감할 수 있습니다.");

    fireEvent.click(cardButton("+1시간"));
    expect(cardButton("시간 차감 (1시간)")).not.toHaveAccessibleDescription();
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
    expect(cardButton("+1시간")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("시청자 닉네임"), { target: { value: "테스터" } });
    fireEvent.click(quickBar().getByRole("button", { name: "-1시간" }));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ action: "SUBTRACT", deltaSeconds: 3600 });
  });

  it("has no quick-apply mode toggle; card presets only fill the input", () => {
    render(<Harness timerId={timerId} status="RUNNING" />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("시청자 닉네임"), { target: { value: "테스터" } });
    fireEvent.click(cardButton("+1시간"));
    expect(mockFetch).not.toHaveBeenCalled();
    expect(cardButton("시간 추가 (1시간)")).toBeEnabled();
  });

  it("uses danger style for the confirm button when subtracting", () => {
    render(<Harness timerId={timerId} status="RUNNING" />);
    fireEvent.click(cardButton("+1시간"));
    const addConfirm = cardButton(/시간 추가/);
    const addClass = addConfirm.className;

    fireEvent.click(screen.getByRole("radio", { name: "차감" }));
    const subtractConfirm = cardButton(/시간 차감/);
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
      fireEvent.click(cardButton("+1시간"));
      fireEvent.click(cardButton(/시간 추가/));

      // onModified는 fetch 완료 전에 optimistic 값으로 즉시 호출됨
      expect(onModified).toHaveBeenCalledTimes(1);
      expect(onModified).toHaveBeenCalledWith(
        expect.objectContaining({
          id: timerId,
          remainingSeconds: 10800, // 7200 + 3600
          status: "RUNNING",
        }),
      );

      // UX-10: 성공 토스트는 서버 응답 전에는 뜨지 않는다(되돌릴 기록 id가 응답에 있다)
      expect(mockToast).not.toHaveBeenCalled();

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

      // 서버 값으로 확정된 뒤 성공 토스트: '+변경량 · 닉네임' + 되돌리기(C156)
      expect(mockToast).toHaveBeenCalledWith("+1시간 · 테스터", "success", {
        action: { label: "되돌리기", onClick: expect.any(Function) },
      });
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
      fireEvent.click(cardButton("+1시간"));

      // 제출 전 확인 버튼에 시간이 표시됨
      expect(cardButton(/시간 추가/)).toHaveTextContent("1시간");

      fireEvent.click(cardButton(/시간 추가/));

      // 입력 필드가 즉시 초기화됨 (API 응답 전)
      expect(cardButton("시간 추가")).toBeInTheDocument();
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
      fireEvent.click(cardButton("+1시간"));
      fireEvent.click(cardButton(/시간 차감/));

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
        status: 400,
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
      fireEvent.click(cardButton("+1시간"));
      fireEvent.click(cardButton(/시간 추가/));

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

      // 4xx는 서버가 알려 준 이유를 입력부 인라인 한 곳에만(C032: 토스트 중복 없음)
      expect(screen.getByRole("alert")).toHaveTextContent("잘못된 요청입니다");
      expect(mockToast).not.toHaveBeenCalledWith("잘못된 요청입니다", "error");
      // UX-10: 모순되는 성공 토스트가 없고, 입력값이 복원된다
      expect(mockToast).not.toHaveBeenCalledWith("추가 완료", "success");
      expect(cardButton(/시간 추가/)).toHaveTextContent("1시간");
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
      fireEvent.click(cardButton("+1시간"));
      fireEvent.click(cardButton(/시간 추가/));

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

      expect(screen.getByRole("alert")).toHaveTextContent(MODIFY_FAILED_FORM_MESSAGE);
      expect(mockToast).not.toHaveBeenCalledWith(expect.anything(), "error");
      expect(mockToast).not.toHaveBeenCalledWith("추가 완료", "success");
      expect(cardButton(/시간 추가/)).toHaveTextContent("1시간");
    });

    it("does not overwrite a new amount typed while the failed request was in flight", async () => {
      let rejectFirst: (reason: unknown) => void;
      mockFetch.mockReturnValueOnce(new Promise((_, reject) => { rejectFirst = reject; }));

      render(<Harness timerId={timerId} status="RUNNING" remainingSeconds={5000} />);

      fireEvent.change(screen.getByLabelText("시청자 닉네임"), { target: { value: "테스터" } });
      fireEvent.click(cardButton("+1시간"));
      fireEvent.click(cardButton(/시간 추가/));

      // 응답 전에 다음 금액을 입력
      fireEvent.click(cardButton("+5시간"));

      await act(async () => {
        rejectFirst!(new Error("Network error"));
      });

      expect(cardButton(/시간 추가/)).toHaveTextContent("5시간");
    });

    it("does not restore a failed amount after a newer amount was submitted", async () => {
      let rejectFirst: (reason: unknown) => void;
      let resolveSecond: (value: unknown) => void;
      mockFetch
        .mockReturnValueOnce(new Promise((_, reject) => { rejectFirst = reject; }))
        .mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve; }));

      render(<Harness timerId={timerId} status="RUNNING" remainingSeconds={5000} />);

      fireEvent.change(screen.getByLabelText("시청자 닉네임"), { target: { value: "테스터" } });
      fireEvent.click(cardButton("+1시간"));
      fireEvent.click(cardButton(/시간 추가/));

      // 응답 전에 다른 금액을 다시 제출
      fireEvent.click(cardButton("+5시간"));
      fireEvent.click(cardButton(/시간 추가/));

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
      expect(cardButton("시간 추가")).toBeDisabled();
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
      fireEvent.click(quickBar().getByRole("button", { name: "+1시간" }));

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
      fireEvent.click(quickBar().getByRole("button", { name: "+1시간" }));
      expect(onModified).toHaveBeenCalledTimes(1);

      // 두 번째 클릭 — 첫 번째 API 완료 전
      fireEvent.click(quickBar().getByRole("button", { name: "+1시간" }));
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

  // C029·C032: 실패는 한 곳에만 알린다. 세션 만료(401 SESSION_EXPIRED)는 그 안내(SessionExpiredHandler) 한 건만
  describe("failure notice channel", () => {
    const serverError = () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: "INTERNAL_ERROR", message: "서버 오류가 발생했습니다" } }),
    });

    function renderAndFill(onModified = vi.fn(), { pickPreset = true } = {}) {
      render(<Harness timerId={timerId} status="RUNNING" remainingSeconds={7200} onModified={onModified} />);
      fireEvent.change(screen.getByLabelText("시청자 닉네임"), { target: { value: "테스터" } });
      // 값을 고르면 하단 바가 제출 버튼으로 바뀌므로, 프리셋 즉시 적용 경로는 고르지 않고 시작한다
      if (pickPreset) fireEvent.click(cardButton("+1시간"));
      return onModified;
    }

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("폼에서 500이고 오류 자리가 보이면 인라인 1건, 토스트 0건(서버 원문 대신 다시 시도 안내)", async () => {
      mockFetch.mockResolvedValueOnce(serverError());
      renderAndFill();
      fireEvent.click(cardButton(/시간 추가/));

      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(MODIFY_FAILED_FORM_MESSAGE));
      expect(screen.getAllByRole("alert")).toHaveLength(1);
      expect(mockToast).not.toHaveBeenCalled();
      // 입력은 되살아나 다시 확인을 누를 수 있다
      expect(cardButton(/시간 추가/)).toHaveTextContent("1시간");
    });

    it("폼에서 실패했지만 확인 버튼이 화면 밖이면 토스트 1건, 인라인 0건", async () => {
      // 요청 중 스크롤해 입력부가 뷰포트 아래로 내려간 상황
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
        top: 2000, bottom: 2048, height: 48, left: 0, right: 100, width: 100, x: 0, y: 2000, toJSON: () => ({}),
      } as DOMRect);
      mockFetch.mockResolvedValueOnce(serverError());
      renderAndFill();
      fireEvent.click(cardButton(/시간 추가/));

      await waitFor(() => expect(mockToast).toHaveBeenCalledWith(MODIFY_FAILED_FORM_MESSAGE, "error"));
      expect(mockToast).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("모바일 하단 바에 가린 확인 버튼은 보이지 않는 것으로 친다", async () => {
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        const isBar = this.hasAttribute("data-quick-bar");
        const top = isBar ? 760 : 740;
        const height = isBar ? 84 : 48;
        return { top, bottom: top + height, height, left: 0, right: 390, width: 390, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
      });
      mockFetch.mockResolvedValueOnce(serverError());
      renderAndFill();
      fireEvent.click(cardButton(/시간 추가/));

      await waitFor(() => expect(mockToast).toHaveBeenCalledWith(MODIFY_FAILED_FORM_MESSAGE, "error"));
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("하단 바 경로는 늘 토스트 1건, 인라인 0건", async () => {
      mockFetch.mockResolvedValueOnce(serverError());
      renderAndFill(vi.fn(), { pickPreset: false });
      fireEvent.click(quickBar().getByRole("button", { name: "+1시간" }));

      await waitFor(() => expect(mockToast).toHaveBeenCalledWith(MODIFY_FAILED_QUICK_MESSAGE, "error"));
      expect(mockToast).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("alert")).toBeNull();
    });

    // W34: 미들웨어가 refresh 갱신에 실패하면 SESSION_EXPIRED를 준다. 그때만 세션 만료 안내에 맡긴다
    const unauthorized = (code: "SESSION_EXPIRED" | "UNAUTHORIZED") =>
      new Response(JSON.stringify({ error: { code, message: code === "SESSION_EXPIRED" ? "유효하지 않은 세션입니다" : "인증이 필요합니다" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });

    it("세션 만료(401 SESSION_EXPIRED)면 아무 알림도 띄우지 않고(세션 만료 안내만 남게) 화면 값·입력만 되돌린다", async () => {
      mockFetch.mockResolvedValueOnce(unauthorized("SESSION_EXPIRED"));
      const onModified = renderAndFill();
      fireEvent.click(cardButton(/시간 추가/));

      await waitFor(() =>
        expect(onModified).toHaveBeenLastCalledWith(expect.objectContaining({ remainingSeconds: 7200 })),
      );
      await act(async () => {});
      expect(mockToast).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByText("유효하지 않은 세션입니다")).toBeNull();
      expect(cardButton(/시간 추가/)).toHaveTextContent("1시간");
    });

    it("세션 만료가 아닌 401은 일반 실패처럼 서버 문구를 인라인으로 알린다", async () => {
      mockFetch.mockResolvedValueOnce(unauthorized("UNAUTHORIZED"));
      const onModified = renderAndFill();
      fireEvent.click(cardButton(/시간 추가/));

      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("인증이 필요합니다"));
      expect(onModified).toHaveBeenLastCalledWith(expect.objectContaining({ remainingSeconds: 7200 }));
      expect(mockToast).not.toHaveBeenCalled();
      expect(cardButton(/시간 추가/)).toHaveTextContent("1시간");
    });

    it("하단 바도 세션 만료면 알리지 않는다", async () => {
      mockFetch.mockResolvedValueOnce(unauthorized("SESSION_EXPIRED"));
      renderAndFill(vi.fn(), { pickPreset: false });
      fireEvent.click(quickBar().getByRole("button", { name: "+1시간" }));
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
      await act(async () => {});
      expect(mockToast).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("하단 바의 세션 만료가 아닌 401은 서버 문구 토스트 한 건", async () => {
      mockFetch.mockResolvedValueOnce(unauthorized("UNAUTHORIZED"));
      renderAndFill(vi.fn(), { pickPreset: false });
      fireEvent.click(quickBar().getByRole("button", { name: "+1시간" }));
      await waitFor(() => expect(mockToast).toHaveBeenCalledWith("인증이 필요합니다", "error"));
      expect(mockToast).toHaveBeenCalledTimes(1);
    });

    it("'지금 시작'이 세션 만료면 버튼 아래 오류를 띄우지 않는다", async () => {
      mockFetch.mockResolvedValueOnce(unauthorized("SESSION_EXPIRED"));
      render(<Harness timerId={timerId} status="SCHEDULED" />);
      await confirmActivate();
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
      await act(async () => {});
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("'지금 시작'의 세션 만료가 아닌 401은 버튼 아래 서버 문구로 알린다", async () => {
      mockFetch.mockResolvedValueOnce(unauthorized("UNAUTHORIZED"));
      render(<Harness timerId={timerId} status="SCHEDULED" />);
      await confirmActivate();
      expect(await screen.findByRole("alert")).toHaveTextContent("인증이 필요합니다");
    });

    it("닉네임 없이 제출하면 통일된 문구 하나만 인라인으로", async () => {
      render(<Harness timerId={timerId} status="RUNNING" />);
      fireEvent.click(cardButton("+1시간"));
      fireEvent.click(cardButton(/시간 추가/));
      expect(await screen.findByRole("alert")).toHaveTextContent(NICKNAME_REQUIRED_MESSAGE);
      expect(mockToast).not.toHaveBeenCalled();
    });
  });

  // UX-15·UX-16: 모바일 하단 바는 즉시 적용되므로 그 사실과 기록될 닉네임을 항상 보여 준다
  describe("mobile quick bar caption", () => {
    // R02: 닉네임이 없어도 바를 막지 않는다. 누르면 입력란으로 안내하고, 누른 프리셋은 기억했다 나중에 적용하지 않는다
    it("닉네임이 없으면 바 버튼은 활성이고, 누르면 입력란으로 포커스·스크롤하고 한 줄 안내만 띄운다", async () => {
      render(<Harness timerId={timerId} status="RUNNING" />);
      expect(screen.queryByText("닉네임을 먼저 입력하세요")).not.toBeInTheDocument();
      expect(screen.getByText("즉시 적용 → 닉네임 칸의 이름")).toBeInTheDocument();
      const barButtons = quickBar().getAllByRole("button");
      expect(barButtons.filter((b) => (b as HTMLButtonElement).disabled)).toHaveLength(0);
      // 첫 화면에서 포커스가 입력란에 있지 않다(바가 숨지 않는다)
      expect(document.activeElement).not.toBe(screen.getByLabelText("시청자 닉네임"));

      fireEvent.click(quickBar().getByRole("button", { name: "+1시간" }));
      const input = screen.getByLabelText("시청자 닉네임");
      expect(document.activeElement).toBe(input);
      expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: "center" });
      expect(screen.getByRole("alert")).toHaveTextContent(NICKNAME_PROMPT_MESSAGE);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockToast).not.toHaveBeenCalled();
      // alert가 포커스 낭독에 묻히거나 두 번째 탭에 다시 읽히지 않아도, 입력란 설명으로 이유가 함께 읽힌다
      expect(input).toHaveAccessibleDescription(NICKNAME_PROMPT_MESSAGE);
      expect(input).toHaveAttribute("aria-invalid", "true");

      // 닉네임을 입력하면 안내가 사라지고, 앞서 누른 +1시간은 적용되지 않는다
      fireEvent.change(input, { target: { value: "치즈냥" } });
      expect(screen.queryByText(NICKNAME_PROMPT_MESSAGE)).not.toBeInTheDocument();
      expect(input).not.toHaveAttribute("aria-describedby");
      expect(input).not.toHaveAttribute("aria-invalid");
      await act(async () => {});
      expect(mockFetch).not.toHaveBeenCalled();
    });

    // 바 안내와 폼 오류는 같은 뜻이라 한 줄만 남긴다(어느 순서로 눌러도)
    it("바 탭 뒤 Enter로 제출해도, 제출 뒤 바를 눌러도 alert는 하나다", () => {
      render(<Harness timerId={timerId} status="RUNNING" />);
      fireEvent.click(quickBar().getByRole("button", { name: "+1시간" }));
      fireEvent.submit(screen.getByLabelText("시청자 닉네임").closest("form")!);
      expect(screen.getAllByRole("alert")).toHaveLength(1);
      expect(screen.getByRole("alert")).toHaveTextContent(NICKNAME_PROMPT_MESSAGE);
    });

    it("닉네임 없이 제출한 뒤 바를 누르면 폼 오류가 내려가고 안내 한 줄만 남는다", () => {
      render(<Harness timerId={timerId} status="RUNNING" />);
      fireEvent.change(screen.getAllByLabelText("분")[0], { target: { value: "10" } });
      fireEvent.submit(screen.getByLabelText("시청자 닉네임").closest("form")!);
      expect(screen.getByRole("alert")).toHaveTextContent(NICKNAME_REQUIRED_MESSAGE);
      // 값이 있으면 바는 제출 버튼 하나다. 닉네임이 없으니 입력란으로 안내한다
      fireEvent.click(quickBar().getAllByRole("button")[0]);
      expect(screen.getAllByRole("alert")).toHaveLength(1);
      expect(screen.getByRole("alert")).toHaveTextContent(NICKNAME_PROMPT_MESSAGE);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    // 칩으로 닉네임을 채워도 안내 상태를 끈다. 나중에 입력란을 비워도 누르지 않은 안내가 다시 읽히지 않는다
    it("안내 후 최근 닉네임 칩을 고르고 입력란을 비우면 안내가 되살아나지 않는다", () => {
      localStorageMock.setItem("recentActors", JSON.stringify(["치즈냥"]));
      render(<Harness timerId={timerId} status="RUNNING" />);
      fireEvent.click(quickBar().getByRole("button", { name: "+1시간" }));
      expect(screen.getByRole("alert")).toHaveTextContent(NICKNAME_PROMPT_MESSAGE);

      fireEvent.click(screen.getByRole("button", { name: "치즈냥" }));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      fireEvent.change(screen.getByLabelText("시청자 닉네임"), { target: { value: "" } });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("shows the typed nickname as the target", () => {
      render(<Harness timerId={timerId} status="RUNNING" />);
      fireEvent.change(screen.getByLabelText("시청자 닉네임"), { target: { value: " 치즈냥 " } });
      expect(screen.getByText("즉시 적용 → 치즈냥")).toBeInTheDocument();
      // 기본 닉네임 안내는 '기본 닉네임으로 설정' 버튼이 보이는 자리에서만 한 줄
      expect(screen.getByRole("button", { name: "기본 닉네임으로 설정" })).toBeInTheDocument();
      expect(screen.getByText("다음부터 입력 없이 바로 적용됩니다")).toBeInTheDocument();
      expect(quickBar().getByRole("button", { name: "+1시간" })).toBeEnabled();
    });

    it("falls back to the default nickname and submits with the shown name", async () => {
      localStorageMock.setItem("defaultActorName", "기본냥");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: timerId, remainingSeconds: 7200, status: "RUNNING", log: { id: "l1", actionType: "ADD", actorName: "기본냥", deltaSeconds: 3600 } } }),
      });
      render(<Harness timerId={timerId} status="RUNNING" remainingSeconds={3600} />);

      // 기본 닉네임이 입력란에 채워진 뒤 비워도 기본 닉네임으로 기록된다
      fireEvent.change(screen.getByLabelText("시청자 닉네임"), { target: { value: "" } });
      expect(screen.getByText("즉시 적용 → 기본냥")).toBeInTheDocument();

      fireEvent.click(quickBar().getByRole("button", { name: "+1시간" }));
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toEqual({ action: "ADD", deltaSeconds: 3600, actorName: "기본냥" });
      await waitFor(() => expect(mockToast).toHaveBeenCalledWith("+1시간 · 기본냥", "success", expect.anything()));
    });
  });

  // C023·C042: 모바일에서는 하단 바 한 자리가 주 행동이다. 프리셋은 한 벌, 값을 넣으면 바가 그 값의 제출 버튼이 된다
  describe("mobile quick bar = 주 행동 한 자리", () => {
    it("카드 프리셋 행과 카드 확인 버튼은 md 이상에서만 보이고, 바는 카드와 같은 라벨을 쓴다", () => {
      render(<Harness timerId={timerId} status="RUNNING" />);
      expect(cardButton("+1시간").parentElement!.className).toMatch(/(^|\s)hidden md:flex\b/);
      expect(cardButton("시간 추가").className).toMatch(/\bmax-md:hidden\b/);
      expect(quickBar().getAllByRole("button").map((b) => b.textContent)).toEqual(["+1시간", "+5시간", "+10시간"]);
    });

    it("값이 있으면 바의 세 프리셋 자리가 '시간 추가 (10분)' 제출 버튼 하나로 바뀌고, 0이면 돌아간다", () => {
      render(<Harness timerId={timerId} status="RUNNING" />);
      fireEvent.change(screen.getByLabelText("시청자 닉네임"), { target: { value: "시청자A" } });
      fireEvent.change(screen.getAllByLabelText("분")[0], { target: { value: "10" } });

      const buttons = quickBar().getAllByRole("button");
      expect(buttons).toHaveLength(1);
      expect(buttons[0]).toHaveAccessibleName("시간 추가 (10분)");
      expect(buttons[0]).toHaveAttribute("type", "submit");
      expect(buttons[0]).toBeEnabled();
      expect(screen.getByText("즉시 적용 → 시청자A")).toBeInTheDocument();

      fireEvent.change(screen.getAllByLabelText("분")[0], { target: { value: "0" } });
      expect(quickBar().getAllByRole("button").map((b) => b.textContent)).toEqual(["+1시간", "+5시간", "+10시간"]);
    });

    it("차감 모드에서는 바 제출 버튼도 '시간 차감 (…)'이다", () => {
      render(<Harness timerId={timerId} status="RUNNING" initialAction="SUBTRACT" />);
      expect(quickBar().getAllByRole("button").map((b) => b.textContent)).toEqual(["-1시간", "-5시간", "-10시간"]);
      fireEvent.change(screen.getAllByLabelText("분")[0], { target: { value: "10" } });
      expect(quickBar().getByRole("button")).toHaveAccessibleName("시간 차감 (10분)");
    });

    it("바 제출 버튼은 폼 제출이라 입력값을 입력란의 닉네임으로 한 번 보내고, 입력이 비면 프리셋으로 돌아간다", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: timerId, remainingSeconds: 4200, status: "RUNNING", log: { id: "l1", actionType: "ADD", actorName: "시청자A", deltaSeconds: 600 } } }),
      });
      render(<Harness timerId={timerId} status="RUNNING" remainingSeconds={3600} />);
      fireEvent.change(screen.getByLabelText("시청자 닉네임"), { target: { value: "시청자A" } });
      fireEvent.change(screen.getAllByLabelText("분")[0], { target: { value: "10" } });

      fireEvent.click(quickBar().getByRole("button", { name: "시간 추가 (10분)" }));

      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
      expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ action: "ADD", deltaSeconds: 600, actorName: "시청자A" });
      expect(quickBar().getAllByRole("button").map((b) => b.textContent)).toEqual(["+1시간", "+5시간", "+10시간"]);
    });

    it("바 제출 직후 같은 자리에 나타난 프리셋은 잠깐 잠겨 두 번 탭이 +5시간으로 새지 않는다", async () => {
      vi.useFakeTimers();
      try {
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({ data: { id: timerId, remainingSeconds: 4200, status: "RUNNING", log: { id: "l1", actionType: "ADD", actorName: "시청자A", deltaSeconds: 600 } } }),
        });
        render(<Harness timerId={timerId} status="RUNNING" remainingSeconds={3600} />);
        fireEvent.change(screen.getByLabelText("시청자 닉네임"), { target: { value: "시청자A" } });
        fireEvent.change(screen.getAllByLabelText("분")[0], { target: { value: "10" } });

        fireEvent.click(quickBar().getByRole("button", { name: "시간 추가 (10분)" }));
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const five = quickBar().getByRole("button", { name: "+5시간" });
        expect(five).toBeDisabled();
        fireEvent.click(five);
        expect(mockFetch).toHaveBeenCalledTimes(1);

        await act(async () => { vi.advanceTimersByTime(800); });
        expect(quickBar().getByRole("button", { name: "+5시간" })).toBeEnabled();
        fireEvent.click(quickBar().getByRole("button", { name: "+5시간" }));
        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(JSON.parse(mockFetch.mock.calls[1][1].body).deltaSeconds).toBe(18000);
      } finally {
        vi.useRealTimers();
      }
    });

    it("값이 있을 때 입력란 닉네임이 비면 기본 닉네임이 있어도 바 제출은 입력란으로 안내한다(폼 제출은 입력란 닉네임이 필요)", () => {
      localStorageMock.setItem("defaultActorName", "기본냥");
      render(<Harness timerId={timerId} status="RUNNING" />);
      fireEvent.change(screen.getByLabelText("시청자 닉네임"), { target: { value: "" } });
      // 값이 0이면 프리셋은 기본 닉네임으로 즉시 적용된다
      expect(screen.getByText("즉시 적용 → 기본냥")).toBeInTheDocument();

      fireEvent.change(screen.getAllByLabelText("분")[0], { target: { value: "10" } });
      const submit = quickBar().getByRole("button", { name: "시간 추가 (10분)" });
      expect(submit).toBeEnabled();
      fireEvent.click(submit);
      expect(document.activeElement).toBe(screen.getByLabelText("시청자 닉네임"));
      expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: "center" });
      expect(screen.getByRole("alert")).toHaveTextContent(NICKNAME_PROMPT_MESSAGE);
      expect(mockFetch).not.toHaveBeenCalled();
      // 입력값은 그대로 남는다
      expect(screen.getAllByLabelText("분")[0]).toHaveValue(10);
    });

    // R14: 글자 입력 칸에 포커스가 있는 동안만 바를 숨긴다. 버튼·토글·바 버튼 포커스로는 숨지 않는다
    it("닉네임·시간 칸에 포커스가 있는 동안만 바를 숨긴다", () => {
      render(<Harness timerId={timerId} status="RUNNING" />);
      const bar = document.querySelector("[data-quick-bar]") as HTMLElement;
      expect(bar).not.toHaveClass("hidden");

      const nickname = screen.getByLabelText("시청자 닉네임");
      act(() => nickname.focus());
      expect(bar).toHaveClass("hidden");
      // 닉네임 → 분 칸으로 옮겨도 숨긴 채
      act(() => (screen.getAllByLabelText("분")[0] as HTMLElement).focus());
      expect(bar).toHaveClass("hidden");

      // 추가/차감 토글(role=radio)로 옮기면 다시 보인다
      act(() => screen.getByRole("radio", { name: "추가" }).focus());
      expect(bar).not.toHaveClass("hidden");
      // 바 버튼·카드 프리셋 포커스로도 숨지 않는다
      act(() => quickBar().getByRole("button", { name: "+1시간" }).focus());
      expect(bar).not.toHaveClass("hidden");
      act(() => cardButton("+5시간").focus());
      expect(bar).not.toHaveClass("hidden");

      // 폼 밖으로 나가면 보인다
      act(() => nickname.focus());
      expect(bar).toHaveClass("hidden");
      act(() => nickname.blur());
      expect(bar).not.toHaveClass("hidden");
    });
  });

  // C013: 되돌리기는 반대 방향 modify가 아니라 그 기록의 취소 처리(revert) 요청이다
  describe("undo toast", () => {
    it("되돌리기를 누르면 그 기록의 revert를 호출하고 결과를 onModified로 반영한다", async () => {
      const onModified = vi.fn();
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { id: timerId, remainingSeconds: 7200, status: "RUNNING", log: { id: "log-add", actionType: "SUBTRACT", actorName: "테스터", deltaSeconds: 600 } },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { id: timerId, remainingSeconds: 7800, status: "RUNNING", log: { id: "log-add", revertedAt: "2026-01-01T00:00:00Z" } },
          }),
        });
      render(<Harness timerId={timerId} status="RUNNING" remainingSeconds={7800} onModified={onModified} initialAction="SUBTRACT" />);
      fireEvent.change(screen.getByLabelText("시청자 닉네임"), { target: { value: "테스터" } });
      fireEvent.change(screen.getByLabelText("분"), { target: { value: "10" } });
      fireEvent.click(cardButton(/시간 차감/));

      await waitFor(() => expect(mockToast).toHaveBeenCalledWith("-10분 · 테스터", "success", expect.anything()));
      const { action } = mockToast.mock.calls[0][2];
      await act(async () => {
        await action.onClick();
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[1][0]).toBe(`/api/timers/${timerId}/logs/log-add/revert`);
      expect(mockFetch.mock.calls[1][1]).toMatchObject({ method: "POST" });
      // modify를 한 번 더 보내지 않는다(보정 행을 만들지 않음)
      expect(mockFetch.mock.calls.filter(([url]) => String(url).endsWith("/modify"))).toHaveLength(1);
      expect(onModified).toHaveBeenLastCalledWith(expect.objectContaining({ remainingSeconds: 7800 }));
      expect(mockToast).toHaveBeenLastCalledWith("되돌렸습니다 (-10분 · 테스터)", "success");
    });

    it("되돌리기 실패는 서버 문구로 오류 토스트를 띄우고 화면 값을 바꾸지 않는다", async () => {
      const onModified = vi.fn();
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { id: timerId, remainingSeconds: 4200, status: "RUNNING", log: { id: "l9", actionType: "ADD", actorName: "테스터", deltaSeconds: 600 } } }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 409,
          json: async () => ({ error: { code: "CONFLICT", message: "이미 되돌린 기록입니다" } }),
        });
      render(<Harness timerId={timerId} status="RUNNING" remainingSeconds={3600} onModified={onModified} />);
      fireEvent.change(screen.getByLabelText("시청자 닉네임"), { target: { value: "테스터" } });
      fireEvent.change(screen.getByLabelText("분"), { target: { value: "10" } });
      fireEvent.click(cardButton(/시간 추가/));
      await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
      const calls = onModified.mock.calls.length;

      await act(async () => {
        await mockToast.mock.calls[0][2].action.onClick();
      });
      expect(onModified).toHaveBeenCalledTimes(calls);
      expect(mockToast).toHaveBeenLastCalledWith("이미 되돌린 기록입니다", "error");
    });
  });
});
