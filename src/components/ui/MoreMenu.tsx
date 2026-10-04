"use client";

import { Fragment, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { MoreHorizontalIcon } from "@/components/ui/Icons";

export interface MoreMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface MoreMenuProps {
  /** 트리거 버튼의 접근 가능한 이름 */
  label: string;
  items: MoreMenuItem[];
  className?: string;
}

/**
 * 자주 쓰지 않는 행동(링크 복사, 삭제)을 접어 두는 더보기 버튼.
 * role="menu"는 화살표 키 탐색까지 약속하므로 쓰지 않고, aria-expanded로 여닫는 disclosure 패턴을 쓴다.
 * 패널 안은 평범한 버튼이라 Tab으로 이동한다.
 */
export function MoreMenu({ label, items, className }: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // 파괴적 항목 묶음 앞(일반 항목 다음 첫 danger)에 구분선을 하나 둔다
  const firstDangerIndex = items.findIndex((item) => item.danger);

  return (
    <div
      ref={rootRef}
      className={cn("relative", className)}
      // Tab으로 메뉴 밖에 포커스가 가면 닫는다. relatedTarget이 없는 blur(포커스가 body로 빠짐, Safari에서 버튼 클릭 등)는
      // 다음 포커스 위치를 알 수 없으므로 여기서 닫지 않고 pointerdown·Escape 처리에 맡긴다
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        if (open && next && !rootRef.current?.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
      >
        <MoreHorizontalIcon className="w-5 h-5" />
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute right-0 top-full z-30 mt-1 min-w-40 whitespace-nowrap rounded-lg border border-border bg-background p-1 shadow-dialog"
        >
          {items.map((item, index) => (
            <Fragment key={item.label}>
              {index > 0 && index === firstDangerIndex && (
                <div role="separator" className="my-1 h-px bg-border" />
              )}
              <button
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  // 다이얼로그를 여는 항목이 많아 포커스를 트리거로 돌려 두면 다이얼로그가 닫힌 뒤 제자리로 돌아온다
                  triggerRef.current?.focus();
                  item.onSelect();
                }}
                className={cn(
                  "flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm transition-colors disabled:opacity-50",
                  item.danger
                    ? "text-red-600 hover:bg-red-500/10 dark:text-red-400"
                    : "text-foreground hover:bg-foreground/10",
                )}
              >
                {item.label}
              </button>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
