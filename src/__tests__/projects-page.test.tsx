// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ProjectsPage from "@/app/projects/page";
import { fetchMe, resetMeCache } from "@/lib/session-me";
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
    // 공개 프로젝트(다른 사람의 프로젝트)가 있어야 탭 바가 생긴다(W29)
    const total = url.startsWith("/api/projects/others") ? 2 : 0;
    return jsonResponse({ projects: [], pagination: { page: 1, limit: 12, total, totalPages: 1 } });
  }) as typeof fetch;
});

afterEach(() => {
  // fetchMe는 확정 결과를 잠깐 같이 쓰므로 테스트마다 비워 이전 테스트의 로그인 상태가 남지 않게 한다
  resetMeCache();
  vi.restoreAllMocks();
  push.mockReset();
});

describe("프로젝트 목록 탭", () => {
  // UX-39: 화살표 키로 탭을 바꾸면 포커스도 함께 옮겨야 한다
  it("화살표 키로 탭을 바꾸면 선택과 포커스가 함께 이동한다", async () => {
    render(<ProjectsPage />);
    const mine = await screen.findByRole("tab", { name: /내 프로젝트/ });
    const others = screen.getByRole("tab", { name: /공개 프로젝트/ });

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

// 헤더와 같은 첫 로드에 로그인을 확인하므로 공용 fetchMe로 한 요청을 같이 쓴다
describe("로그인 확인 (fetchMe)", () => {
  it("헤더가 먼저 물은 로그인 확인을 같이 써서 /api/auth/me를 한 번만 부른다", async () => {
    // 헤더(레이아웃)가 같은 첫 로드에 먼저 묻는다
    void fetchMe();
    render(<ProjectsPage />);
    await screen.findByRole("tab", { name: /내 프로젝트/ });
    const meCalls = vi.mocked(global.fetch).mock.calls.filter(([input]) => String(input).startsWith("/api/auth/me"));
    expect(meCalls).toHaveLength(1);
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
  it("개수 응답 전에는 탭도 '(0)'도 보이지 않고, 응답 뒤에 '(n)'을 보인다", async () => {
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
    // W29: 개수를 받기 전에는 탭 바가 있을지(공개 프로젝트가 있는지) 모르므로 제목과 골격만 둔다
    await screen.findByRole("heading", { name: "프로젝트" });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByText(/\(0\)/)).not.toBeInTheDocument();

    release();
    await screen.findByRole("tab", { name: "내 프로젝트 (5)" });
    expect(screen.getByRole("tab", { name: "공개 프로젝트 (5)" })).toBeInTheDocument();
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

  it("내 프로젝트 탭에서는 소유자 이름을 숨기고, 공개 프로젝트 탭에서는 보인다", async () => {
    render(<ProjectsPage />);
    await screen.findByRole("link", { name: "주말 방송" });
    expect(screen.queryByText("삼루먼")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /공개 프로젝트/ }));
    expect(await screen.findByText("삼루먼")).toBeInTheDocument();
  });
});

describe("신규 유저의 검색·정렬 (UX-46)", () => {
  function stubProjects(mineTotal: number, loggedIn = true, othersTotal = 2) {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/auth/me")) {
        return loggedIn
          ? jsonResponse({ id: "u1", chzzkUserId: "c1", nickname: "삼루먼", profileImageUrl: null })
          : new Response(null, { status: 401 });
      }
      const total = url.startsWith("/api/projects/mine") ? mineTotal : url.startsWith("/api/projects/others") ? othersTotal : 0;
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

  it("공개 프로젝트 탭에서는 검색창을 보여 준다", async () => {
    stubProjects(0);
    render(<ProjectsPage />);
    fireEvent.click(await screen.findByRole("tab", { name: /공개 프로젝트/ }));
    expect(screen.getByRole("textbox", { name: "프로젝트 검색" })).toBeInTheDocument();
  });

  it("내 프로젝트가 있으면 검색창을 보여 준다", async () => {
    stubProjects(3);
    render(<ProjectsPage />);
    await screen.findByRole("tab", { name: /내 프로젝트 \(3\)/ });
    expect(screen.getByRole("textbox", { name: "프로젝트 검색" })).toBeInTheDocument();
  });

  // W06: 검색창·정렬 경계는 배경 대비 3:1 이상인 입력 경계 토큰
  it("검색창과 정렬 select는 입력 경계 토큰을 쓴다", async () => {
    stubProjects(3);
    render(<ProjectsPage />);
    await screen.findByRole("tab", { name: /내 프로젝트 \(3\)/ });
    expect(screen.getByRole("textbox", { name: "프로젝트 검색" })).toHaveClass("border-border-input");
    expect(screen.getByRole("combobox", { name: "정렬 기준" })).toHaveClass("border-border-input");
  });

  it("로그인하지 않았어도 공개 프로젝트가 있으면 검색창을 보여 준다", async () => {
    const card = {
      id: "p1", name: "주말 방송", description: null, ownerNickname: "삼루먼", timerCount: 0,
      timerStatus: null, remainingSeconds: null, scheduledStartAt: null, createdAt: "2026-03-01T12:00:00Z",
    };
    global.fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith("/api/auth/me")
        ? new Response(null, { status: 401 })
        : jsonResponse({ projects: [card], pagination: { page: 1, limit: 12, total: 1, totalPages: 1 } }),
    ) as typeof fetch;
    render(<ProjectsPage />);
    expect(await screen.findByRole("textbox", { name: "프로젝트 검색" })).toBeInTheDocument();
  });

  it("로그인하지 않았고 공개 프로젝트가 0개이면 검색창을 숨긴다", async () => {
    stubProjects(0, false);
    render(<ProjectsPage />);
    expect(await screen.findByText("공개된 프로젝트가 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "프로젝트 검색" })).not.toBeInTheDocument();
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

  it("공개 프로젝트 탭에서는 본문 버튼이 없으므로 헤더 버튼을 보인다", async () => {
    stubMine(0);
    render(<ProjectsPage />);
    await screen.findByRole("tab", { name: /내 프로젝트 \(0\)/ });
    fireEvent.click(screen.getByRole("tab", { name: /공개 프로젝트/ }));
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
    await screen.findByText("프로젝트를 불러오지 못했습니다.");
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

// W29: 탭 바·검색줄·빈 문구가 실제로 고를 것이 있는지에 맞고, 로딩 단계마다 줄이 끼어들어 아래를 밀지 않는다
describe("목록 탭·빈 상태·로딩 골격 (W29)", () => {
  const me = { id: "u1", chzzkUserId: "c1", nickname: "삼루먼", profileImageUrl: null };
  const card = (i: number) => ({
    id: `p${i}`, name: `프로젝트 ${i}`, description: null, ownerNickname: "삼루먼", timerCount: 0,
    timerStatus: null, remainingSeconds: null, scheduledStartAt: null, createdAt: "2026-03-01T12:00:00Z",
  });

  function stub({ mine, others, othersCountStatus = 200, loggedIn = true }: { mine: number; others: number; othersCountStatus?: number; loggedIn?: boolean }) {
    const calls: string[] = [];
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith("/api/auth/me")) return loggedIn ? jsonResponse(me) : new Response(null, { status: 401 });
      const isCount = url.endsWith("?limit=1");
      if (url.startsWith("/api/projects/others") && isCount && othersCountStatus !== 200) return new Response(null, { status: othersCountStatus });
      const total = url.startsWith("/api/projects/mine") ? mine : others;
      const shown = isCount ? 0 : Math.min(total, 12);
      return jsonResponse({ projects: Array.from({ length: shown }, (_, i) => card(i)), pagination: { page: 1, limit: 12, total, totalPages: Math.max(1, Math.ceil(total / 12)) } });
    }) as typeof fetch;
    return calls;
  }

  it("공개 프로젝트가 0개면 탭 바 없이 내 목록만 보인다", async () => {
    stub({ mine: 47, others: 0 });
    render(<ProjectsPage />);
    await screen.findByRole("link", { name: "프로젝트 0" });
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "프로젝트 검색" })).toBeInTheDocument();
  });

  it("공개 탭이 0건이면 검색·정렬을 숨기고 내 프로젝트와 다른 빈 문구를 보인다", async () => {
    // 개수를 받지 못하면 탭은 남고, 고른 탭의 첫 페이지가 0건인지로 판단한다
    stub({ mine: 3, others: 0, othersCountStatus: 500 });
    render(<ProjectsPage />);
    fireEvent.click(await screen.findByRole("tab", { name: "공개 프로젝트" }));
    expect(await screen.findByText("공개된 프로젝트가 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText("아직 프로젝트가 없습니다.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /첫 프로젝트 만들기/ })).not.toBeInTheDocument();
  });

  // W29 이월: 로그인 확인 전 골격에도 로그아웃 방문자로 보이면(html[data-auth=out]) 소개 줄을 CSS로 미리 그리고,
  // 본문이 되면 같은 요소를 그대로 이어 써 검색줄·카드를 밀지 않는다
  it("소개 줄은 골격 단계부터 로그아웃 힌트로만 보이는 같은 요소이고, 로그아웃 본문에서 그대로 남는다", async () => {
    let releaseMe: () => void = () => {};
    const meGate = new Promise<void>((r) => { releaseMe = r; });
    stub({ mine: 0, others: 3, loggedIn: false });
    const inner = global.fetch;
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith("/api/auth/me")) await meGate;
      return inner(input, init);
    }) as typeof fetch;
    render(<ProjectsPage />);
    const early = screen.getByText(SITE_DESCRIPTION);
    expect(early).toHaveClass("hidden", "signed-out:block");
    expect(document.querySelector("[aria-busy=true]")).toBeInTheDocument();

    releaseMe();
    await screen.findByRole("link", { name: "프로젝트 0" });
    const late = screen.getByText(SITE_DESCRIPTION);
    expect(late).toBe(early);
    expect(late).not.toHaveClass("hidden");
  });

  it("로그아웃 목록이 비어 있으면 '공개된 프로젝트가 없습니다'다", async () => {
    stub({ mine: 0, others: 0, loggedIn: false });
    render(<ProjectsPage />);
    expect(await screen.findByText("공개된 프로젝트가 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("탭 개수는 처음 한 번만 세고, 검색·정렬·탭을 바꿔도 다시 세거나 검색 결과 수로 바꾸지 않는다", async () => {
    const calls = stub({ mine: 5, others: 2 });
    render(<ProjectsPage />);
    await screen.findByRole("tab", { name: "내 프로젝트 (5)" });
    fireEvent.change(screen.getByRole("combobox", { name: "정렬 기준" }), { target: { value: "name" } });
    fireEvent.change(screen.getByRole("textbox", { name: "프로젝트 검색" }), { target: { value: "주말" } });
    await waitFor(() => expect(calls.some((u) => u.includes("q="))).toBe(true), { timeout: 2000 });
    fireEvent.click(screen.getByRole("tab", { name: /공개 프로젝트/ }));
    await waitFor(() => expect(calls.some((u) => u.startsWith("/api/projects/others") && u.includes("q="))).toBe(true));
    expect(calls.filter((u) => u.endsWith("?limit=1"))).toHaveLength(2);
    expect(screen.getByRole("tab", { name: "내 프로젝트 (5)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "공개 프로젝트 (2)" })).toBeInTheDocument();
  });

  it("첫 응답 전에는 제목과 첫 페이지 수(12)만큼의 카드 골격만 두고, 본문 줄은 한 번에 그린다", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    stub({ mine: 5, others: 2 });
    const inner = global.fetch;
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!String(input).startsWith("/api/auth/me")) await gate;
      return inner(input, init);
    }) as typeof fetch;
    render(<ProjectsPage />);
    expect(screen.getByRole("heading", { name: "프로젝트" })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 20));
    const busy = document.querySelector("[aria-busy=true]")!;
    expect(busy.querySelectorAll(".grid > div")).toHaveLength(12);
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /새 프로젝트/ })).not.toBeInTheDocument();

    release();
    await screen.findByRole("tab", { name: "내 프로젝트 (5)" });
    expect(screen.getByRole("textbox", { name: "프로젝트 검색" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /새 프로젝트/ })).toBeInTheDocument();
    expect(document.querySelector("[aria-busy=true]")).not.toBeInTheDocument();
  });
});
