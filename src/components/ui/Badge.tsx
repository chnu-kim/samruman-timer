import { cn } from "@/lib/utils";

interface BadgeProps {
  variant: "running" | "expired" | "scheduled" | "create" | "add" | "subtract" | "expire" | "reopen" | "activate";
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeProps["variant"], string> = {
  running: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  expired: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  scheduled: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  create: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  add: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  subtract: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  expire: "bg-gray-50 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
  reopen: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  activate: "bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
};

export function Badge({ variant, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full",
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
