import type { Meta, StoryObj } from "@storybook/react";
import { CreateProjectForm } from "./CreateProjectForm";

const meta = {
  title: "Project/CreateProjectForm",
  component: CreateProjectForm,
  tags: ["autodocs"],
  args: {
    onSuccess: (id: string) => {
      alert(`프로젝트 생성 성공: ${id}`);
    },
  },
} satisfies Meta<typeof CreateProjectForm>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
