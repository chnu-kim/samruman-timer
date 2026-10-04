import { cn } from "@/lib/utils";

type BadgeVariant =
  | "running" | "expired" | "scheduled" | "create" | "add" | "subtract" | "expire"
  | "reopen" | "activate" | "delete" | "completed" | "disconnected";

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

// 색은 의미 축 네 개만 쓴다. 같은 뜻이면 어느 화면이든 같은 색이다(C105).
// 라이트·다크 모두 옅은 틴트 위에 진한 글자라, 배지가 카운트다운보다 먼저 눈에 띄지 않는다
const toneStyles = {
  positive: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  negative: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  scheduled: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  neutral: "bg-muted text-muted-foreground",
  // 상태가 아니라 '서버 상태를 모름'이라 색을 칠하지 않고 윤곽만 둔다. 흑백에서도 칠한 상태 배지와 모양으로 구분된다
  unknown: "bg-transparent text-muted-foreground ring-1 ring-inset ring-muted-foreground",
} as const;

// 진행·추가·달성 = 초록, 종료(만료·실패)·차감 = 빨강, 예약 = 보라, 나머지 기록(생성·재시작·활성화·삭제·취소) = 회색.
// 콘솔 상태 '만료'(expired)와 기록 행 '만료'(expire)는 같은 사건이라 같은 색이다
const variantTone: Record<BadgeVariant, keyof typeof toneStyles> = {
  running: "positive",
  add: "positive",
  completed: "positive",
  expired: "negative",
  expire: "negative",
  subtract: "negative",
  scheduled: "scheduled",
  create: "neutral",
  reopen: "neutral",
  activate: "neutral",
  delete: "neutral",
  disconnected: "unknown",
};

export function Badge({ variant, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap text-xs font-semibold px-2 py-0.5 rounded-full",
        toneStyles[variantTone[variant]],
        className,
      )}
    >
      {children}
    </span>
  );
}
