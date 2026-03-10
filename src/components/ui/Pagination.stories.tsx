import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { Pagination } from "./Pagination";

const meta = {
  title: "UI/Pagination",
  component: Pagination,
  tags: ["autodocs"],
  args: {
    onPageChange: fn(),
  },
} satisfies Meta<typeof Pagination>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { page: 3, totalPages: 10 },
};

export const FirstPage: Story = {
  args: { page: 1, totalPages: 10 },
};

export const LastPage: Story = {
  args: { page: 10, totalPages: 10 },
};

export const SinglePage: Story = {
  args: { page: 1, totalPages: 1 },
};
