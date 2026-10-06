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
    return jsonResponse({ projects: [], pagination: { page: 1, limit: 12, total: 0, totalPages: 1 } });
  }) as typeof fetch;
});

afterEach(() => {
  // fetchMe는 확정 결과를 잠깐 같이 쓰므로 테스트마다 비워 이전 테스트의 로그인 상태가 남지 않게 한다
  resetMeCache();
  vi.restoreAllMocks();
  push.mockReset();
});

const me = { id: "u1", chzzkUserId: "c1", nickname: "삼루먼", profileImageUrl: null };
const card = (i: number) => ({
  id: `p${i}`, name: `프로젝트 ${i}`, description: null, timerCount: 0,
  timerStatus: null, remainingSeconds: null, scheduledStartAt: null, createdAt: "2026-03-01T12:00:00Z",
});

/** 내 프로젝트 total개. 검색어(q=)가 붙으면 searchTotal개로 답한다. 부른 주소를 순서대로 돌려준다 */
function stub({ mine, loggedIn = true, searchTotal = mine }: { mine: number; loggedIn?: boolean; searchTotal?: number }) {
  const calls: string[] = [];
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith("/api/auth/me")) return loggedIn ? jsonResponse(me) : new Response(null, { status: 401 });
    const total = url.includes("q=") ? searchTotal : mine;
    const shown = Math.min(total, 12);
    return jsonResponse({ projects: Array.from({ length: shown }, (_, i) => card(i)), pagination: { page: 1, limit: 12, total, totalPages: Math.max(1, Math.ceil(total / 12)) } });
  }) as typeof fetch;
  return calls;
}

// 헤더와 같은 첫 로드에 로그인을 확인하므로 공용 fetchMe로 한 요청을 같이 쓴다
describe("로그인 확인 (fetchMe)", () => {
  it("헤더가 먼저 물은 로그인 확인을 같이 써서 /api/auth/me를 한 번만 부른다", async () => {
    // 헤더(레이아웃)가 같은 첫 로드에 먼저 묻는다
    void fetchMe();
    render(<ProjectsPage />);
    await screen.findByRole("button", { name: /첫 프로젝트 만들기/ });
    const meCalls = vi.mocked(global.fetch).mock.calls.filter(([input]) => String(input).startsWith("/api/auth/me"));
    expect(meCalls).toHaveLength(1);
  });
});

// 다른 사람의 프로젝트는 목록으로 드러내지 않는다. 상세는 소유자가 건넨 링크로만 연다
describe("목록은 내 프로젝트만", () => {
  it("로그인하면 내 프로젝트만 부르고 탭 없이 카드를 보인다", async () => {
    const calls = stub({ mine: 2 });
    render(<ProjectsPage />);
    await screen.findByRole("link", { name: "프로젝트 0" });
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    const listCalls = calls.filter((u) => u.startsWith("/api/projects"));
    expect(listCalls.length).toBeGreaterThan(0);
    expect(listCalls.every((u) => u.startsWith("/api/projects/mine?"))).toBe(true);
    // 모두 본인 것이라 카드에 소유자 이름을 두지 않는다
    expect(screen.queryByText("삼루먼")).not.toBeInTheDocument();
  });

  it("로그아웃이면 목록을 부르지 않고 소개와 로그인 안내를 보인다", async () => {
    const calls = stub({ mine: 0, loggedIn: false });
    render(<ProjectsPage />);
    const login = await screen.findByRole("link", { name: "CHZZK로 로그인" });
    expect(login).toHaveAttribute("href", "/api/auth/login?next=%2Fprojects");
    expect(screen.getByText(SITE_DESCRIPTION)).toBeInTheDocument();
    expect(calls.some((u) => u.startsWith("/api/projects"))).toBe(false);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /새 프로젝트|첫 프로젝트 만들기/ })).not.toBeInTheDocument();
  });

  it("로그인 안내를 누르면 돌아온 첫 로드가 로그인 골격을 그리도록 힌트를 남긴다", async () => {
    stub({ mine: 0, loggedIn: false });
    localStorage.removeItem("signedIn");
    render(<ProjectsPage />);
    const login = await screen.findByRole("link", { name: "CHZZK로 로그인" });
    login.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(login);
    expect(localStorage.getItem("signedIn")).toBe("1");
    localStorage.removeItem("signedIn");
  });
});

