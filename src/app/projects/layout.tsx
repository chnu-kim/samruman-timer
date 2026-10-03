import type { Metadata } from "next";
import { TITLE_TEMPLATE } from "@/lib/site";

// canonical은 검색·정렬 쿼리가 붙은 주소를 하나로 모은다. 하위 상세 페이지는 자기 주소로 덮어쓴다
export const metadata: Metadata = {
  title: { default: "프로젝트", template: TITLE_TEMPLATE },
  alternates: { canonical: "/projects" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
