// @vitest-environment jsdom
import { render, screen, fireEvent, within } from "@testing-library/react";
import { GoalCard, formatDeadlineAt } from "../GoalCard";
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

function renderCard(g: GoalResponse, props: { compact?: boolean; isOwner?: boolean } = {}) {
  return render(
    <ToastProvider>
      <GoalCard goal={g} projectId="p1" isOwner={props.isOwner ?? true} compact={props.compact} />
    </ToastProvider>,
  );
}

function openMenu(title: string) {
  fireEvent.click(screen.getByRole("button", { name: `${title} 더보기` }));
}

const ended = (status: GoalResponse["status"]): GoalResponse => ({ ...goal, status, completedAt: "2026-03-02T12:00:00Z" });

describe("GoalCard", () => {
  // UX-40: '취소'와 '취소하기'가 나란히 있으면 물러서려다 되돌릴 수 없는 버튼을 누를 수 있다
  it("목표 취소 확인창의 물러서기 버튼은 '돌아가기'다", () => {
    renderCard(goal);
    openMenu("10시간 달성");
    fireEvent.click(screen.getByRole("button", { name: "목표 취소" }));

    const dialog = screen.getByRole("dialog", { name: "목표 취소" });
    expect(within(dialog).getByRole("button", { name: "돌아가기" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "취소하기" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "취소" })).not.toBeInTheDocument();
  });

  // C127: 카드마다 파괴적 버튼 두 개가 늘 보이던 것을 더보기 하나로 접는다
  it("진행 중 카드는 기본 상태에서 더보기 버튼 하나만 보이고, 메뉴에는 '목표 취소'만 있다", () => {
    renderCard(goal);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "10시간 달성 더보기" })).toBeInTheDocument();

    openMenu("10시간 달성");
    expect(screen.getByRole("button", { name: "목표 취소" })).toBeInTheDocument();
    // C118: 진행 중 목표에는 '삭제'를 두지 않는다
    expect(screen.queryByRole("button", { name: "삭제" })).not.toBeInTheDocument();
  });

  // C071: 진행 중 탭 이름이 이미 상태라 카드 배지를 반복하지 않는다
  it("진행 중 카드에는 '진행 중' 배지가 없다", () => {
    renderCard(goal);
    expect(screen.queryByText("진행 중")).not.toBeInTheDocument();
  });

  it.each(["CANCELLED", "FAILED"] as const)("%s로 끝난 카드는 더보기에서 '삭제'하고, 확인창이 기록에서 사라진다고 알린다", (status) => {
    renderCard(ended(status), { compact: true });
    openMenu("10시간 달성");
    expect(screen.queryByRole("button", { name: "목표 취소" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));

    const dialog = screen.getByRole("dialog", { name: "목표 삭제" });
    expect(dialog).toHaveTextContent("기록에서 사라집니다");
    // UX-70: 삭제 확인 라벨을 다른 화면과 같은 '삭제'로 통일한다
    expect(within(dialog).getByRole("button", { name: "삭제" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "삭제하기" })).not.toBeInTheDocument();
  });

  it("달성한 목표에는 고칠 동작이 없다(기록 보호)", () => {
    renderCard(ended("COMPLETED"), { compact: true });
    expect(screen.queryByRole("button", { name: /더보기/ })).not.toBeInTheDocument();
    expect(screen.getByText("달성")).toBeInTheDocument();
  });

  it("시청자에게는 더보기가 없다", () => {
    renderCard(goal, { isOwner: false });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  // C160: '누적'이 무엇을 세는지 드러낸다
  it("방송 시간 목표는 '방송 n 경과 / 목표'로 보여 준다", () => {
    renderCard(goal);
    expect(screen.getByText("방송 시간")).toBeInTheDocument();
    expect(screen.getByText("방송 5시간 경과 / 10시간")).toBeInTheDocument();
  });

  describe("데드라인 카드 (C159)", () => {
    const deadlineIso = new Date(2026, 9, 5, 0, 0).toISOString();
    const deadline: GoalResponse = {
      ...goal,
      type: "DEADLINE",
      title: "일요일 자정까지",
      targetSeconds: null,
      targetDatetime: deadlineIso,
      progress: { percentage: 0, timerSurvivesDeadline: true, deadlineIn: 90000, deadlineAfterTimerEnd: false },
    };

    it("퍼센트 대신 마감 시각과 남은 기간을 보여 준다", () => {
      renderCard(deadline);
      expect(screen.getByText("10. 05 (월) 00:00 · D-1")).toBeInTheDocument();
      expect(screen.queryByText("0%")).not.toBeInTheDocument();
      expect(screen.queryByText("종료 예정보다 뒤")).not.toBeInTheDocument();
    });

    it("마감이 타이머 종료 예정보다 늦으면 경고한다", () => {
      renderCard({ ...deadline, progress: { ...deadline.progress, deadlineAfterTimerEnd: true } });
      expect(screen.getByText("종료 예정보다 뒤")).toBeInTheDocument();
    });

    it("formatDeadlineAt은 로컬 시각 기준 'MM. DD (요일) HH:mm'이다", () => {
      expect(formatDeadlineAt(new Date(2026, 0, 3, 9, 5).toISOString())).toBe("01. 03 (토) 09:05");
      expect(formatDeadlineAt("not-a-date")).toBe("");
    });
  });
});
