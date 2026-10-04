import { cn } from "@/lib/utils";

interface BadgeProps {
  variant: "running" | "expired" | "scheduled" | "create" | "add" | "subtract" | "expire" | "reopen" | "activate" | "delete" | "completed" | "disconnected";
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeProps["variant"], string> = {
  running: "bg-green-700 text-white dark:bg-green-900/30 dark:text-green-400",
  expired: "bg-red-600 text-white dark:bg-red-900/30 dark:text-red-400",
  scheduled: "bg-purple-600 text-white dark:bg-purple-900/30 dark:text-purple-400",
  create: "bg-blue-600 text-white dark:bg-blue-900/30 dark:text-blue-400",
  add: "bg-green-700 text-white dark:bg-green-900/30 dark:text-green-400",
  subtract: "bg-red-600 text-white dark:bg-red-900/30 dark:text-red-400",
  expire: "bg-gray-500 text-white dark:bg-gray-900/30 dark:text-gray-400",
  reopen: "bg-amber-700 text-white dark:bg-amber-900/30 dark:text-amber-400",
  activate: "bg-cyan-700 text-white dark:bg-cyan-900/30 dark:text-cyan-400",
  delete: "bg-gray-700 text-white dark:bg-gray-800/30 dark:text-gray-300",
  completed: "bg-blue-600 text-white dark:bg-blue-900/30 dark:text-blue-400",
  // 상태가 아니라 '서버 상태를 모름'이라 색을 칠하지 않고 윤곽만 둔다. 흑백에서도 칠한 상태 배지와 모양으로 구분된다
  disconnected: "bg-transparent text-muted-foreground ring-1 ring-inset ring-muted-foreground",
};

export function Badge({ variant, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap text-xs font-semibold px-2 py-0.5 rounded-full",
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
