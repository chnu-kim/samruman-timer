"use client";

import { useEffect } from "react";

/**
 * 브라우저 탭 제목을 바꾸고, 언마운트되거나 제목이 바뀌면 이전 제목으로 되돌린다.
 * 루트 레이아웃의 metadata는 클라이언트 이동 때 다시 적용되지 않으므로 복원하지 않으면
 * 목록으로 돌아가도 이전 타이머 이름이 탭에 남는다. title이 null이면 바꾸지 않는다.
 */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
