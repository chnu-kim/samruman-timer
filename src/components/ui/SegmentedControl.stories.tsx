import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { SegmentedControl } from "./SegmentedControl";

const meta = {
  title: "UI/SegmentedControl",
  component: SegmentedControl,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="max-w-sm p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SegmentedControl>;
export default meta;

type Story = StoryObj<typeof meta>;

export const ChangeType: Story = {
  args: {
    options: [
      { value: "ADD", label: "추가" },
      { value: "SUBTRACT", label: "차감" },
    ],
    value: "ADD",
    onChange: fn(),
    ariaLabel: "추가/차감",
  },
};

export const SecondSelected: Story = {
  args: {
    options: [
      { value: "now", label: "즉시 시작" },
      { value: "scheduled", label: "예약 시작" },
    ],
    value: "scheduled",
    onChange: fn(),
    ariaLabel: "시작 방식",
  },
};

// 클릭·화살표 키로 실제로 바뀌는 예
export const Interactive: Story = {
  args: { ...ChangeType.args, onChange: fn() } as Story["args"],
  render: function Render() {
    const [value, setValue] = useState<"DURATION" | "DEADLINE">("DURATION");
    return (
      <div>
        <span id="goal-type" className="mb-1.5 block text-sm font-medium text-foreground">목표 유형</span>
        <SegmentedControl
          options={[
            { value: "DURATION", label: "방송 시간 목표" },
            { value: "DEADLINE", label: "데드라인 목표" },
          ]}
          value={value}
          onChange={setValue}
          ariaLabelledBy="goal-type"
        />
      </div>
    );
  },
};
