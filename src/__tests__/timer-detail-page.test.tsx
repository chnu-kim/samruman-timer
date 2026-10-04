// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import TimerRedirectPage from "@/app/timers/[id]/page";
import TimerNotFound from "@/app/timers/[id]/not-found";
import { metadata } from "@/app/timers/[id]/layout";

const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
);
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);
vi.mock("next/navigation", () => ({ redirect, notFound }));

const first = vi.hoisted(() => vi.fn());
const prepare = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({
  getDB: async () => ({ prepare }),
}));

beforeEach(() => {
  first.mockReset();
  redirect.mockClear();
  notFound.mockClear();
  prepare.mockReset();
  prepare.mockReturnValue({ bind: () => ({ first }) });
});

// 타이머 조작을 프로젝트 화면으로 합쳤으므로 예전 타이머 주소는 서버에서 상위 프로젝트로 보낸다
describe("/timers/[id]", () => {
  it("상위 프로젝트 화면으로 서버에서 이동한다", async () => {
    first.mockResolvedValue({ project_id: "p1" });
    await expect(TimerRedirectPage({ params: Promise.resolve({ id: "t1" }) })).rejects.toThrow("NEXT_REDIRECT:/projects/p1");
    expect(redirect).toHaveBeenCalledWith("/projects/p1");
  });

  it("삭제된 타이머는 조회에서 제외한다", async () => {
    first.mockResolvedValue(null);
    await expect(TimerRedirectPage({ params: Promise.resolve({ id: "t1" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(prepare.mock.calls[0][0]).toContain("status != 'DELETED'");
  });

  // W30: 200으로 안내만 그리면 soft 404다. notFound()로 404·noindex를 내고 같은 폴더의 not-found가 안내한다
  it("없는 타이머면 이동하지 않고 notFound()로 404 화면을 그린다", async () => {
    first.mockResolvedValue(null);
    await expect(TimerRedirectPage({ params: Promise.resolve({ id: "t1" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(redirect).not.toHaveBeenCalled();
    expect(notFound).toHaveBeenCalledTimes(1);
    render(<TimerNotFound />);
    expect(screen.getByText(/타이머를 찾을 수 없습니다/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /프로젝트 목록으로/ })).toHaveAttribute("href", "/projects");
    expect(metadata.title).toMatchObject({ default: "찾을 수 없음" });
  });
});
