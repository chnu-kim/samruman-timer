// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import TimerDetailPage from "@/app/timers/[id]/page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "t1" }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// jsdom에는 native <dialog>의 showModal/close가 없다
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
}

const timer = {
  id: "t1",
  projectId: "p1",
  projectName: "주말 서브어톤",
  title: "본방 타이머",
  description: null,
  remainingSeconds: 0,
  status: "EXPIRED",
  scheduledStartAt: null,
  createdBy: { id: "u1", nickname: "스트리머" },
  projectOwnerId: "u1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const logs = [
  {
    id: "l1",
    actionType: "EXPIRE",
    actorName: "system",
    actorUserId: null,
    deltaSeconds: 0,
    beforeSeconds: 0,
    afterSeconds: 0,
    createdAt: "2026-01-02T00:00:00.000Z",
  },
];

beforeEach(() => {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/auth/me")) {
      return jsonResponse({ id: "u1", chzzkUserId: "c1", nickname: "스트리머", profileImageUrl: null });
    }
    if (url.startsWith("/api/timers/t1/logs")) {
      return jsonResponse({ logs, pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } });
    }
    if (url.startsWith("/api/timers/t1/graph")) {
      return jsonResponse({ mode: "remaining", points: [] });
    }
    return jsonResponse(timer);
  }) as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("타이머 화면", () => {
  // UX-73: 만료 로그의 행위자를 'system' 대신 '자동'으로 보여 준다
  it("시스템이 남긴 만료 로그의 행위자를 '자동'으로 표시한다", async () => {
    render(<TimerDetailPage />);
    await waitFor(() => expect(screen.getAllByText("자동").length).toBeGreaterThan(0));
    expect(screen.queryByText("system")).not.toBeInTheDocument();
  });

  // UX-64: 단축키 도움말은 닫기 버튼이 있는 공용 FormDialog다
  it("'?'로 연 단축키 도움말을 닫기 버튼으로 닫을 수 있다", async () => {
    render(<TimerDetailPage />);
    await screen.findByRole("heading", { level: 1, name: /본방 타이머/ });
    // 소유자 확인(/api/auth/me)이 끝나야 단축키가 켜진다
    await screen.findByRole("heading", { name: "시간 조작" });

    fireEvent.keyDown(window, { key: "?" });
    const title = await screen.findByRole("heading", { name: "키보드 단축키" });
    const dialog = title.closest("dialog")!;
    expect(dialog).toHaveAttribute("open");
    expect(screen.getByText("단축키 도움말")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
  });
});
