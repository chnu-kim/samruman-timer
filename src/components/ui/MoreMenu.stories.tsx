import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { MoreMenu } from "./MoreMenu";

const meta = {
  title: "UI/MoreMenu",
  component: MoreMenu,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="flex justify-end p-4 pb-48">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MoreMenu>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "더보기",
    items: [
      { label: "링크 복사", onSelect: fn() },
      { label: "타이머 삭제", onSelect: fn(), danger: true },
      { label: "프로젝트 삭제", onSelect: fn(), danger: true },
    ],
  },
};

export const WithDisabledItem: Story = {
  args: {
    label: "더보기",
    items: [
      { label: "링크 복사", onSelect: fn() },
      { label: "프로젝트 삭제", onSelect: fn(), danger: true, disabled: true },
    ],
  },
};
