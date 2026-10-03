import type { Metadata } from "next";

// 상위 /projects layout의 canonical을 물려받으면 상세가 목록의 중복으로 취급되므로 자기 주소로 덮어쓴다
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: "프로젝트 상세", alternates: { canonical: `/projects/${id}` } };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
