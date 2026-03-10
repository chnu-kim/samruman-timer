import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "./Badge";

const meta = {
  title: "UI/Badge",
  component: Badge,
  tags: ["autodocs"],
} satisfies Meta<typeof Badge>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Running: Story = {
  args: { variant: "running", children: "Running" },
};

export const Expired: Story = {
  args: { variant: "expired", children: "Expired" },
};

export const Create: Story = {
  args: { variant: "create", children: "Create" },
};

export const Add: Story = {
  args: { variant: "add", children: "+10:00" },
};

export const Subtract: Story = {
  args: { variant: "subtract", children: "-05:00" },
};

export const Expire: Story = {
  args: { variant: "expire", children: "Expire" },
};

export const Reopen: Story = {
  args: { variant: "reopen", children: "Reopen" },
};

export const AllVariants: Story = {
  args: { variant: "running", children: "Running" },
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="running">Running</Badge>
      <Badge variant="expired">Expired</Badge>
      <Badge variant="create">Create</Badge>
      <Badge variant="add">+10:00</Badge>
      <Badge variant="subtract">-05:00</Badge>
      <Badge variant="expire">Expire</Badge>
      <Badge variant="reopen">Reopen</Badge>
    </div>
  ),
};
