import type { Metadata } from "next";
import { TITLE_TEMPLATE } from "@/lib/site";

// 이 폴더에서 자기 제목이 없는 것은 주소 이동 페이지(page.tsx)뿐이고, 찾으면 바로 이동하므로 이 기본 제목은 notFound() 404 응답에서만 보인다.
// 하위 not-found·page의 metadata는 그 응답에 쓰이지 않아 여기 둔다. 오버레이·통계는 자기 layout·page에서 제목을 정한다
export const metadata: Metadata = { title: { default: "찾을 수 없음", template: TITLE_TEMPLATE } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
