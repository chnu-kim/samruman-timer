// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { StatePanel } from "../StatePanel";
import { FolderIcon } from "../Icons";

// 빈 목록·찾을 수 없음·불러오기 실패가 같은 규격으로 보이게 하는 유일한 틀이다(원 56px·아이콘 28px, 위아래 48px, 간격 16·4·16px)
describe("StatePanel", () => {
  it("원·아이콘·여백·간격이 공용 규격이다", () => {
    const { container } = render(
      <StatePanel icon={<FolderIcon />} title="제목" message="문구" action={<button type="button">행동</button>} />,
    );
    const root = container.firstElementChild!;
    expect(root).toHaveClass("py-12");
    const circle = root.firstElementChild!;
    expect(circle).toHaveClass("h-14", "w-14", "rounded-full", "bg-foreground/5");
    expect(circle.querySelector("svg")).toHaveClass("w-7", "h-7", "text-muted-foreground");
    expect(screen.getByRole("heading", { level: 1, name: "제목" })).toHaveClass("mt-4", "text-lg", "text-balance");
    expect(screen.getByText("문구")).toHaveClass("mt-1", "text-balance");
    expect(screen.getByRole("button", { name: "행동" }).parentElement).toHaveClass("mt-4", "flex");
  });

  it("제목이 없으면 문구가 원 아래 16px에 온다", () => {
    render(<StatePanel icon={<FolderIcon />} message="아직 프로젝트가 없습니다." />);
    expect(screen.getByText("아직 프로젝트가 없습니다.")).toHaveClass("mt-4");
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("오류 톤은 빨간 원이다", () => {
    const { container } = render(<StatePanel icon={<FolderIcon />} tone="error" message="실패" />);
    expect(container.firstElementChild!.firstElementChild).toHaveClass("bg-red-100");
    expect(container.querySelector("svg")).toHaveClass("text-red-500");
  });
});
