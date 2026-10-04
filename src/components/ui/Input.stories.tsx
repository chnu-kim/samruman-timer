import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "./Input";

const meta = {
  title: "UI/Input",
  component: Input,
  tags: ["autodocs"],
} satisfies Meta<typeof Input>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { placeholder: "텍스트 입력…" },
};

export const WithLabel: Story = {
  args: { label: "Email", placeholder: "you@example.com" },
};

export const WithError: Story = {
  args: { label: "Email", error: "Invalid email address", value: "invalid" },
};

export const Disabled: Story = {
  args: { label: "Email", disabled: true, value: "disabled@example.com" },
};
