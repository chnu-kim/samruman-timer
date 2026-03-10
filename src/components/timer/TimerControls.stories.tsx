import type { Meta, StoryObj } from "@storybook/react";
import { TimerControls } from "./TimerControls";

const meta = {
  title: "Timer/TimerControls",
  component: TimerControls,
  tags: ["autodocs"],
  args: {
    timerId: "timer-123",
    onModified: (data) => alert(JSON.stringify(data, null, 2)),
  },
} satisfies Meta<typeof TimerControls>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
