import { ErrorState } from "@/components/ui/ErrorState";

// 탭 제목('찾을 수 없음')은 [id]/layout.tsx의 기본 제목이 맡는다(notFound() 응답에는 이 폴더의 not-found·page metadata가 아니라 layout 것이 나간다)

// 없는 타이머 주소(/timers/[id])의 404. page.tsx가 notFound()로 이 화면을 그려 HTTP 404와 noindex로 응답한다
// (200으로 그리면 검색엔진이 빈 안내 화면을 정상 페이지로 색인하는 soft 404가 된다)
export default function TimerNotFound() {
  return (
    <ErrorState
      tone="neutral"
      title="타이머를 찾을 수 없습니다"
      message="삭제되었거나 주소가 잘못되었습니다."
      action={{ href: "/projects", label: "프로젝트 목록으로" }}
    />
  );
}
