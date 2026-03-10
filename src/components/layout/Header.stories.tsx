import type { Meta, StoryObj } from "@storybook/react";
import { Header } from "./Header";

const meta = {
  title: "Layout/Header",
  component: Header,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof Header>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    initialUser: null,
  },
};

export const LoggedIn: Story = {
  args: {
    initialUser: {
      id: "abc123",
      chzzkUserId: "chzzk456",
      nickname: "테스트유저",
      profileImageUrl: null,
    },
  },
};
