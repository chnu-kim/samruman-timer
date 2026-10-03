// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import TimerRedirectPage from "@/app/timers/[id]/page";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "t1" }),
  useRouter: () => ({ replace, push: vi.fn() }),
}));

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.restoreAllMocks();
  replace.mockReset();
});

// 타이머 조작을 프로젝트 화면으로 합쳤으므로 예전 타이머 주소는 상위 프로젝트로 보낸다
describe("/timers/[id]", () => {
  it("상위 프로젝트 화면으로 이동한다", async () => {
    global.fetch = vi.fn(async () => jsonResponse({ id: "t1", projectId: "p1" })) as typeof fetch;
    render(<TimerRedirectPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/projects/p1"));
  });

  it("없는 타이머면 이동하지 않고 안내한다", async () => {
    global.fetch = vi.fn(async () => new Response(null, { status: 404 })) as typeof fetch;
    render(<TimerRedirectPage />);
    expect(await screen.findByText(/타이머를 찾을 수 없습니다/)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("일시적 오류면 다시 시도할 수 있다", async () => {
    global.fetch = vi.fn(async () => new Response(null, { status: 500 })) as typeof fetch;
    render(<TimerRedirectPage />);
    expect(await screen.findByText("타이머 정보를 불러오지 못했습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /다시 시도/ })).toBeInTheDocument();
  });
});
