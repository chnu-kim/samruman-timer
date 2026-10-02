// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { EditableText } from "../EditableText";

const noopSave = async () => {};

describe("EditableText", () => {
  // UX-31: 편집 가능해도 h1은 heading으로 남아야 한다
  it("편집 가능한 h1이 heading 의미를 유지하고 버튼 역할을 갖지 않는다", () => {
    render(<EditableText value="방송 타이머" onSave={noopSave} editable as="h1" />);
    const heading = screen.getByRole("heading", { level: 1, name: "방송 타이머" });
    expect(heading).not.toHaveAttribute("role");
    expect(heading).not.toHaveAttribute("tabindex");
    expect(screen.queryByRole("button", { name: /방송 타이머/ })).not.toBeInTheDocument();
  });

  it("제목과 설명의 편집 버튼 이름이 구분된다", () => {
    render(
      <>
        <EditableText value="제목" onSave={noopSave} editable as="h1" />
        <EditableText value="설명" onSave={noopSave} editable as="p" />
      </>,
    );
    expect(screen.getByRole("button", { name: "제목 편집" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "설명 편집" })).toBeInTheDocument();
  });

  it("편집 버튼과 제목 클릭 모두 편집 모드로 들어간다", () => {
    const { unmount } = render(<EditableText value="제목" onSave={noopSave} editable as="h1" />);
    fireEvent.click(screen.getByRole("button", { name: "제목 편집" }));
    expect(screen.getByRole("textbox")).toHaveValue("제목");
    unmount();

    render(<EditableText value="제목" onSave={noopSave} editable as="h1" />);
    fireEvent.click(screen.getByRole("heading", { level: 1 }));
    expect(screen.getByRole("textbox")).toHaveValue("제목");
  });

  // UX-32: 터치 기기(hover 없음)에서는 연필 아이콘이 항상 보인다
  it("hover가 없는 기기에서 편집 버튼을 보이게 하는 클래스가 있다", () => {
    render(<EditableText value="제목" onSave={noopSave} editable as="h1" />);
    expect(screen.getByRole("button", { name: "제목 편집" }).className).toContain("[@media(hover:none)]:opacity-100");
  });
});
