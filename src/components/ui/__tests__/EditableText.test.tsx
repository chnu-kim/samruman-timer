// @vitest-environment jsdom
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
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

  // C007: 키보드로 편집을 끝내면 포커스가 body로 떨어지지 않고 편집 버튼으로 돌아온다
  it("Esc로 취소하면 편집 버튼으로 포커스가 돌아온다", () => {
    render(<EditableText value="제목" onSave={noopSave} editable as="h1" />);
    fireEvent.click(screen.getByRole("button", { name: "제목 편집" }));
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(screen.getByRole("button", { name: "제목 편집" })).toHaveFocus();
  });

  it("Enter로 저장하면 저장이 끝난 뒤 편집 버튼으로 포커스가 돌아온다", async () => {
    const onSave = vi.fn(async () => {});
    render(<EditableText value="제목" onSave={onSave} editable as="h1" />);
    fireEvent.click(screen.getByRole("button", { name: "제목 편집" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "새 제목" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    await waitFor(() => expect(screen.getByRole("button", { name: "제목 편집" })).toHaveFocus());
    expect(onSave).toHaveBeenCalledWith("새 제목");
  });

  it("Enter로 저장하는 중 input이 disabled가 되며 생기는 blur는 다시 저장하지 않는다(요청 1회)", async () => {
    let finish: () => void = () => {};
    const onSave = vi.fn(() => new Promise<void>((r) => { finish = r; }));
    render(<EditableText value="제목" onSave={onSave} editable as="h1" />);
    fireEvent.click(screen.getByRole("button", { name: "제목 편집" }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "새 제목" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // 브라우저는 저장 중 disabled가 된 input에서 blur를 낸다(jsdom은 내지 않아 직접 낸다)
    fireEvent.blur(input);
    await act(async () => { finish(); });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("다른 곳으로 포커스를 옮겨 저장되면 포커스를 빼앗지 않는다", async () => {
    render(
      <>
        <EditableText value="제목" onSave={noopSave} editable as="h1" />
        <button type="button">다른 버튼</button>
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "제목 편집" }));
    const other = screen.getByRole("button", { name: "다른 버튼" });
    act(() => other.focus());
    expect(await screen.findByRole("button", { name: "제목 편집" })).not.toHaveFocus();
    expect(other).toHaveFocus();
  });

  // UX-32: 터치 기기(hover 없음)에서는 연필 아이콘이 항상 보인다
  it("hover가 없는 기기에서 편집 버튼을 보이게 하는 클래스가 있다", () => {
    render(<EditableText value="제목" onSave={noopSave} editable as="h1" />);
    expect(screen.getByRole("button", { name: "제목 편집" }).className).toContain("[@media(hover:none)]:opacity-100");
  });
});
