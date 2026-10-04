// @vitest-environment jsdom
// W29 이월: 콘솔 골격은 실제 화면의 줄·칸을 베낀다. jsdom은 레이아웃·CSS 변형을 계산하지 못하므로
// 실제 높이는 미리보기 빌드에서 Playwright로 재고, 여기서는 그 결과를 만드는 구조를 고정한다
import { render } from "@testing-library/react";
import { ConsoleSkeleton, ProjectDetailSkeleton } from "../Skeleton";

describe("콘솔 골격", () => {
  it("로그인 확인 전 골격은 소유자 전용 칸을 로그아웃 힌트에서 숨기고, 시청자 줄(닉네임·링크 복사)은 그때만 보인다", () => {
    const { container } = render(<ProjectDetailSkeleton />);
    // 시간 카드 | 목표 행, 헤더의 글자 버튼 셋
    expect(container.querySelectorAll(".signed-out\\:hidden")).toHaveLength(2);
    // 소유자 닉네임 줄, 링크 복사 아이콘
    expect(container.querySelectorAll(".hidden.signed-out\\:flex")).toHaveLength(2);
  });

  it("소유자인지 아는 골격(콘솔이 다시 부를 때)은 CSS 변형 없이 그 모양만 그린다", () => {
    const owner = render(<ConsoleSkeleton shape="owner" busy />).container;
    expect(owner.querySelector(".rounded-card.h-70")).toBeInTheDocument();
    expect(owner.querySelector("[class*='signed-out']")).not.toBeInTheDocument();
    expect(owner.firstElementChild).toHaveAttribute("aria-busy", "true");

    const viewer = render(<ConsoleSkeleton shape="viewer" />).container;
    expect(viewer.querySelector(".h-70")).not.toBeInTheDocument();
    expect(viewer.firstElementChild).not.toHaveAttribute("aria-busy");
  });

  it("섹션 제목 골격은 margin 없이 24px 줄 안에 두고(붕괴로 20px이 되지 않게), 최근 기록은 5행을 채운다", () => {
    const { container } = render(<ConsoleSkeleton shape="owner" />);
    expect(container.querySelector(".my-1")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".flex.h-6.items-center").length).toBeGreaterThanOrEqual(3);
    expect(container.querySelectorAll(".h-\\[3\\.8125rem\\]")).toHaveLength(5);
  });

  it("목표 골격에는 '새 목표' 버튼 자리와 탭 줄이 있다", () => {
    const { container } = render(<ConsoleSkeleton shape="owner" />);
    expect(container.querySelector(".w-26.h-10")).toBeInTheDocument();
    expect(container.querySelector(".h-10.border-b")).toBeInTheDocument();
  });

  it("모바일 카운트다운 골격은 숫자 크기(clamp)와 같은 높이다", () => {
    const { container } = render(<ConsoleSkeleton shape="owner" />);
    expect(container.querySelector(".h-\\[clamp\\(3rem\\,17vw\\,3\\.75rem\\)\\]")).toBeInTheDocument();
  });
});
