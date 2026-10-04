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
  const editButtonRef = useRef<HTMLButtonElement>(null);
  // Enter·Esc·저장/취소 버튼으로 끝냈을 때만 편집 버튼으로 포커스를 돌린다.
  // 다른 곳을 클릭하거나 Tab으로 나가서(blur) 저장된 경우는 사용자가 옮긴 포커스를 빼앗지 않는다
  const restoreFocusRef = useRef(false);
  // 저장 진행 중 여부. Enter로 저장하면 input이 disabled가 되며 blur가 일어나 handleSave를 또 부르는데,
  // saving 상태는 다음 렌더에야 보이므로 즉시 바뀌는 ref로 막아 요청이 두 번 나가지 않게 한다
  const savingRef = useRef(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (restoreFocusRef.current) {
      restoreFocusRef.current = false;
      editButtonRef.current?.focus();
    }
  }, [editing]);

  async function handleSave() {
    if (savingRef.current) return;
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setDraft(value);
      setEditing(false);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch {
      setDraft(value);
      setEditing(false);
    } finally {
      savingRef.current = false;
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
      restoreFocusRef.current = true;
      handleSave();
    } else if (e.key === "Escape") {
      restoreFocusRef.current = true;
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
            "min-w-0 w-full flex-1 rounded-control border border-border-input bg-background px-2 py-1 text-foreground",
            Tag === "h1" && "text-2xl font-bold",
            Tag === "p" && "text-base",
            className,
          )}
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            restoreFocusRef.current = true;
            handleSave();
          }}
          disabled={saving}
          className="inline-flex items-center justify-center pointer-coarse:min-h-11 pointer-coarse:min-w-11 rounded-control p-1 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
          aria-label="저장"
        >
          <CheckIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            restoreFocusRef.current = true;
            handleCancel();
          }}
          disabled={saving}
          className="inline-flex items-center justify-center pointer-coarse:min-h-11 pointer-coarse:min-w-11 rounded-control p-1 text-muted-foreground hover:bg-foreground/10 transition-colors"
          aria-label="취소"
        >
          <XIcon className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-1">
      {/* heading 의미를 지키려고 Tag에는 role을 주지 않는다. 클릭은 마우스 편의이고, 키보드는 옆 편집 버튼을 쓴다 */}
      <Tag
        className={cn(className, TEXT_WRAP, "cursor-pointer")}
        onClick={() => setEditing(true)}
      >
        {value || <span className="text-muted-foreground">{placeholder}</span>}
      </Tag>
      {/* 데스크톱 히트 영역은 30px(p-2, 24px 기준 통과). 줄 높이가 그대로이도록 -mb-1로 넓어진 만큼을 되돌린다.
          왼쪽은 되돌리지 않고 간격(gap-1) 4px를 둔다. hover 배경 상자가 글자에 붙어 보이지 않게 하려는 것이고, 그만큼 버튼 자리가 2px 넓다.
          터치 기기에서는 ::before로 44px까지 넓힌다(30 + 7×2). 제목 전체를 누르는 영역으로 만들지는 않는다.
          제목 연필 바로 아래에 설명 연필이 붙어 있어 두 44px 영역이 겹친다. 제목 연필을 위에(z-10) 두고, 설명 연필은 위쪽으로 넓히지 않고 아래로만 넓혀(30 + 21 - 겹침) 둘 다 44px 이상을 확보한다 */}
      <button
        ref={editButtonRef}
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          "relative pointer-coarse:before:absolute -mb-1 rounded-control p-2 text-muted-foreground opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:bg-foreground/10 transition-[opacity,background-color]",
          Tag === "h1"
            ? "z-10 pointer-coarse:before:-inset-[7px]"
            : "pointer-coarse:before:-inset-x-[7px] pointer-coarse:before:top-0 pointer-coarse:before:-bottom-[21px]",
        )}
        aria-label={Tag === "h1" ? "제목 편집" : "설명 편집"}
      >
        <PencilIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
