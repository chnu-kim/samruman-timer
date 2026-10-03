import type { Metadata } from "next";

// 로그인한 소유자만 내용을 볼 수 있어 색인할 것이 없다
export const metadata: Metadata = { title: "타이머 통계", robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
