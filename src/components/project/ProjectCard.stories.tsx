import type { Meta, StoryObj } from "@storybook/react";
import { ProjectCard } from "./ProjectCard";
import type { ProjectListItem } from "@/types";

const sampleProject: ProjectListItem = {
  id: "abc123",
  name: "삼루먼 타이머 프로젝트",
  description: "치지직 방송에서 사용하는 타이머 관리 프로젝트입니다.",
  ownerNickname: "삼루먼",
  timerCount: 1,
  createdAt: "2026-03-01T12:00:00Z",
};

const meta = {
  title: "Project/ProjectCard",
  component: ProjectCard,
  tags: ["autodocs"],
  args: {
    project: sampleProject,
  },
} satisfies Meta<typeof ProjectCard>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoDescription: Story = {
  args: {
    project: {
      ...sampleProject,
      description: null,
    },
  },
};

export const WithTimer: Story = {
  args: {
    project: {
      ...sampleProject,
      timerCount: 1,
    },
  },
};

export const Grid: Story = {
  render: () => {
    const projects: ProjectListItem[] = [
      sampleProject,
      { ...sampleProject, id: "2", name: "두 번째 프로젝트", description: null, timerCount: 0 },
      { ...sampleProject, id: "3", name: "세 번째 프로젝트", description: "아주 긴 설명이 들어가는 프로젝트입니다. 이 설명은 두 줄을 넘기면 잘리도록 설계되어 있습니다. 충분히 긴 텍스트를 넣어서 테스트합니다.", timerCount: 1 },
      { ...sampleProject, id: "4", name: "네 번째 프로젝트", ownerNickname: "다른유저", timerCount: 1 },
    ];
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </div>
    );
  },
};
