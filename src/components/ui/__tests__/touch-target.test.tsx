// @vitest-environment jsdom
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "../Button";
import { Input } from "../Input";
import { EditableText } from "../EditableText";
import { Header } from "@/components/layout/Header";

vi.mock("@/components/ui/ThemeToggle", () => ({ ThemeToggle: () => null }));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

// C051: 터치 기기(pointer: coarse)에서 누르는 대상은 44px 이상이고, 마우스 환경의 크기는 그대로다.
// jsdom은 미디어 쿼리를 계산하지 못하므로 클래스 토큰으로 고정한다. 실제 크기는 Playwright로 잰다.
const noopSave = async () => {};

describe("터치 타깃 44px (pointer-coarse)", () => {
  it("Button sm은 화면 폭이 아니라 터치 기기에서 44px이다", () => {
    render(<Button size="sm">작은 버튼</Button>);
    const cls = screen.getByRole("button", { name: "작은 버튼" }).className;
    expect(cls).toContain("h-8");
    expect(cls).toContain("pointer-coarse:min-h-11");
    expect(cls).not.toContain("max-md:min-h-11");
  });

  // W33: 주 CTA·다이얼로그 제출의 기본 크기. 데스크톱 40px(Input과 같은 줄 리듬), 터치 44px
  it("Button 기본값 md는 데스크톱 h-10, 터치 기기에서 44px이다", () => {
    render(<Button>기본 버튼</Button>);
    const cls = screen.getByRole("button", { name: "기본 버튼" }).className;
    expect(cls).toContain("h-10");
    expect(cls).toContain("pointer-coarse:min-h-11");
  });

  it("텍스트 액션 link 변형은 크기와 상관없이 터치에서만 누르는 높이가 44px이고 h-*를 갖지 않는다", () => {
    render(<Button variant="link" size="sm">다시 시도</Button>);
    const cls = screen.getByRole("button", { name: "다시 시도" }).className;
    expect(cls).toContain("pointer-coarse:min-h-11");
    expect(cls).not.toMatch(/(^|\s)min-h-11/); // 데스크톱은 글자 줄 높이
    expect(cls).toContain("text-accent");
    expect(cls).not.toMatch(/(^|\s)h-\d/);
  });

  it("Input은 데스크톱 40px, 터치 기기에서 44px이다", () => {
    render(<Input aria-label="이름" />);
    const cls = screen.getByRole("textbox", { name: "이름" }).className;
    expect(cls).toContain("h-10");
    expect(cls).toContain("pointer-coarse:min-h-11");
    expect(cls).not.toContain("py-2");
  });

  it("편집 연필은 데스크톱 30px(p-2)이고 터치에서는 ::before로 44px까지 넓힌다", () => {
    render(<EditableText value="제목" onSave={noopSave} editable as="h1" />);
    const cls = screen.getByRole("button", { name: "제목 편집" }).className;
    expect(cls).toContain("relative");
    expect(cls).toContain("pointer-coarse:before:absolute");
    expect(cls).toContain("p-2");
    expect(cls).toContain("pointer-coarse:before:-inset-[7px]");
    // 아래 설명 연필의 영역과 겹치므로 제목 연필이 위에 놓인다
    expect(cls).toContain("z-10");
    // W30: hover 배경 상자가 글자에 붙지 않게 왼쪽을 음수 여백으로 당기지 않고 간격 4px를 둔다
    expect(cls).not.toContain("-ml-1");
    expect(screen.getByRole("button", { name: "제목 편집" }).parentElement).toHaveClass("gap-1");
  });

  it("설명 연필은 제목 연필 영역을 덮지 않도록 위로 넓히지 않고 아래로만 넓힌다", () => {
    render(<EditableText value="설명" onSave={noopSave} editable as="p" />);
    const cls = screen.getByRole("button", { name: "설명 편집" }).className;
    expect(cls).toContain("pointer-coarse:before:top-0");
    expect(cls).toContain("pointer-coarse:before:-bottom-[21px]");
    expect(cls).not.toContain("pointer-coarse:before:-inset-[7px]");
  });

  it("편집 중 저장·취소는 겹치지 않게 상자 자체를 44px로 키운다", () => {
    render(<EditableText value="제목" onSave={noopSave} editable as="h1" />);
    fireEvent.click(screen.getByRole("button", { name: "제목 편집" }));
    for (const name of ["저장", "취소"]) {
      const cls = screen.getByRole("button", { name }).className;
      expect(cls).toContain("pointer-coarse:min-h-11");
      expect(cls).toContain("pointer-coarse:min-w-11");
    }
  });

  // W37: 헤더 로그인은 테마 토글과 같은 줄에서 같은 높이(데스크톱 40, 터치 44)다
  it("헤더 로그인 링크는 데스크톱 40px, 터치 기기에서 44px이다", () => {
    render(<Header initialUser={null} />);
    const cls = screen.getByRole("link", { name: "로그인" }).className;
    expect(cls).toContain("h-10");
    expect(cls).toContain("pointer-coarse:min-h-11");
  });

  // C129: 로그인 링크와 로그아웃 버튼은 같은 secondary 모양이다
  it("헤더 로그인 링크와 로그아웃 버튼은 같은 클래스를 쓴다", () => {
    const { unmount } = render(<Header initialUser={null} />);
    const login = screen.getByRole("link", { name: "로그인" }).className.split(" ");
    unmount();
    render(<Header initialUser={{ id: "u1", chzzkUserId: "c1", nickname: "스트리머", profileImageUrl: null }} />);
    const logout = screen.getByRole("button", { name: "로그아웃" }).className.split(" ");
    for (const cls of ["rounded-control", "border-border", "h-10", "px-4", "hover:bg-foreground/5", "pointer-coarse:min-h-11"]) {
      expect(login, cls).toContain(cls);
      expect(logout, cls).toContain(cls);
    }
  });

  // W33: 목록 검색·정렬, 폼의 select도 공용 Input과 같은 높이 규칙을 쓴다
  it("목록 검색·정렬과 폼 select는 h-10에 터치 44px 변형을 둔다", () => {
    const files = [
      "src/app/projects/page.tsx",
      "src/components/timer/CreateTimerForm.tsx",
      "src/components/goal/GoalForm.tsx",
    ];
    for (const f of files) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      // 속성 안의 화살표 함수(=>)를 지나 그 태그의 className까지 본다.
      // 태그 끝(/>)이나 식 className={...}(selectClass를 cn으로 쓰는 경우, 아래에서 따로 본다)을 먼저 만나면 건너뛴다
      const tags = [...src.matchAll(/<(?:input|select)\b[\s\S]*?(?:className=(?:"([^"]+)"|\{)|\/>)/g)];
      for (const m of tags) {
        if (m[1] === undefined) continue;
        expect(m[1], f).toContain("h-10");
        expect(m[1], f).toContain("pointer-coarse:min-h-11");
      }
      if (f === "src/app/projects/page.tsx") expect(tags.filter((m) => m[1]).length).toBe(2);
      for (const m of src.matchAll(/const selectClass =\s*"([^"]+)"/g)) {
        expect(m[1], f).toContain("h-10");
        expect(m[1], f).toContain("pointer-coarse:min-h-11");
      }
    }
  });

  // W33 크기 규칙: sm은 표·밀집 영역·칩만. 주 CTA·다이얼로그 제출·헤더 액션에 남은 sm은 위임된 작업이 바꿀 때까지 개수로 고정한다
  it("size=\"sm\"는 허용된 곳에만 있다", () => {
    const allowed: Record<string, number> = {
      "src/components/timer/OverlaySettings.tsx": 3, // 프리셋 칩·밀집 저장 줄(min-h-11 함께)
    };
    const found: Record<string, number> = {};
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name !== "__tests__") walk(p);
        } else if (/\.tsx$/.test(name) && !name.endsWith(".stories.tsx")) {
          const n = readFileSync(p, "utf8").match(/size="sm"/g)?.length ?? 0;
          if (n) found[p.slice(process.cwd().length + 1)] = n;
        }
      }
    };
    walk(join(process.cwd(), "src"));
    expect(found).toEqual(allowed);
  });

  // 폭 기준(max-md:)으로 되돌아가면 가로 태블릿(1024 터치)에서 다시 32px이 된다
  it("src 어디에도 폭 기준 터치 타깃(max-md:min-h-11)이 남아 있지 않다", () => {
    const root = join(process.cwd(), "src");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name !== "__tests__") walk(p);
        } else if (/\.tsx?$/.test(name) && readFileSync(p, "utf8").includes("max-md:min-h-11")) {
          offenders.push(p);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
