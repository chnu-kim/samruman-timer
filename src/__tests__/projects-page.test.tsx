// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ProjectsPage from "@/app/projects/page";
import { SITE_DESCRIPTION } from "@/lib/site";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
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
  push.mockReset();
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

describe("프로젝트 목록 tabpanel (UX-44)", () => {
  it("탭의 aria-controls가 실제 tabpanel을 가리킨다", async () => {
    render(<ProjectsPage />);
    const mine = await screen.findByRole("tab", { name: /내 프로젝트/ });
    const panel = screen.getByRole("tabpanel");
    expect(mine).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", mine.id);
  });
});

describe("탭 개수 로딩 (C148)", () => {
  it("개수 응답 전에는 '(0)'을 보이지 않고, 응답 뒤에 '(n)'을 보인다", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/auth/me")) {
        return jsonResponse({ id: "u1", chzzkUserId: "c1", nickname: "삼루먼", profileImageUrl: null });
      }
      await gate;
      return jsonResponse({ projects: [], pagination: { page: 1, limit: 12, total: 5, totalPages: 1 } });
    }) as typeof fetch;

    render(<ProjectsPage />);
    const mine = await screen.findByRole("tab", { name: /내 프로젝트/ });
    const others = screen.getByRole("tab", { name: /다른 프로젝트/ });
    expect(mine).toHaveTextContent(/^내 프로젝트$/);
    expect(others).toHaveTextContent(/^다른 프로젝트$/);

    release();
    await screen.findByRole("tab", { name: "내 프로젝트 (5)" });
    expect(screen.getByRole("tab", { name: "다른 프로젝트 (5)" })).toBeInTheDocument();
  });
});

describe("카드 소유자 표시 (C099)", () => {
  const card = {
    id: "p1", name: "주말 방송", description: null, ownerNickname: "삼루먼", timerCount: 0,
    timerStatus: null, remainingSeconds: null, scheduledStartAt: null, createdAt: "2026-03-01T12:00:00Z",
  };
  beforeEach(() => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/auth/me")) {
        return jsonResponse({ id: "u1", chzzkUserId: "c1", nickname: "삼루먼", profileImageUrl: null });
      }
      return jsonResponse({ projects: [card], pagination: { page: 1, limit: 12, total: 1, totalPages: 1 } });
    }) as typeof fetch;
  });

  it("내 프로젝트 탭에서는 소유자 이름을 숨기고, 다른 프로젝트 탭에서는 보인다", async () => {
    render(<ProjectsPage />);
    await screen.findByRole("link", { name: "주말 방송" });
    expect(screen.queryByText("삼루먼")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /다른 프로젝트/ }));
    expect(await screen.findByText("삼루먼")).toBeInTheDocument();
  });
});

describe("신규 유저의 검색·정렬 (UX-46)", () => {
  function stubProjects(mineTotal: number, loggedIn = true) {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/auth/me")) {
        return loggedIn
          ? jsonResponse({ id: "u1", chzzkUserId: "c1", nickname: "삼루먼", profileImageUrl: null })
          : new Response(null, { status: 401 });
      }
      const total = url.startsWith("/api/projects/mine") ? mineTotal : 0;
      return jsonResponse({ projects: [], pagination: { page: 1, limit: 12, total, totalPages: 1 } });
    }) as typeof fetch;
  }

  it("내 프로젝트가 0개면 검색창과 정렬을 숨긴다", async () => {
    stubProjects(0);
    render(<ProjectsPage />);
    await screen.findByRole("tab", { name: /내 프로젝트 \(0\)/ });
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "프로젝트 검색" })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("combobox", { name: "정렬 기준" })).not.toBeInTheDocument();
  });

  it("다른 프로젝트 탭에서는 검색창을 보여 준다", async () => {
    stubProjects(0);
    render(<ProjectsPage />);
    fireEvent.click(await screen.findByRole("tab", { name: /다른 프로젝트/ }));
    expect(screen.getByRole("textbox", { name: "프로젝트 검색" })).toBeInTheDocument();
  });

  it("내 프로젝트가 있으면 검색창을 보여 준다", async () => {
    stubProjects(3);
    render(<ProjectsPage />);
    await screen.findByRole("tab", { name: /내 프로젝트 \(3\)/ });
    expect(screen.getByRole("textbox", { name: "프로젝트 검색" })).toBeInTheDocument();
  });

  it("로그인하지 않았으면 검색창을 보여 준다", async () => {
    stubProjects(0, false);
    render(<ProjectsPage />);
    expect(await screen.findByRole("textbox", { name: "프로젝트 검색" })).toBeInTheDocument();
  });
});

