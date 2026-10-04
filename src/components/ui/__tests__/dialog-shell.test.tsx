// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { ConfirmDialog } from "../ConfirmDialog";
import { FormDialog } from "../FormDialog";
import { ToastProvider } from "../Toast";
import { GoalForm } from "@/components/goal/GoalForm";
import { CreateTimerForm } from "@/components/timer/CreateTimerForm";

beforeAll(() => {
  // jsdom은 showModal/close를 구현하지 않을 수 있다
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

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

  // R34: 열자마자 입력할 칸에 포커스가 간다(data-autofocus가 빠지면 '닫기'로 가서 실패한다)
  it("새 목표 대화상자는 열리면 제목 칸에 포커스가 간다", () => {
    render(
      <ToastProvider>
        <FormDialog open title="새 목표 설정" onClose={noop}>
          <GoalForm projectId="p1" />
        </FormDialog>
      </ToastProvider>,
    );
    expect(document.activeElement).toBe(screen.getByLabelText("목표 제목"));
  });

  // 제목은 프로젝트 이름으로 미리 채워지므로 비어 있는 첫 입력칸인 '시간'으로 간다
  it("타이머 만들기 대화상자는 열리면 초기 시간의 시 칸에 포커스가 간다", () => {
    render(
      <ToastProvider>
        <FormDialog open title="타이머 만들기" onClose={noop}>
          <CreateTimerForm projectId="p1" defaultTitle="주말 서브어톤" />
        </FormDialog>
      </ToastProvider>,
    );
    expect(document.activeElement).toBe(screen.getByRole("spinbutton", { name: "시" }));
  });
});
