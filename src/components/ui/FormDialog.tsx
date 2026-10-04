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
      // 닫힌 dialog 안에 미리 렌더된 자식의 autoFocus는 showModal 전에 소모되어, 브라우저가 첫 포커스 대상인 '닫기'로 보낸다.
      // 그래서 첫 입력칸은 자식이 data-autofocus로 지정하고 여기서 showModal 뒤에 옮긴다
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
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
      className="m-auto rounded-xl border border-border bg-background text-foreground p-0 shadow-dialog backdrop:bg-black/50 w-full max-w-[min(28rem,calc(100%-2rem))] max-h-[85dvh] overflow-hidden"
      style={{ animation: open ? "fade-in 0.15s ease-out" : undefined }}
    >
      <div className="flex items-center justify-between gap-4 p-6 pb-0">
        <h2 id={titleId} className="text-lg font-bold text-foreground">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="shrink-0 -my-1.5 -mr-1.5 rounded-lg p-1.5 min-h-11 min-w-11 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors"
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
