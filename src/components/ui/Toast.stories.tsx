import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { useToast } from "./Toast";
import { Button } from "./Button";

// ToastProvider는 .storybook/preview.ts의 데코레이터가 감싼다. 버튼을 눌러 토스트를 띄운다
function ToastDemo({
  message,
  variant,
  actionLabel,
  onAction,
}: {
  message: string;
  variant: "success" | "error" | "info";
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { toast } = useToast();
  return (
    <div className="flex gap-2">
      <Button
        onClick={() =>
          toast(message, variant, actionLabel && onAction ? { action: { label: actionLabel, onClick: onAction } } : undefined)
        }
      >
        토스트 띄우기
      </Button>
      <Button
        variant="secondary"
        onClick={() => [1, 2, 3, 4, 5].forEach((n) => toast(`+${n}시간 · 삼루먼`, "success"))}
      >
        연속 5회(하나만 남음)
      </Button>
    </div>
  );
}

const meta = {
  title: "UI/Toast",
  component: ToastDemo,
  tags: ["autodocs"],
  args: { message: "+10분 · 벌칙룰렛", variant: "success" },
} satisfies Meta<typeof ToastDemo>;
export default meta;

type Story = StoryObj<typeof meta>;

/** 시간 변경 성공: 변경량 · 닉네임 + 되돌리기(6초, 마우스·포커스가 있는 동안 유지) */
export const WithUndo: Story = {
  args: { actionLabel: "되돌리기", onAction: fn() },
};

export const Success: Story = {
  args: { message: "기본 닉네임이 설정되었습니다" },
};

export const Failure: Story = {
  args: { message: "시간 변경에 실패했습니다.", variant: "error" },
};

export const Info: Story = {
  args: { message: "시청자 닉네임을 입력하거나 기본 닉네임을 설정하면 숫자키로 즉시 적용됩니다", variant: "info" },
};
