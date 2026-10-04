// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { ProjectCard } from "../ProjectCard";
import type { ProjectListItem } from "@/types";

const project: ProjectListItem = {
  id: "abc123",
  name: "방송 프로젝트",
  description: null,
  ownerNickname: "삼루먼",
  timerCount: 0,
  timerStatus: null,
  remainingSeconds: null,
  scheduledStartAt: null,
  createdAt: "2026-03-01T12:00:00Z",
};

describe("ProjectCard", () => {
  // C145·C076: 링크 이름은 프로젝트 이름이고, 카드 제목은 h1 다음 단계인 h2다
  it("링크의 접근 가능한 이름이 프로젝트 이름이고 제목은 h2다", () => {
    render(<ProjectCard project={project} />);
    expect(screen.getByRole("link", { name: "방송 프로젝트" })).toHaveAttribute("href", "/projects/abc123");
    expect(screen.getByRole("heading", { level: 2, name: "방송 프로젝트" })).toBeInTheDocument();
  });

  // C030: 타이머 상태를 정적 한 줄로 보인다. 없는 것이 기본이라 '타이머 없음'은 쓰지 않는다
  it("타이머가 없으면 상태 문구를 보이지 않는다", () => {
    render(<ProjectCard project={project} />);
    expect(screen.queryByText("타이머 없음")).not.toBeInTheDocument();
    expect(screen.queryByText(/실행 중|예약됨|만료/)).not.toBeInTheDocument();
  });

  it("실행 중이면 남은 시간을 함께 보인다", () => {
    render(
      <ProjectCard project={{ ...project, timerCount: 1, timerStatus: "RUNNING", remainingSeconds: 2 * 3600 + 14 * 60 + 5 }} />,
    );
    expect(screen.getByText("실행 중 · 2시간 14분 남음")).toBeInTheDocument();
    // 상태는 링크 설명으로도 전달된다
    expect(screen.getByRole("link", { name: "방송 프로젝트" })).toHaveAccessibleDescription(/실행 중 · 2시간 14분 남음/);
  });

  it("실행 중이고 1분이 안 남았으면 '1분 미만'으로 보인다", () => {
    render(<ProjectCard project={{ ...project, timerCount: 1, timerStatus: "RUNNING", remainingSeconds: 42 }} />);
    expect(screen.getByText("실행 중 · 1분 미만 남음")).toBeInTheDocument();
  });

  it("예약이면 시작 시각을 보인다", () => {
    render(
      <ProjectCard
        project={{ ...project, timerCount: 1, timerStatus: "SCHEDULED", remainingSeconds: 3600, scheduledStartAt: "2026-10-05T08:30:00Z" }}
      />,
    );
    expect(screen.getByText(/^예약됨 · /)).toBeInTheDocument();
  });

  it("만료면 '만료'를 보인다", () => {
    render(<ProjectCard project={{ ...project, timerCount: 1, timerStatus: "EXPIRED", remainingSeconds: 0 }} />);
    expect(screen.getByText("만료")).toBeInTheDocument();
  });

  // C099: '내 프로젝트' 탭에서는 소유자 이름이 반복될 뿐이다
  it("showOwner가 false면 소유자 이름을 숨긴다", () => {
    const { rerender } = render(<ProjectCard project={project} />);
    expect(screen.getByText("삼루먼")).toBeInTheDocument();
    rerender(<ProjectCard project={project} showOwner={false} />);
    expect(screen.queryByText("삼루먼")).not.toBeInTheDocument();
  });

  // C100: 설명이 없으면 모바일에서 빈 줄을 차지하지 않는다
  it("설명이 없으면 빈 설명 줄은 sm 이상에서만 보인다", () => {
    const { container } = render(<ProjectCard project={project} />);
    expect(container.querySelector("p")).toHaveClass("hidden", "sm:block");
  });
});
