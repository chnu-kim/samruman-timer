// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { iconClass, SearchIcon } from "../Icons";

// UX-38: 넘겨준 크기 클래스가 기본 크기(w-6 h-6)에 묻히지 않아야 한다
describe("iconClass", () => {
  const tokens = (className?: string) => iconClass(className).split(" ");

  it("className이 없으면 기본 크기 w-6 h-6을 쓴다", () => {
    expect(tokens()).toEqual(["w-6", "h-6"]);
    expect(tokens("text-red-500")).toEqual(["w-6", "h-6", "text-red-500"]);
  });

  it("너비와 높이를 지정하면 기본 크기를 붙이지 않는다", () => {
    const result = tokens("absolute left-3 w-4 h-4 text-muted-foreground");
    expect(result).not.toContain("w-6");
    expect(result).not.toContain("h-6");
    expect(result).toContain("w-4");
    expect(result).toContain("h-4");
  });

  it("한 축만 지정하면 다른 축의 기본값은 유지한다", () => {
    expect(tokens("w-4")).toEqual(["h-6", "w-4"]);
    expect(tokens("h-3.5")).toEqual(["w-6", "h-3.5"]);
    expect(tokens("size-5")).toEqual(["size-5"]);
  });

  it("반응형 변형이나 max-w 같은 다른 클래스는 기본값을 빼지 않는다", () => {
    expect(tokens("sm:w-5 sm:h-5")).toEqual(["w-6", "h-6", "sm:w-5", "sm:h-5"]);
    expect(tokens("max-w-full min-h-0")).toEqual(["w-6", "h-6", "max-w-full", "min-h-0"]);
  });

  it("아이콘 컴포넌트가 지정한 크기만 렌더한다", () => {
    const { container } = render(<SearchIcon className="w-4 h-4" />);
    expect(container.querySelector("svg")?.getAttribute("class")).toBe("w-4 h-4");
  });
});
