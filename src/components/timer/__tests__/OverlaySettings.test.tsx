// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { useState } from "react";
import { OverlaySettings } from "../OverlaySettings";

const mockToast = vi.fn();
vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

// 저장된 설정이 없으면 기본값으로 렌더된다
vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: null }) })));

const writeText = vi.fn();

// jsdom에는 native <dialog>의 showModal/close가 없다
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});

describe("OverlaySettings URL 복사 (UX-11)", () => {
  beforeEach(() => {
    mockToast.mockReset();
    writeText.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });

  it("클립보드 쓰기가 끝난 뒤에 성공 토스트를 띄운다", async () => {
    writeText.mockResolvedValueOnce(undefined);
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: "복사" }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith("OBS 오버레이 URL이 복사되었습니다", "success");
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/timers/abc/overlay"));
  });

  it("클립보드 쓰기가 실패하면 성공 대신 오류 토스트를 띄운다", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: "복사" }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.stringContaining("복사하지 못했습니다"), "error");
    });
    expect(mockToast).not.toHaveBeenCalledWith(expect.anything(), "success");
  });
});

describe("OverlaySettings 반영 안내 (UX-20)", () => {
  beforeEach(() => {
    mockToast.mockReset();
  });

  it("URL 블록에 OBS에 새로 붙여넣어야 반영된다는 안내를 보여 준다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);

    expect(
      await screen.findByText("URL을 바꿨다면 OBS 브라우저 소스에 새로 붙여넣어야 방송에 반영됩니다."),
    ).toBeInTheDocument();
  });

  it("저장 성공 토스트에 OBS에 다시 붙여넣으라는 짧은 안내를 덧붙인다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: "게이밍 네온" }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        "저장되었습니다. OBS에 URL을 다시 붙여넣으세요",
        "success",
      );
    });
  });
});

describe("OverlaySettings 접근성 (UX-25)", () => {
  it("hex 입력에 접근 가능한 이름이 있다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);

    expect(await screen.findByRole("textbox", { name: "텍스트 색상 코드" })).toHaveValue("#ffffff");
    expect(screen.getByRole("textbox", { name: "배경색 코드" })).toHaveValue("transparent");
  });

  it("위치 버튼이 선택 상태를 aria-pressed로 알린다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);

    const center = await screen.findByRole("button", { name: "중앙" });
    const topLeft = screen.getByRole("button", { name: "좌상단" });
    expect(center).toHaveAttribute("aria-pressed", "true");
    expect(topLeft).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(topLeft);

    expect(center).toHaveAttribute("aria-pressed", "false");
    expect(topLeft).toHaveAttribute("aria-pressed", "true");
  });
});

describe("OverlaySettings 색 입력 검증 (UX-55)", () => {
  function overlayCode() {
    return screen.getByText(/\/timers\/abc\/overlay/).textContent ?? "";
  }

  it("입력 중인 불완전한 색은 URL에 넣지 않고 aria-invalid로 표시한다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    const input = await screen.findByRole("textbox", { name: "텍스트 색상 코드" });

    fireEvent.change(input, { target: { value: "#ff" } });
    expect(input).toHaveValue("#ff");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(overlayCode()).not.toContain("color=");

    fireEvent.change(input, { target: { value: "#ff0000" } });
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(overlayCode()).toContain("color=%23ff0000");
  });

  it("배경색은 transparent도 허용한다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    const input = await screen.findByRole("textbox", { name: "배경색 코드" });

    fireEvent.change(input, { target: { value: "#00000" } });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(overlayCode()).not.toContain("bg=");

    fireEvent.change(input, { target: { value: "#000000" } });
    expect(overlayCode()).toContain("bg=%23000000");

    fireEvent.change(input, { target: { value: "transparent" } });
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(overlayCode()).not.toContain("bg=");
  });

  it("프리셋을 고르면 미완성 입력이 프리셋 값으로 바뀐다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    const input = await screen.findByRole("textbox", { name: "텍스트 색상 코드" });

    fireEvent.change(input, { target: { value: "#zz" } });
    fireEvent.click(screen.getByRole("button", { name: "게이밍 네온" }));
    expect(input).toHaveValue("#00ff88");
    expect(input).toHaveAttribute("aria-invalid", "false");
  });
});