describe("새 프로젝트 폼 (UX-47)", () => {
  it("폼을 열면 이름 입력칸에 포커스가 간다", async () => {
    render(<ProjectsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /첫 프로젝트 만들기/ }));
    expect(screen.getByLabelText("프로젝트 이름")).toHaveFocus();
  });

  // C109: 프로젝트와 타이머는 1:1이라 만든 직후 상세 화면에서 타이머 만들기 창을 바로 열게 플래그를 붙여 보낸다
  it("프로젝트를 만들면 타이머 만들기 플래그를 붙여 상세 화면으로 보낸다", async () => {
    const listFetch = global.fetch;
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/projects" && init?.method === "POST") {
        return new Response(JSON.stringify({ data: { id: "new1" } }), { status: 201 });
      }
      return listFetch(input, init);
    }) as typeof fetch;
    render(<ProjectsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /첫 프로젝트 만들기/ }));
    fireEvent.change(screen.getByLabelText("프로젝트 이름"), { target: { value: "주말 서브어톤" } });
    fireEvent.click(screen.getByRole("button", { name: "프로젝트 만들기" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/projects/new1?new=timer"));
  });
});

// C103: 빈 목록에서는 같은 동작의 강조 버튼 두 개가 경쟁하지 않게 본문 CTA 하나만 남긴다
describe("빈 목록의 만들기 버튼 (C103)", () => {
  function stubMine(total: number) {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/auth/me")) {
        return jsonResponse({ id: "u1", chzzkUserId: "c1", nickname: "삼루먼", profileImageUrl: null });
      }
      const n = url.startsWith("/api/projects/mine") ? total : 2;
      return jsonResponse({ projects: [], pagination: { page: 1, limit: 12, total: n, totalPages: 1 } });
    }) as typeof fetch;
  }

  it("내 프로젝트가 0개면 헤더 '새 프로젝트'를 숨기고 본문 버튼 하나만 보인다", async () => {
    stubMine(0);
    render(<ProjectsPage />);
    await screen.findByRole("button", { name: /첫 프로젝트 만들기/ });
    await waitFor(() => expect(screen.queryByRole("button", { name: /새 프로젝트/ })).not.toBeInTheDocument());
  });

  it("빈 목록에서 폼을 열면 헤더에 '취소'가 나와 닫을 수 있다", async () => {
    stubMine(0);
    render(<ProjectsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /첫 프로젝트 만들기/ }));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByLabelText("프로젝트 이름")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /첫 프로젝트 만들기/ })).toBeInTheDocument();
  });

  it("다른 프로젝트 탭에서는 본문 버튼이 없으므로 헤더 버튼을 보인다", async () => {
    stubMine(0);
    render(<ProjectsPage />);
    await screen.findByRole("tab", { name: /내 프로젝트 \(0\)/ });
    fireEvent.click(screen.getByRole("tab", { name: /다른 프로젝트/ }));
    expect(await screen.findByRole("button", { name: /새 프로젝트/ })).toBeInTheDocument();
  });

  it("개수는 0개지만 목록 요청이 실패하면 본문 버튼이 없으므로 헤더 버튼을 보인다", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/auth/me")) {
        return jsonResponse({ id: "u1", chzzkUserId: "c1", nickname: "삼루먼", profileImageUrl: null });
      }
      if (url.endsWith("?limit=1")) {
        return jsonResponse({ projects: [], pagination: { page: 1, limit: 1, total: 0, totalPages: 0 } });
      }
      return new Response(null, { status: 500 });
    }) as typeof fetch;
    render(<ProjectsPage />);
    await screen.findByText("프로젝트를 불러오는데 실패했습니다.");
    await screen.findByRole("tab", { name: /내 프로젝트 \(0\)/ });
    expect(screen.getByRole("button", { name: /새 프로젝트/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /첫 프로젝트 만들기/ })).not.toBeInTheDocument();
  });

  it("내 프로젝트가 있으면 헤더 버튼을 보인다", async () => {
    stubMine(3);
    render(<ProjectsPage />);
    await screen.findByRole("tab", { name: /내 프로젝트 \(3\)/ });
    expect(screen.getByRole("button", { name: /새 프로젝트/ })).toBeInTheDocument();
  });
});

// C020: 로그아웃 첫 방문자에게 이 서비스가 무엇인지 한 줄로 알린다(CTA·이미지 없이)
describe("로그아웃 목록 소개 한 줄 (C020)", () => {
  it("로그아웃 상태에서는 제목 아래 사이트 설명을 보여 주고 플랫폼 이름은 넣지 않는다", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).startsWith("/api/auth/me")) return new Response("{}", { status: 401 });
      return jsonResponse({ projects: [], pagination: { page: 1, limit: 12, total: 0, totalPages: 1 } });
    }) as typeof fetch;
    render(<ProjectsPage />);
    const description = await screen.findByText(SITE_DESCRIPTION);
    expect(description.tagName).toBe("P");
    expect(description.textContent).not.toMatch(/CHZZK|치지직/);
  });

  it("로그인 상태에서는 설명을 보여 주지 않는다", async () => {
    render(<ProjectsPage />);
    await screen.findByRole("tab", { name: /내 프로젝트/ });
    expect(screen.queryByText(SITE_DESCRIPTION)).not.toBeInTheDocument();
  });
});
