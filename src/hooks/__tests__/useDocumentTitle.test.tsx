// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { useDocumentTitle } from "../useDocumentTitle";

// UX-42: 페이지마다 탭 제목을 구분하고, 페이지를 떠나면 원래 제목으로 돌아가야 한다
describe("useDocumentTitle", () => {
  beforeEach(() => {
    document.title = "삼루먼타이머";
  });

  it("title을 탭 제목으로 쓰고 언마운트하면 이전 제목으로 되돌린다", () => {
    const { unmount } = renderHook(() => useDocumentTitle("방송 타이머 · 삼루먼타이머"));
    expect(document.title).toBe("방송 타이머 · 삼루먼타이머");
    unmount();
    expect(document.title).toBe("삼루먼타이머");
  });

  it("데이터를 불러오기 전(null)에는 제목을 바꾸지 않는다", () => {
    renderHook(() => useDocumentTitle(null));
    expect(document.title).toBe("삼루먼타이머");
  });

  it("title이 바뀌면 새 제목으로 갱신하고, 언마운트 후에는 처음 제목으로 돌아간다", () => {
    const { rerender, unmount } = renderHook(({ title }) => useDocumentTitle(title), {
      initialProps: { title: null as string | null },
    });
    rerender({ title: "A · 삼루먼타이머" });
    expect(document.title).toBe("A · 삼루먼타이머");
    rerender({ title: "B · 삼루먼타이머" });
    expect(document.title).toBe("B · 삼루먼타이머");
    unmount();
    expect(document.title).toBe("삼루먼타이머");
  });
});
