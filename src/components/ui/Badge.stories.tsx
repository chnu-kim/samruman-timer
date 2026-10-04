import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "./Badge";

const meta = {
  title: "UI/Badge",
  component: Badge,
  tags: ["autodocs"],
} satisfies Meta<typeof Badge>;
export default meta;

type Story = StoryObj<typeof meta>;

// 색은 의미 축 네 개다. 변형 이름은 쓰는 자리(상태·기록·목표)를 따르지만 같은 의미면 같은 모양이다

export const Positive: Story = {
  args: { variant: "running", children: "실행 중" },
};

export const Negative: Story = {
  args: { variant: "expired", children: "만료" },
};

export const Scheduled: Story = {
  args: { variant: "scheduled", children: "예약됨" },
};

export const Neutral: Story = {
  args: { variant: "create", children: "생성" },
};

export const Disconnected: Story = {
  args: { variant: "disconnected", children: "연결 끊김 · 12초 전 기준" },
};

export const AllVariants: Story = {
  args: { variant: "running", children: "실행 중" },
  render: () => (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-24 text-muted-foreground">진행·추가</span>
        <Badge variant="running">실행 중</Badge>
        <Badge variant="add">추가</Badge>
        <Badge variant="completed">달성</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-24 text-muted-foreground">종료·차감</span>
        <Badge variant="expired">만료</Badge>
        <Badge variant="expire">만료</Badge>
        <Badge variant="subtract">차감</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-24 text-muted-foreground">예약</span>
        <Badge variant="scheduled">예약됨</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-24 text-muted-foreground">나머지</span>
        <Badge variant="create">생성</Badge>
        <Badge variant="reopen">재시작</Badge>
        <Badge variant="activate">활성화</Badge>
        <Badge variant="delete">취소</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-24 text-muted-foreground">서버 상태 모름</span>
        <Badge variant="disconnected">연결 끊김 · 12초 전 기준</Badge>
      </div>
    </div>
  ),
};
