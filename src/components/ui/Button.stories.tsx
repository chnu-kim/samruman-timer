import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";

const meta = {
  title: "UI/Button",
  component: Button,
  tags: ["autodocs"],
  args: {
    children: "Button",
  },
} satisfies Meta<typeof Button>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: { variant: "primary" },
};

export const Secondary: Story = {
  args: { variant: "secondary" },
};

export const Ghost: Story = {
  args: { variant: "ghost" },
};

/** 텍스트 액션('다시 시도' 등). 크기와 상관없이 누르는 높이 44px */
export const Link: Story = {
  args: { variant: "link", children: "다시 시도" },
};

export const Small: Story = {
  args: { size: "sm" },
};

export const Large: Story = {
  args: { size: "lg" },
};

/** 비활성은 변형과 상관없이 중립 토큰(bg-muted)으로 칠한다. 라이트·다크에서 같은 모양 */
export const Disabled: Story = {
  args: { disabled: true },
};

/** 저장·생성 요청 중(aria-busy). 비활성이지만 변형 색을 유지한다 */
export const Busy: Story = {
  args: { disabled: true, "aria-busy": true, children: "저장 중…" },
};

export const DisabledVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <Button disabled>주 버튼</Button>
      <Button variant="secondary" disabled>보조 버튼</Button>
      <Button variant="danger" disabled>삭제</Button>
      <Button variant="ghost" disabled>고스트</Button>
      <Button variant="link" disabled>다시 시도</Button>
    </div>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
      <Button disabled>Disabled</Button>
    </div>
  ),
};
