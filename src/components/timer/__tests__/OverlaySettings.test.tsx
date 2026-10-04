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

describe("OverlaySettings 저장을 포함한 URL 복사 (UX-11·C069)", () => {
  type Call = { url: string; init?: RequestInit };
  let calls: Call[];
  let putOk: boolean;

  beforeEach(() => {
    mockToast.mockReset();
    writeText.mockReset();
    calls = [];
    putOk = true;
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      if (init?.method === "PUT" && !putOk) {
        return { ok: false, status: 500, json: async () => ({ error: { code: "INTERNAL", message: "서버 오류" } }) };
      }
      return { ok: true, status: 200, json: async () => ({ data: null }) };
    }));
  });

  const writes = () => calls.filter((c) => c.init?.method === "PUT" || c.init?.method === "PATCH");

  it("상단에는 복사 버튼이 없고 하단 주 버튼 하나가 복사한다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    expect(await screen.findByRole("button", { name: "URL 복사" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "복사" })).not.toBeInTheDocument();
  });

  it("변경이 없으면 저장 요청 없이 복사만 하고, 쓰기가 끝난 뒤 성공을 알린다", async () => {
    writeText.mockResolvedValueOnce(undefined);
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: "URL 복사" }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith("URL을 복사했습니다. OBS에 붙여넣으세요", "success");
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/timers\/abc\/overlay$/));
    expect(writes()).toHaveLength(0);
  });

  it("설정을 바꾸고 한 번 누르면 저장하고 새 URL을 복사한다", async () => {
    writeText.mockResolvedValueOnce(undefined);
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "게이밍 네온" }));

    fireEvent.click(screen.getByRole("button", { name: "URL 복사" }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith("URL을 복사했습니다. OBS에 붙여넣으세요", "success");
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("fontSize=96&color=%2300ff88"));
    const put = calls.find((c) => c.init?.method === "PUT");
    expect(JSON.parse(String(put!.init!.body))).toMatchObject({ fontSize: 96, color: "#00ff88" });
    // 저장됐으므로 더 이상 변경 상태가 아니다
    expect(screen.getByRole("button", { name: "변경 취소" })).toHaveAttribute("tabindex", "-1");
  });

  it("복사가 실패하면 저장 성공과 나눠 알린다", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "게이밍 네온" }));

    fireEvent.click(screen.getByRole("button", { name: "URL 복사" }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.stringContaining("저장했지만 복사하지 못했습니다"), "error");
    });
    expect(mockToast).not.toHaveBeenCalledWith(expect.anything(), "success");
  });

  it("변경 없이 복사만 실패하면 오류만 알린다", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: "URL 복사" }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.stringContaining("URL을 복사하지 못했습니다"), "error");
    });
    expect(mockToast).not.toHaveBeenCalledWith(expect.anything(), "success");
  });

  it("저장이 실패하면 복사는 됐어도 성공으로 알리지 않고 변경 상태를 남긴다", async () => {
    putOk = false;
    writeText.mockResolvedValueOnce(undefined);
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "게이밍 네온" }));

    fireEvent.click(screen.getByRole("button", { name: "URL 복사" }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith("URL은 복사했지만 저장하지 못했습니다", "error");
    });
    expect(mockToast).not.toHaveBeenCalledWith(expect.anything(), "success");
    expect(screen.getByRole("button", { name: "변경 취소" })).toHaveAttribute("tabindex", "0");
  });
});

describe("OverlaySettings OBS 연결 안내 (UX-20·C108)", () => {
  beforeEach(() => {
    mockToast.mockReset();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: null }) })));
  });

  it("URL 아래에 붙여넣을 곳과 권장 크기를 한 줄로 보여 준다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);

    expect(
      await screen.findByText("OBS 브라우저 소스에 붙여넣기 · 너비 1920 높이 1080"),
    ).toBeInTheDocument();
    // 다시 붙여넣으라는 안내는 복사 토스트로 옮겼다
    expect(screen.queryByText(/새로 붙여넣어야/)).not.toBeInTheDocument();
  });

  it("변경이 있으면 복사할 때 저장된다고 알린다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "게이밍 네온" }));
    expect(screen.getByText("복사하면 변경 사항도 저장됩니다")).toHaveClass("opacity-100");
  });
});

