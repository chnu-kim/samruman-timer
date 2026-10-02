// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { ProjectCard } from "../ProjectCard";
import type { ProjectListItem } from "@/types";

const project: ProjectListItem = {
  id: "abc123",
  name: "방송 프로젝트",
  description: null,
  ownerNickname: "삼루먼",
  timerCount: 1,
  createdAt: "2026-03-01T12:00:00Z",
};

describe("ProjectCard", () => {
  // UX-37: 타이머가 없는 프로젝트를 목록에서 구분할 수 있어야 한다
  it("타이머가 없으면 '타이머 없음'을 표시한다", () => {
    render(<ProjectCard project={{ ...project, timerCount: 0 }} />);
    expect(screen.getByText("타이머 없음")).toBeInTheDocument();
  });

  it("타이머가 있으면 '타이머 없음'을 표시하지 않는다", () => {
    render(<ProjectCard project={project} />);
    expect(screen.queryByText("타이머 없음")).not.toBeInTheDocument();
  });
});
