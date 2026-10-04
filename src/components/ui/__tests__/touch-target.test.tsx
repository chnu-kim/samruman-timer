// @vitest-environment jsdom
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "../Button";
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

  it("편집 연필은 보이는 크기를 두고 ::before로만 누르는 영역을 넓힌다", () => {
    render(<EditableText value="제목" onSave={noopSave} editable as="h1" />);
    const cls = screen.getByRole("button", { name: "제목 편집" }).className;
    expect(cls).toContain("relative");
    expect(cls).toContain("pointer-coarse:before:absolute");
    expect(cls).toContain("pointer-coarse:before:-inset-[11px]");
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

  it("헤더 로그인 링크는 테두리 높이 32px을 두고 위아래 누르는 영역만 넓힌다", () => {
    render(<Header initialUser={null} />);
    const cls = screen.getByRole("link", { name: "로그인" }).className;
    expect(cls).toContain("h-8");
    expect(cls).toContain("pointer-coarse:before:-inset-y-[7px]");
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
