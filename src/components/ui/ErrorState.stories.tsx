import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { ErrorState } from "./ErrorState";

const meta = {
  title: "UI/ErrorState",
  component: ErrorState,
  tags: ["autodocs"],
} satisfies Meta<typeof ErrorState>;
export default meta;

type Story = StoryObj<typeof meta>;

/** 불러오기 실패처럼 다시 시도할 수 있는 오류 */
export const LoadFailed: Story = {
  args: { message: "프로젝트를 불러오지 못했습니다.", onRetry: fn() },
};

/** 섹션 본문만 실패했을 때의 한 줄 양식(콘솔의 목표·기록·그래프) */
export const Compact: Story = {
  args: { compact: true, message: "기록을 불러오지 못했습니다.", onRetry: fn() },
};

/** 찾을 수 없음·권한 없음 안내: 중립 아이콘, h1, 돌아갈 링크 하나 */
export const NotFound: Story = {
  args: {
    tone: "neutral",
    title: "프로젝트를 찾을 수 없습니다",
    message: "삭제되었거나 주소가 잘못되었습니다.",
    action: { href: "/projects", label: "프로젝트 목록으로" },
  },
};

export const NoPermission: Story = {
  args: {
    tone: "neutral",
    title: "통계를 볼 수 없습니다",
    message: "프로젝트 소유자만 통계를 볼 수 있습니다.",
    action: { href: "/projects/p1", label: "프로젝트로 돌아가기" },
  },
};
