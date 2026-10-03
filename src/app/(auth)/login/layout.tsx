import type { Metadata } from "next";

// ?next=·?error= 가 붙은 주소를 하나로 모은다
export const metadata: Metadata = { title: "로그인", alternates: { canonical: "/login" } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
