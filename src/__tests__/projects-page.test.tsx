// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import ProjectsPage from "@/app/projects/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/auth/me")) {
      return jsonResponse({ id: "u1", chzzkUserId: "c1", nickname: "삼루먼", profileImageUrl: null });
    }
    return jsonResponse({ projects: [], pagination: { page: 1, limit: 12, total: 0, totalPages: 1 } });
  }) as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("프로젝트 목록 탭", () => {
  // UX-39: 화살표 키로 탭을 바꾸면 포커스도 함께 옮겨야 한다
  it("화살표 키로 탭을 바꾸면 선택과 포커스가 함께 이동한다", async () => {
    render(<ProjectsPage />);
    const mine = await screen.findByRole("tab", { name: /내 프로젝트/ });
    const others = screen.getByRole("tab", { name: /다른 프로젝트/ });

    mine.focus();
    fireEvent.keyDown(mine, { key: "ArrowRight" });
    expect(others).toHaveAttribute("aria-selected", "true");
    expect(others).toHaveAttribute("tabindex", "0");
    expect(document.activeElement).toBe(others);

    fireEvent.keyDown(others, { key: "ArrowLeft" });
    expect(mine).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(mine);
  });
});
