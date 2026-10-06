import { cloneElement } from "react";
import { cn } from "@/lib/utils";

interface StatePanelProps {
  /** 원 안에 둘 아이콘(`ui/Icons`). 크기·색은 여기서 정하므로 className 없이 넘긴다 */
  icon: React.ReactElement<{ className?: string }>;
  /**
   * neutral: 빈 상태·찾을 수 없음처럼 정상적인 안내(중립 원).
   * error: 실패해서 다시 시도할 수 있는 오류(빨간 원).
   */
  tone?: "neutral" | "error";
  /** 화면의 h1. 안내가 그 화면의 전부일 때(404·권한 없음) 넘긴다 */
  title?: string;
  message?: React.ReactNode;
  /** 다음 행동(버튼·링크) 하나 */
  action?: React.ReactNode;
  className?: string;
}

/**
 * 아이콘 원 + 제목·문구 + 행동 하나로 된 가운데 상태 블록. 빈 목록, 찾을 수 없음, 불러오기 실패가
 * 같은 규격(원 56px·아이콘 28px, 위아래 48px, 원→글 16px, 제목→문구 4px, 글→행동 16px)으로 보이게 하는 유일한 틀이다.
 * 가운데 정렬 글은 text-balance로 줄 길이를 고르게 나눈다. 오류·안내는 `ErrorState`가 이것을 감싸 쓴다
 */
export function StatePanel({ icon, tone = "neutral", title, message, action, className }: StatePanelProps) {
  const error = tone === "error";
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
      <div
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-full",
          error ? "bg-red-100 dark:bg-red-950/30" : "bg-foreground/5",
        )}
      >
        {cloneElement(icon, { className: cn("w-7 h-7", error ? "text-red-500" : "text-muted-foreground") })}
      </div>
      {title && <h1 className="mt-4 text-lg font-semibold text-balance text-foreground">{title}</h1>}
      {message && <p className={cn(title ? "mt-1" : "mt-4", "text-balance text-muted-foreground")}>{message}</p>}
      {/* 버튼을 flex 항목으로 두어 글줄 높이(strut)가 끼지 않게 한다. 버튼 위 간격은 정확히 16px이다 */}
      {action && <div className="mt-4 flex flex-col items-center gap-4">{action}</div>}
    </div>
  );
}
