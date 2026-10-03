import type { Metadata } from "next";

// OBS 브라우저 소스 전용 화면이라 검색 결과에 노출하지 않는다
export const metadata: Metadata = { title: "오버레이", robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
