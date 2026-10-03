import type { Metadata } from "next";

// OAuth 콜백 중간 화면이라 검색 결과에 노출하지 않는다
export const metadata: Metadata = { title: "로그인 중", robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
