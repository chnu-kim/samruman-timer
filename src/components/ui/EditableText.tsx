"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { PencilIcon, CheckIcon, XIcon } from "@/components/ui/Icons";

// 좁은 화면에서 한국어가 음절 단위로 끊기지 않게 어절 단위로 줄바꿈하고, 공백 없는 긴 문자열만 강제로 끊는다
const TEXT_WRAP = "break-keep [overflow-wrap:anywhere]";

interface EditableTextProps {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  editable?: boolean;
  as?: "h1" | "p";
  className?: string;
  placeholder?: string;
}

export function EditableText({
  value,
  onSave,
  editable = false,
  as: Tag = "p",
  className,
  placeholder,
}: EditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  async function handleSave() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setDraft(value);
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch {
      setDraft(value);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setDraft(value);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  }

  if (!editable) {
    return <Tag className={cn(className, TEXT_WRAP)}>{value}</Tag>;
  }

  if (editing) {
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          disabled={saving}
          placeholder={placeholder}
          className={cn(
            "min-w-0 w-full flex-1 rounded-md border border-border-input bg-background px-2 py-1 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
            Tag === "h1" && "text-2xl font-bold",
            Tag === "p" && "text-base",
            className,
          )}
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleSave}
          disabled={saving}
          className="rounded p-1 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="저장"
        >
          <CheckIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleCancel}
          disabled={saving}
          className="rounded p-1 text-muted-foreground hover:bg-foreground/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="취소"
        >
          <XIcon className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-1.5">
      {/* heading 의미를 지키려고 Tag에는 role을 주지 않는다. 클릭은 마우스 편의이고, 키보드는 옆 편집 버튼을 쓴다 */}
      <Tag
        className={cn(className, TEXT_WRAP, "cursor-pointer")}
        onClick={() => setEditing(true)}
      >
        {value || <span className="text-muted-foreground">{placeholder}</span>}
      </Tag>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mt-1 rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:bg-foreground/10 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={Tag === "h1" ? "제목 편집" : "설명 편집"}
      >
        <PencilIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
