import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { TimerControls } from "./TimerControls";
import type { ModifyAction } from "@/types";

const meta = {
  title: "Timer/TimerControls",
  component: TimerControls,
  tags: ["autodocs"],
  args: {
    timerId: "timer-123",
    selectedAction: "ADD",
    onActionChange: fn(),
    onModified: (data) => alert(JSON.stringify(data, null, 2)),
  },
  // 추가/차감 방향은 상위가 소유하므로 스토리에서도 상태를 들고 내려 준다
  render: function Render(args) {
    const [action, setAction] = useState<ModifyAction>(args.selectedAction);
    return (
      <TimerControls
        {...args}
        selectedAction={action}
        onActionChange={(next) => {
          setAction(next);
          args.onActionChange(next);
        }}
      />
    );
  },
} satisfies Meta<typeof TimerControls>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Subtract: Story = {
  args: { selectedAction: "SUBTRACT" },
};
