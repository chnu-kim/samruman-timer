"use client";

import { useEffect, useId, useRef } from "react";

interface FormDialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function FormDialog({ open, title, onClose, children }: FormDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      prevFocusRef.current = document.activeElement as HTMLElement;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      prevFocusRef.current?.focus();
    }
  }, [open]);

  // Escape 키 처리: native dialog cancel 이벤트를 onClose로 연결
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    function handleCancel(e: Event) {
      e.preventDefault();
      onClose();
    }
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      aria-modal="true"
      aria-labelledby={titleId}
      className="m-auto rounded-xl border border-border bg-background p-0 shadow-dialog backdrop:bg-black/50 max-w-md w-full max-h-[85dvh] overflow-hidden"
      style={{ animation: open ? "fade-in 0.15s ease-out" : undefined }}
    >
      <div className="flex items-center justify-between gap-4 p-6 pb-0">
        <h3 id={titleId} className="text-lg font-bold text-foreground">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="p-6 pt-4 overflow-y-auto max-h-[calc(85dvh-4rem)]">{children}</div>
    </dialog>
  );
}
