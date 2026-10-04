import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ErrorState } from "@/components/ui/ErrorState";
import { getDB } from "@/lib/db";

// 못 찾았을 때만 이 화면이 그려진다(찾으면 아래에서 바로 이동). 제목은 layout 템플릿이 '| 삼루먼타이머'를 붙인다
export const metadata: Metadata = { title: "찾을 수 없음" };

// 타이머 조작은 프로젝트 화면(/projects/[id])으로 합쳤다. 예전에 공유한 타이머 주소가 계속 열리도록
// 서버에서 상위 프로젝트로 보낸다. 서버 redirect()라 골격·클라이언트 이동 없이 최종 화면의 제목·상태로 바로 도착한다
// (Next redirect()는 307 같은 임시 3xx를 낸다).
// OBS 오버레이(/timers/[id]/overlay)와 통계(/timers/[id]/stats)는 그대로다.
// DB 오류는 잡지 않고 app/error.tsx의 '다시 시도'에 맡긴다
export default async function TimerRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDB();
  const row = await db
    .prepare("SELECT project_id FROM timers WHERE id = ? AND status != 'DELETED'")
    .bind(id)
    .first<{ project_id: string }>();

  if (row) redirect(`/projects/${row.project_id}`);

  return (
    <ErrorState
      tone="neutral"
      title="타이머를 찾을 수 없습니다"
      message="삭제되었거나 주소가 잘못되었습니다."
      action={{ href: "/projects", label: "프로젝트 목록으로" }}
    />
  );
}
