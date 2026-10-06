import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { Button } from "./Button";
import { AlertCircleIcon, FolderIcon, PlusIcon, TimerIcon } from "./Icons";
import { StatePanel } from "./StatePanel";

const meta = {
  title: "UI/StatePanel",
  component: StatePanel,
  tags: ["autodocs"],
  args: { icon: <FolderIcon /> },
} satisfies Meta<typeof StatePanel>;
export default meta;

type Story = StoryObj<typeof meta>;

/** 빈 목록: 문구 한 줄과 첫 행동 하나 */
export const EmptyList: Story = {
  args: {
    icon: <FolderIcon />,
    message: "아직 프로젝트가 없습니다.",
    action: (
      <Button onClick={fn()}>
        <PlusIcon className="w-4 h-4 mr-1" />
        첫 프로젝트 만들기
      </Button>
    ),
  },
};

/** 행동 없이 지금 상태만 알리는 빈 상태(시청자) */
export const MessageOnly: Story = {
  args: { icon: <TimerIcon />, message: "아직 타이머가 없습니다." },
};

/** 화면 전체가 안내일 때: h1 제목 + 문구 */
export const WithTitle: Story = {
  args: { icon: <AlertCircleIcon />, title: "페이지를 찾을 수 없습니다", message: "삭제되었거나 주소가 잘못되었습니다." },
};

/** 다시 시도할 수 있는 오류: 빨간 원 */
export const ErrorTone: Story = {
  args: {
    icon: <AlertCircleIcon />,
    tone: "error",
    message: "프로젝트를 불러오지 못했습니다.",
    action: <Button variant="secondary" onClick={fn()}>다시 시도</Button>,
  },
};
