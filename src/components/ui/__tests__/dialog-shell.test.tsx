// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { ConfirmDialog } from "../ConfirmDialog";
import { FormDialog } from "../FormDialog";

// C003: 다이얼로그 셸 한 패턴. 제목은 h2(오버레이 설정과 같음), 닫기(X)는 44px 히트 영역,
// 확인창은 같은 제목 양식에 X 없이 버튼 두 개로 끝난다
describe("다이얼로그 셸", () => {
  const noop = () => {};

  it("FormDialog 제목은 h2이고 닫기 버튼의 히트 영역은 44px이다", () => {
    const { container } = render(
      <FormDialog open={false} title="새 목표 설정" onClose={noop}>
        <p>본문</p>
      </FormDialog>,
    );
    const dialog = container.querySelector("dialog")!;
    const heading = dialog.querySelector("h2")!;
    expect(heading).toHaveTextContent("새 목표 설정");
    expect(dialog).toHaveAttribute("aria-labelledby", heading.id);
    expect(dialog.querySelector('button[aria-label="닫기"]')).toHaveClass("min-h-11", "min-w-11");
  });

  it("ConfirmDialog는 같은 제목 양식에 닫기(X)가 없다", () => {
    const { container } = render(
      <ConfirmDialog open={false} title="타이머 삭제" onConfirm={noop} onCancel={noop} />,
    );
    const dialog = container.querySelector("dialog")!;
    expect(dialog.querySelector("h2")).toHaveTextContent("타이머 삭제");
    expect(dialog.querySelector('button[aria-label="닫기"]')).toBeNull();
  });
});
