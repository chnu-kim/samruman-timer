import type { Metadata } from "next";
import { ErrorState } from "@/components/ui/ErrorState";

// 탭 제목은 다른 못 찾음 화면(프로젝트·타이머)과 같은 '찾을 수 없음'이다
export const metadata: Metadata = {
  title: "찾을 수 없음",
};

// 없는 경로의 404. 루트 레이아웃 안에서 그려지므로 헤더·푸터·앱 배경이 그대로 있고,
// 본문은 다른 '찾을 수 없음' 화면과 같은 ErrorState 틀에 돌아갈 곳 하나만 둔다
export default function NotFound() {
  return (
    <ErrorState
      tone="neutral"
      title="페이지를 찾을 수 없습니다"
      message="삭제되었거나 주소가 잘못되었습니다."
      action={{ href: "/projects", label: "프로젝트 목록으로" }}
    />
  );
}