describe("OverlaySettings 접근성 (UX-25)", () => {
  it("hex 입력에 접근 가능한 이름이 있다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);

    expect(await screen.findByRole("textbox", { name: "텍스트 색상 코드" })).toHaveValue("#ffffff");
    expect(screen.getByRole("textbox", { name: "배경색 코드" })).toHaveValue("투명");
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

  // C158: 화면에는 CSS 키워드 대신 '투명'을 보이고, '투명'을 입력해도 transparent로 저장된다
  it("배경색 칸은 투명을 '투명'으로 보이고 '투명' 입력을 받는다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    const input = await screen.findByRole("textbox", { name: "배경색 코드" });
    expect(input).toHaveValue("투명");
    expect(input).toHaveAttribute("placeholder", "투명");

    fireEvent.change(input, { target: { value: "#000000" } });
    expect(overlayCode()).toContain("bg=%23000000");

    fireEvent.change(input, { target: { value: "투명" } });
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(input).toHaveValue("투명");
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

describe("OverlaySettings 미리보기 (UX-57·C063)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: null }) })));
  });

  it("투명 배경은 테마와 무관한 고정 어두운 색으로 미리 본다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    const iframe = await screen.findByTitle("오버레이 미리보기", {}, { timeout: 2000 });
    expect(iframe.style.background).toMatch(/#3f3f46|rgb\(63, 63, 70\)/);
  });

  it("1920×1080 방송 캔버스로 그려 16:9 상자 폭에 맞춰 축소한다", async () => {
    const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(640);
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    const iframe = await screen.findByTitle("오버레이 미리보기", {}, { timeout: 2000 });
    expect(iframe.style.width).toBe("1920px");
    expect(iframe.style.height).toBe("1080px");
    expect(iframe.style.transform).toBe("scale(" + 640 / 1920 + ")");
    expect(screen.getByTestId("overlay-preview")).toHaveClass("aspect-video", "overflow-hidden");
    width.mockRestore();
  });

  it("미리보기는 URL 바로 아래, 설정보다 먼저 온다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    const preview = await screen.findByTestId("overlay-preview");
    const preset = screen.getByRole("button", { name: "기본 흰색" });
    expect(preview.compareDocumentPosition(preset) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

// 프로젝트 화면에 통합하면서 타이머 제목은 오버레이의 '제목 표시'에서만 쓰이므로 여기서 고친다
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

  it("제목 표시가 켜져 있으면 제목을 고칠 수 있고, 저장하면 제목과 설정을 함께 저장한다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    const input = await screen.findByLabelText("표시할 제목");
    expect(input).toHaveValue("본방 타이머");

    fireEvent.change(input, { target: { value: "  주말 서브어톤  " } });
    expect(screen.getByText("저장하지 않은 변경 사항이 있습니다")).toHaveClass("opacity-100");
    fireEvent.click(screen.getByRole("button", { name: "게이밍 네온" }));
    expect(screen.getByText("복사하면 변경 사항도 저장됩니다")).toHaveClass("opacity-100");
    fireEvent.click(screen.getByRole("button", { name: "URL 복사" }));

    await waitFor(() => expect(calls.some((c) => c.init?.method === "PUT")).toBe(true));
    const patch = calls.find((c) => c.url === "/api/timers/abc" && c.init?.method === "PATCH");
    expect(JSON.parse(String(patch!.init!.body))).toEqual({ title: "주말 서브어톤" });
  });

  it("제목만 바꾸면 주 버튼이 '제목 저장'이 되고, 설정 저장·복사 없이 다시 붙여넣지 않아도 된다고 알린다", async () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    fireEvent.change(await screen.findByLabelText("표시할 제목"), { target: { value: "새 제목" } });
    expect(screen.queryByRole("button", { name: "URL 복사" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "제목 저장" }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith("제목을 저장했습니다. 다시 붙여넣지 않아도 됩니다", "success"),
    );
    expect(calls.some((c) => c.init?.method === "PUT")).toBe(false);
    expect(calls.some((c) => c.init?.method === "PATCH")).toBe(true);
    expect(writeText).not.toHaveBeenCalled();
    // 저장 뒤에는 다시 URL 복사 버튼으로 돌아간다
    expect(await screen.findByRole("button", { name: "URL 복사" })).toBeInTheDocument();
  });

  it("제목을 비우면 저장하지 않고 알린다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    fireEvent.change(await screen.findByLabelText("표시할 제목"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "제목 저장" }));

    expect(mockToast).toHaveBeenCalledWith("표시할 제목을 입력해 주세요", "error");
    expect(calls.some((c) => c.init?.method === "PATCH" || c.init?.method === "PUT")).toBe(false);
  });

  it("제목이 비어 있어도 URL 복사와 설정 저장은 막지 않고, 제목만 저장하지 않았다고 알린다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    fireEvent.change(await screen.findByLabelText("표시할 제목"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "게이밍 네온" }));
    fireEvent.click(screen.getByRole("button", { name: "URL 복사" }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith("제목이 비어 있어 제목은 저장하지 않았습니다", "error"));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(calls.some((c) => c.init?.method === "PUT")).toBe(true);
    expect(calls.some((c) => c.init?.method === "PATCH")).toBe(false);
  });

  it("제목 저장이 실패해도 설정은 저장한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const base = vi.mocked(fetch).getMockImplementation()!;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        calls.push({ url: String(input), init });
        return { ok: false, status: 400, json: async () => ({ error: { code: "BAD_REQUEST", message: "제목 오류" } }) };
      }
      return base(input, init);
    }));
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    fireEvent.change(await screen.findByLabelText("표시할 제목"), { target: { value: "새 제목" } });
    fireEvent.click(screen.getByRole("button", { name: "게이밍 네온" }));
    fireEvent.click(screen.getByRole("button", { name: "URL 복사" }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith("URL은 복사했지만 저장하지 못했습니다", "error"));
    expect(calls.some((c) => c.init?.method === "PUT")).toBe(true);
    // 설정은 저장됐고 제목만 남아 있으므로 주 버튼은 '제목 저장'이 된다
    expect(screen.getByRole("button", { name: "제목 저장" })).toBeInTheDocument();
  });

  it("제목 표시를 끄면 고친 제목을 되돌려 숨은 값을 저장하지 않는다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    fireEvent.change(await screen.findByLabelText("표시할 제목"), { target: { value: "숨을 제목" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "제목 표시" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "제목 표시" }));
    expect(screen.getByLabelText("표시할 제목")).toHaveValue("본방 타이머");
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("제목 표시를 끄면 제목 입력란을 숨긴다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    await screen.findByLabelText("표시할 제목");
    fireEvent.click(screen.getByRole("checkbox", { name: "제목 표시" }));
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

  // C055: md 미만에서는 가운데 카드가 아니라 화면 아래에 붙은 시트(좌우 꽉, 위 모서리만 둥글게, 90dvh)
  it("md 미만에서는 하단 시트 모양이다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);
    const dialog = await screen.findByRole("dialog", { name: "OBS 오버레이 설정" });
    for (const cls of ["max-md:mb-0", "max-md:max-w-none", "max-md:rounded-b-none", "max-h-[90dvh]"]) {
      expect(dialog.className.split(/\s+/)).toContain(cls);
    }
  });

  it("변경이 없으면 Esc(cancel)로 바로 닫고 기본 닫기는 막는다", async () => {
    const onClose = vi.fn();
    render(<OverlaySettings timerId="abc" onClose={onClose} />);
    await screen.findByRole("button", { name: "URL 복사" });

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
    fireEvent.click(await screen.findByText("OBS 브라우저 소스 URL").then((el) => el.closest("div")!));
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
    await screen.findByRole("button", { name: "URL 복사" });
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
    expect(screen.getByRole("textbox", { name: "배경색 코드" })).toHaveValue("투명");
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
    fireEvent.click(await screen.findByRole("button", { name: "게이밍 네온" }));
    expect(screen.getByText("복사하면 변경 사항도 저장됩니다")).toHaveClass("text-amber-700");
  });
});
