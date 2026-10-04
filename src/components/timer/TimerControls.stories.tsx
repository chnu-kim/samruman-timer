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

// 만료: 추가/차감 세그먼트 없이 '추가'로 고정된다(차감을 골라 두었어도)
export const Expired: Story = {
  args: { status: "EXPIRED", remainingSeconds: 0, selectedAction: "SUBTRACT" },
};

// 예약 대기: 시간 추가/차감 대신 '지금 시작' 하나
export const Scheduled: Story = {
  args: { status: "SCHEDULED", remainingSeconds: 7200 },
};

// 모바일(md 미만): 카드 프리셋·확인 버튼은 숨고 하단 바 한 자리가 주 행동이다.
// 시/분/초에 값을 넣으면 바가 '시간 추가 (…)' 제출 버튼 하나로 바뀐다
export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
};

// 연결 끊김: 버튼은 그대로 두고 안내 줄 문구만 바뀐다
export const Disconnected: Story = {
  args: { disconnected: true },
};
