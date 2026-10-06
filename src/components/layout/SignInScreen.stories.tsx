import type { Meta, StoryObj } from "@storybook/react";
import { SignInScreen } from "./SignInScreen";

const meta = {
  title: "Layout/SignInScreen",
  component: SignInScreen,
  tags: ["autodocs"],
} satisfies Meta<typeof SignInScreen>;
export default meta;

type Story = StoryObj<typeof meta>;

/** /login과 로그아웃 /projects의 진입 화면 */
export const Default: Story = {};

/** 로그인 후 돌아갈 곳이 있을 때(버튼이 next를 들고 간다) */
export const WithNext: Story = {
  args: { next: "/projects" },
};

/** 세션 만료로 보내졌을 때의 한 줄 안내 */
export const SessionExpired: Story = {
  args: {
    next: "/projects/abc",
    notice: <p role="status" className="text-center text-sm text-muted-foreground">세션이 만료되어 다시 로그인합니다.</p>,
  },
};
