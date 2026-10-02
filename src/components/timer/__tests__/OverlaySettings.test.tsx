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
