// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import ProjectDetailPage from "@/app/projects/[id]/page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "p1" }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
}

const project = {
  id: "p1",
  name: "테스트 프로젝트",
  description: null,
  owner: { id: "u1", nickname: "스트리머", profileImageUrl: null },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const timer = {
  id: "t1",
  projectId: "p1",
  title: "서브어톤",
  description: null,
  remainingSeconds: 0,
  status: "EXPIRED",
  scheduledStartAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const goal = {
  id: "g1",
  projectId: "p1",
  title: "100시간 달성",
  status: "CANCELLED",
};

function stubApi({ timers, goals }: { timers: unknown[]; goals: unknown[] }) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/auth/me")) return new Response(null, { status: 401 });
    if (url === "/api/projects/p1/timers") return jsonResponse(timers);
    if (url === "/api/projects/p1/goals") return jsonResponse(goals);
    return jsonResponse(project);
  }) as typeof fetch;
}

afterEach(() => {
  vi.restoreAllMocks();
});

// UX-50: 타이머가 없으면 누를 수 없는 목표 버튼과 빈 탭을 보여 주지 않는다
describe("프로젝트 상세 목표 섹션 (UX-50)", () => {
  it("타이머와 목표가 모두 없으면 목표 섹션을 렌더하지 않는다", async () => {
    stubApi({ timers: [], goals: [] });
    render(<ProjectDetailPage />);
    await screen.findByText("아직 타이머가 없습니다.");
    expect(screen.queryByRole("heading", { name: "목표" })).not.toBeInTheDocument();
  });

  it("타이머가 있으면 목표 섹션을 보여 준다", async () => {
    stubApi({ timers: [timer], goals: [] });
    render(<ProjectDetailPage />);
    expect(await screen.findByRole("heading", { name: "목표" })).toBeInTheDocument();
  });

  it("타이머를 삭제했어도 남은 목표 기록이 있으면 목표 섹션을 보여 준다", async () => {
    stubApi({ timers: [], goals: [goal] });
    render(<ProjectDetailPage />);
    await screen.findByText("아직 타이머가 없습니다.");
    await waitFor(() => expect(screen.getByRole("heading", { name: "목표" })).toBeInTheDocument());
  });
});
