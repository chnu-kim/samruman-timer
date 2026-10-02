// @vitest-environment jsdom
import { render, screen, fireEvent, within } from "@testing-library/react";
import { GoalCard } from "../GoalCard";
import { ToastProvider } from "@/components/ui/Toast";
import type { GoalResponse } from "@/types";

const goal: GoalResponse = {
  id: "g1",
  type: "DURATION",
  title: "10시간 달성",
  targetSeconds: 36000,
  targetDatetime: null,
  status: "ACTIVE",
  progress: { percentage: 50, currentSeconds: 18000, remainingToTarget: 18000 },
  createdAt: "2026-03-01T12:00:00Z",
  completedAt: null,
};

beforeAll(() => {
  // jsdom은 showModal/close를 구현하지 않을 수 있다
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

describe("GoalCard", () => {
  // UX-40: '취소'와 '취소하기'가 나란히 있으면 물러서려다 되돌릴 수 없는 버튼을 누를 수 있다
  it("목표 취소 확인창의 물러서기 버튼은 '돌아가기'다", () => {
    render(
      <ToastProvider>
        <GoalCard goal={goal} projectId="p1" isOwner />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "10시간 달성 목표 취소" }));

    const dialog = screen.getByRole("dialog", { name: "목표 취소" });
    expect(within(dialog).getByRole("button", { name: "돌아가기" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "취소하기" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "취소" })).not.toBeInTheDocument();
  });
});