describe("OverlaySettings 미리보기 배경 (UX-57)", () => {
  it("투명 배경은 테마와 무관한 고정 어두운 색으로 미리 본다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    const iframe = await screen.findByTitle("오버레이 미리보기", {}, { timeout: 2000 });
    expect(iframe.style.background).toMatch(/#3f3f46|rgb\(63, 63, 70\)/);
  });
});

// 프로젝트 화면에 통합하면서 타이머 제목은 오버레이의 '타이틀 표시'에서만 쓰이므로 여기서 고친다
describe("OverlaySettings 표시할 제목", () => {
  type Call = { url: string; init?: RequestInit };
  let calls: Call[];

  beforeEach(() => {
    mockToast.mockReset();
    calls = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === "/api/timers/abc" && !init?.method) {
        return { ok: true, status: 200, json: async () => ({ data: { title: "본방 타이머" } }) };
      }
      if (url.endsWith("/overlay-settings") && !init?.method) {
        return { ok: true, status: 200, json: async () => ({ data: { fontSize: 72, color: "#ffffff", bg: "transparent", showTitle: true, shadow: true, position: "center", animation: true } }) };
      }
      return { ok: true, status: 200, json: async () => ({ data: {} }) };
    }));
  });

  it("타이틀 표시가 켜져 있으면 제목을 고칠 수 있고, 저장하면 제목과 설정을 함께 저장한다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    const input = await screen.findByLabelText("표시할 제목");
    expect(input).toHaveValue("본방 타이머");

    fireEvent.change(input, { target: { value: "  주말 서브어톤  " } });
    expect(screen.getByText("저장하지 않은 변경 사항이 있습니다")).toHaveClass("opacity-100");
    fireEvent.click(screen.getByRole("button", { name: "게이밍 네온" }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(calls.some((c) => c.init?.method === "PUT")).toBe(true));
    const patch = calls.find((c) => c.url === "/api/timers/abc" && c.init?.method === "PATCH");
    expect(JSON.parse(String(patch!.init!.body))).toEqual({ title: "주말 서브어톤" });
  });

  it("제목만 바꾸면 설정은 저장하지 않고 URL을 다시 붙여넣으라고 하지 않는다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    fireEvent.change(await screen.findByLabelText("표시할 제목"), { target: { value: "새 제목" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith("제목이 저장되었습니다", "success"));
    expect(calls.some((c) => c.init?.method === "PUT")).toBe(false);
    expect(mockToast).not.toHaveBeenCalledWith(expect.stringContaining("다시 붙여넣으세요"), "success");
  });

  it("제목을 비우면 저장하지 않고 알린다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    fireEvent.change(await screen.findByLabelText("표시할 제목"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(mockToast).toHaveBeenCalledWith("표시할 제목을 입력해주세요", "error");
    expect(calls.some((c) => c.init?.method === "PATCH" || c.init?.method === "PUT")).toBe(false);
  });

  it("타이틀 표시를 끄면 제목 입력란을 숨긴다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    await screen.findByLabelText("표시할 제목");
    fireEvent.click(screen.getByRole("checkbox", { name: "타이틀 표시" }));
    expect(screen.queryByLabelText("표시할 제목")).not.toBeInTheDocument();
  });
});

