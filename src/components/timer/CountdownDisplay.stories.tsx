import type { Meta, StoryObj } from "@storybook/react";
import { CountdownDisplay } from "./CountdownDisplay";

const meta = {
  title: "Timer/CountdownDisplay",
  component: CountdownDisplay,
  tags: ["autodocs"],
} satisfies Meta<typeof CountdownDisplay>;
export default meta;

type Story = StoryObj<typeof meta>;

export const RunningLarge: Story = {
  args: {
    remainingSeconds: 19800,
    status: "RUNNING",
    size: "large",
  },
};

export const RunningCompact: Story = {
  args: {
    remainingSeconds: 19800,
    status: "RUNNING",
    size: "compact",
  },
};

export const ExpiredLarge: Story = {
  args: {
    remainingSeconds: 0,
    status: "EXPIRED",
    size: "large",
  },
};

export const OverOneDay: Story = {
  args: {
    remainingSeconds: 100000,
    status: "RUNNING",
    size: "large",
  },
};

export const AlmostExpired: Story = {
  args: {
    remainingSeconds: 5,
    status: "RUNNING",
    size: "large",
  },
};
