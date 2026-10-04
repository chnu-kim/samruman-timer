// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { GoalForm } from "../GoalForm";
import { ToastProvider } from "@/components/ui/Toast";

describe("GoalForm", () => {
  // C120: 이전 유형의 검증 오류가 남아 무엇이 틀렸는지 알 수 없던 문제
  it("유형을 바꾸면 이전 유형의 오류가 사라진다", () => {
    render(
      <ToastProvider>
        <GoalForm projectId="p1" />
      </ToastProvider>,
    );
    fireEvent.change(screen.getByLabelText("목표 제목"), { target: { value: "오류 확인" } });
    fireEvent.click(screen.getByRole("button", { name: "목표 만들기" }));
    expect(screen.getByRole("alert")).toHaveTextContent("목표 시간은 1분 이상이어야 합니다.");

    fireEvent.click(screen.getByRole("radio", { name: "데드라인 목표" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // C160: '누적'이 무엇을 세는지 드러낸다
  it("시간형 목표의 이름은 '방송 시간 목표'다", () => {
    render(
      <ToastProvider>
        <GoalForm projectId="p1" />
      </ToastProvider>,
    );
    expect(screen.getByRole("radio", { name: "방송 시간 목표" })).toBeInTheDocument();
  });

  // C004·C003: 목표 유형은 공용 세그먼트(선택 항목만 Tab 정지점), 푸터는 주 동작 하나(닫기는 다이얼로그 X)
  it("목표 유형은 세그먼트이고 취소 버튼 없이 주 동작 하나로 끝난다", () => {
    render(
      <ToastProvider>
        <GoalForm projectId="p1" />
      </ToastProvider>,
    );
    const group = screen.getByRole("radiogroup", { name: "목표 유형" });
    const radios = screen.getAllByRole("radio");
    expect(group).toContainElement(radios[0]);
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1]);
    fireEvent.keyDown(radios[0], { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "데드라인 목표" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("button", { name: "취소" })).not.toBeInTheDocument();
  });
});