describe("OverlaySettings 네이티브 모달 (C002·C007)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: null }) })));
  });

  it("showModal로 연 <dialog>이고 제목으로 이름이 붙는다", async () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);

    const dialog = await screen.findByRole("dialog", { name: "OBS 오버레이 설정" });
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog).toHaveAttribute("open");
    expect(showModal).toHaveBeenCalledTimes(1);
    showModal.mockRestore();
  });

  it("변경이 없으면 Esc(cancel)로 바로 닫고 기본 닫기는 막는다", async () => {
    const onClose = vi.fn();
    render(<OverlaySettings timerId="abc" onClose={onClose} />);
    await screen.findByRole("button", { name: "복사" });

    const cancel = new Event("cancel", { cancelable: true });
    act(() => {
      screen.getByRole("dialog", { name: "OBS 오버레이 설정" }).dispatchEvent(cancel);
    });

    expect(cancel.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("저장 안 한 변경이 있으면 Esc는 확인창을 띄우고 닫지 않는다", async () => {
    const onClose = vi.fn();
    render(<OverlaySettings timerId="abc" onClose={onClose} />);
    fireEvent.click(await screen.findByRole("button", { name: "게이밍 네온" }));

    act(() => {
      screen.getByRole("dialog", { name: "OBS 오버레이 설정" }).dispatchEvent(new Event("cancel", { cancelable: true }));
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "저장하지 않고 닫기" })).toHaveAttribute("open");
  });

  it("배경(dialog 자신)을 누르면 닫고, 안쪽을 누르면 닫지 않는다", async () => {
    const onClose = vi.fn();
    render(<OverlaySettings timerId="abc" onClose={onClose} />);
    fireEvent.click(await screen.findByRole("button", { name: "복사" }).then((b) => b.closest("div")!));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("dialog", { name: "OBS 오버레이 설정" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("닫히면 연 버튼으로 포커스를 돌려준다", async () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>OBS 오버레이</button>
          {open && <OverlaySettings timerId="abc" onClose={() => setOpen(false)} />}
        </>
      );
    }
    render(<Host />);
    const opener = screen.getByRole("button", { name: "OBS 오버레이" });
    opener.focus();
    fireEvent.click(opener);
    await screen.findByRole("button", { name: "복사" });
    screen.getByRole("button", { name: "닫기" }).focus();

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));

    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});

describe("OverlaySettings 현재 상태 표시 (C036·C038·C026·C070)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: null }) })));
  });

  it("설정이 프리셋 값과 같으면 그 프리셋만 눌린 상태다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    const basic = await screen.findByRole("button", { name: "기본 흰색" });
    const neon = screen.getByRole("button", { name: "게이밍 네온" });
    expect(basic).toHaveAttribute("aria-pressed", "true");
    expect(neon).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(neon);
    expect(basic).toHaveAttribute("aria-pressed", "false");
    expect(neon).toHaveAttribute("aria-pressed", "true");

    // 프리셋 값에서 벗어나면 어느 것도 눌리지 않는다
    fireEvent.change(screen.getByRole("textbox", { name: "텍스트 색상 코드" }), { target: { value: "#123456" } });
    for (const name of ["기본 흰색", "게이밍 네온", "미니멀"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("배경이 투명이면 견본을 체커보드로 그리고 '투명으로 초기화'를 숨긴다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    const swatch = await screen.findByTestId("bg-swatch");
    expect(swatch.style.background).toContain("conic-gradient");
    expect(screen.queryByRole("button", { name: "투명으로 초기화" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "배경색 코드" }), { target: { value: "#000000" } });
    expect(swatch.style.background).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "투명으로 초기화" }));
    expect(screen.getByRole("textbox", { name: "배경색 코드" })).toHaveValue("transparent");
  });

  it("위치 칸은 윤곽으로 보이고 '현재: …' 문구는 없다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    const topLeft = await screen.findByRole("button", { name: "좌상단" });
    expect(topLeft).toHaveClass("border", "border-border-input");
    expect(screen.queryByText(/현재:/)).not.toBeInTheDocument();
  });

  // W06: 흰 글자색 견본이 흰 카드에 묻히지 않게 입력 칸은 입력 경계 토큰(3:1 이상)을 쓴다
  it("폰트 크기 입력과 색 견본은 입력 경계 토큰을 쓴다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    for (const name of ["폰트 크기 입력", "텍스트 색상", "배경색"]) {
      const el = await screen.findByLabelText(name);
      expect(el).toHaveClass("border-border-input");
      expect(el).not.toHaveClass("border-border");
    }
  });

  it("저장 안 한 변경 경고는 라이트에서 amber-700을 쓴다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    await screen.findByRole("button", { name: "복사" });
    expect(screen.getByText("저장하지 않은 변경 사항이 있습니다")).toHaveClass("text-amber-700");
  });
});
