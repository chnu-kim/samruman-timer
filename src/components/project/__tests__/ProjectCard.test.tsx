// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { ProjectCard } from "../ProjectCard";
import type { ProjectListItem } from "@/types";

const project: ProjectListItem = {
  id: "abc123",
  name: "방송 프로젝트",
  description: null,
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

  // C100·R10: 설명이 없으면 빈 문단을 남기지 않는다(그리드 높이는 위 영역의 sm 최소 높이로 맞춘다)
  it("설명이 없으면 문단을 렌더하지 않는다", () => {
    const { container, rerender } = render(<ProjectCard project={project} />);
    expect(container.querySelector("p")).toBeNull();
    rerender(<ProjectCard project={{ ...project, description: "설명" }} />);
    expect(container.querySelector("p")).toHaveTextContent("설명");
  });

  // R10: 날짜만 '오늘'로 읽히지 않도록 '생성'을 붙이고, 항목 사이 '·'가 링크 설명에도 남는다
  it("메타 줄은 '생성 {날짜}'이고 <time>에 원래 시각을 싣는다", () => {
    const { container } = render(<ProjectCard project={project} />);
    const time = container.querySelector("time");
    expect(time).toHaveAttribute("dateTime", project.createdAt);
    expect(screen.getByRole("link", { name: "방송 프로젝트" })).toHaveAccessibleDescription(/^생성 /);
  });

  it("상태·생성일을 '·'로 구분한다", () => {
    render(
      <ProjectCard project={{ ...project, timerCount: 1, timerStatus: "RUNNING", remainingSeconds: 58 * 60 }} />,
    );
    // jsdom은 요소 경계의 공백을 잘라 '·' 양옆 공백이 빠진다(Chrome 접근성 트리에서는 '실행 중 · 58분 남음 · 생성 …')
    expect(screen.getByRole("link", { name: "방송 프로젝트" })).toHaveAccessibleDescription(
      /^실행 중 · 58분 남음 ?· ?생성 /,
    );
  });

  // R23: transition-all 대신 바뀌는 속성만 전환하고, 동작 줄이기 설정에서는 hover 이동이 없다
  it("전환 속성을 좁히고 reduced motion에서 hover 이동을 끈다", () => {
    const { container } = render(<ProjectCard project={project} />);
    const article = container.querySelector("article")!;
    expect(article.className).not.toContain("transition-all");
    expect(article).toHaveClass("transition-[box-shadow,border-color,translate]", "motion-reduce:hover:translate-none");
  });
});
