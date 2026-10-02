// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { OverlaySettings } from "../OverlaySettings";

const mockToast = vi.fn();
vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

// 저장된 설정이 없으면 기본값으로 렌더된다
vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: null }) })));

const writeText = vi.fn();

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

  it("저장 성공 토스트에도 같은 안내를 덧붙인다", async () => {
    render(<OverlaySettings timerId="abc" onClose={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: "게이밍 네온" }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.stringContaining("OBS 브라우저 소스에 새로 붙여넣어야 방송에 반영됩니다"),
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