describe("신규 유저의 검색·정렬 (UX-46)", () => {
  it("내 프로젝트가 0개면 검색창과 정렬을 숨긴다", async () => {
    stub({ mine: 0 });
    render(<ProjectsPage />);
    await screen.findByRole("button", { name: /첫 프로젝트 만들기/ });
    expect(screen.queryByRole("textbox", { name: "프로젝트 검색" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "정렬 기준" })).not.toBeInTheDocument();
  });

  it("내 프로젝트가 있으면 검색창을 보여 준다", async () => {
    stub({ mine: 3 });
    render(<ProjectsPage />);
    expect(await screen.findByRole("textbox", { name: "프로젝트 검색" })).toBeInTheDocument();
  });

  // W06: 검색창·정렬 경계는 배경 대비 3:1 이상인 입력 경계 토큰
  it("검색창과 정렬 select는 입력 경계 토큰을 쓴다", async () => {
    stub({ mine: 3 });
    render(<ProjectsPage />);
    expect(await screen.findByRole("textbox", { name: "프로젝트 검색" })).toHaveClass("border-border-input");
    expect(screen.getByRole("combobox", { name: "정렬 기준" })).toHaveClass("border-border-input");
  });

  // 전체 수는 검색어 없이 받은 응답으로만 정한다. 검색 결과가 0건이어도 검색창이 사라지지 않는다
  it("검색 결과가 0건이어도 검색창을 남기고 '검색 결과가 없습니다'를 보인다", async () => {
    const calls = stub({ mine: 5, searchTotal: 0 });
    render(<ProjectsPage />);
    fireEvent.change(await screen.findByRole("textbox", { name: "프로젝트 검색" }), { target: { value: "없는" } });
    expect(await screen.findByText("검색 결과가 없습니다.", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(calls.some((u) => u.includes("q="))).toBe(true);
    expect(screen.getByRole("textbox", { name: "프로젝트 검색" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /새 프로젝트/ })).toBeInTheDocument();
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
  it("내 프로젝트가 0개면 헤더 '새 프로젝트'를 숨기고 본문 버튼 하나만 보인다", async () => {
    stub({ mine: 0 });
    render(<ProjectsPage />);
    await screen.findByRole("button", { name: /첫 프로젝트 만들기/ });
    expect(screen.queryByRole("button", { name: /새 프로젝트/ })).not.toBeInTheDocument();
    expect(screen.getByText("아직 프로젝트가 없습니다.")).toBeInTheDocument();
  });

  it("빈 목록에서 폼을 열면 헤더에 '취소'가 나와 닫을 수 있다", async () => {
    stub({ mine: 0 });
    render(<ProjectsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /첫 프로젝트 만들기/ }));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByLabelText("프로젝트 이름")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /첫 프로젝트 만들기/ })).toBeInTheDocument();
  });

  it("목록 요청이 실패하면 본문 버튼이 없으므로 헤더 버튼을 보인다", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).startsWith("/api/auth/me")) return jsonResponse(me);
      return new Response(null, { status: 500 });
    }) as typeof fetch;
    render(<ProjectsPage />);
    await screen.findByText("프로젝트를 불러오지 못했습니다.");
    expect(screen.getByRole("button", { name: /새 프로젝트/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /첫 프로젝트 만들기/ })).not.toBeInTheDocument();
  });

  it("내 프로젝트가 있으면 헤더 버튼을 보인다", async () => {
    stub({ mine: 3 });
    render(<ProjectsPage />);
    expect(await screen.findByRole("button", { name: /새 프로젝트/ })).toBeInTheDocument();
  });
});

// C020: 로그아웃 첫 방문자에게 이 서비스가 무엇인지 한 줄로 알린다
describe("로그아웃 소개 한 줄 (C020)", () => {
  it("로그아웃 상태에서는 제목 아래 사이트 설명을 보여 주고 플랫폼 이름은 넣지 않는다", async () => {
    stub({ mine: 0, loggedIn: false });
    render(<ProjectsPage />);
    await screen.findByRole("link", { name: "CHZZK로 로그인" });
    const description = screen.getByText(SITE_DESCRIPTION);
    expect(description.tagName).toBe("P");
    expect(description.textContent).not.toMatch(/CHZZK|치지직/);
  });

  it("로그인 상태에서는 설명을 보여 주지 않는다", async () => {
    render(<ProjectsPage />);
    await screen.findByRole("button", { name: /첫 프로젝트 만들기/ });
    expect(screen.queryByText(SITE_DESCRIPTION)).not.toBeInTheDocument();
  });
});

// W29: 로딩 단계마다 줄이 끼어들어 아래를 밀지 않는다
describe("로딩 골격 (W29)", () => {
  // 로그인 확인 전 골격에도 로그아웃 방문자로 보이면(html[data-auth=out]) 소개 줄을 CSS로 미리 그리고,
  // 본문이 되면 같은 요소를 그대로 이어 써 아래를 밀지 않는다. 카드 골격 대신 로그인 안내 높이만 비워 둔다
  it("로그아웃 힌트면 골격은 소개 줄과 로그인 안내 자리이고, 소개 줄은 본문에서 같은 요소로 남는다", async () => {
    let releaseMe: () => void = () => {};
    const meGate = new Promise<void>((r) => { releaseMe = r; });
    stub({ mine: 0, loggedIn: false });
    const inner = global.fetch;
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith("/api/auth/me")) await meGate;
      return inner(input, init);
    }) as typeof fetch;
    render(<ProjectsPage />);
    const early = screen.getByText(SITE_DESCRIPTION);
    expect(early).toHaveClass("hidden", "signed-out:block");
    const busy = document.querySelector("[aria-busy=true]")!;
    expect(busy.querySelector(".hidden.signed-out\\:block.h-56")).toBeInTheDocument();
    expect(busy.querySelector(".grid")!.parentElement).toHaveClass("signed-out:hidden");

    releaseMe();
    const login = await screen.findByRole("link", { name: "CHZZK로 로그인" });
    expect(login.parentElement).toHaveClass("h-56");
    const late = screen.getByText(SITE_DESCRIPTION);
    expect(late).toBe(early);
    expect(late).not.toHaveClass("hidden");
  });

  it("첫 응답 전에는 제목과 첫 페이지 수(12)만큼의 카드 골격만 두고, 본문 줄은 한 번에 그린다", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    stub({ mine: 5 });
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
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /새 프로젝트/ })).not.toBeInTheDocument();

    release();
    expect(await screen.findByRole("textbox", { name: "프로젝트 검색" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /새 프로젝트/ })).toBeInTheDocument();
    expect(document.querySelector("[aria-busy=true]")).not.toBeInTheDocument();
  });
});
