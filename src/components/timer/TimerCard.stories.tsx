import type { Meta, StoryObj } from "@storybook/react";
import { TimerCard } from "./TimerCard";
import type { TimerListItem } from "@/types";

const runningTimer: TimerListItem = {
  id: "timer-1",
  title: "삼루먼 방송 타이머",
  description: "방송 중 시청자 참여로 시간이 추가되는 타이머입니다.",
  remainingSeconds: 7200,
  status: "RUNNING",
  scheduledStartAt: null,
  createdAt: "2026-03-01T12:00:00Z",
};

const expiredTimer: TimerListItem = {
  id: "timer-2",
  title: "이벤트 타이머",
  description: "이벤트가 종료된 타이머입니다.",
  remainingSeconds: 0,
  status: "EXPIRED",
  scheduledStartAt: null,
  createdAt: "2026-03-01T10:00:00Z",
};

const meta = {
  title: "Timer/TimerCard",
  component: TimerCard,
  tags: ["autodocs"],
  args: {
    timer: runningTimer,
  },
} satisfies Meta<typeof TimerCard>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Running: Story = {};

export const Expired: Story = {
  args: {
    timer: expiredTimer,
  },
};

export const NoDescription: Story = {
  args: {
    timer: {
      ...runningTimer,
      description: null,
    },
  },
};

export const Grid: Story = {
  render: () => {
    const timers: TimerListItem[] = [
      runningTimer,
      expiredTimer,
      { ...runningTimer, id: "3", title: "긴 타이머", description: null, remainingSeconds: 100000 },
      { ...runningTimer, id: "4", title: "거의 만료", remainingSeconds: 10 },
    ];
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {timers.map((t) => (
          <TimerCard key={t.id} timer={t} />
        ))}
      </div>
    );
  },
};
