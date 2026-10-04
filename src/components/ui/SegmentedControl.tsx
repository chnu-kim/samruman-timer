"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  // 항목별로 붙일 속성(예: aria-keyshortcuts). 역할·선택 상태·tabIndex는 컴포넌트가 정한다
  attrs?: React.HTMLAttributes<HTMLSpanElement>;
}

interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** 그룹 이름을 가진 요소의 id. 보이는 라벨이 없으면 ariaLabel을 쓴다 */
  ariaLabelledBy?: string;
  ariaLabel?: string;
  className?: string;
}

/**
 * 여럿 중 하나를 고르는 단일 선택 컨트롤. 트랙 위에서 선택 칸(foreground 채움)이 미끄러진다.
 * 화면을 나누는 탭(밑줄)과 즉시 적용 버튼(프리셋)에는 쓰지 않는다.
 * 키보드는 WAI-ARIA radio group 패턴: 그룹 안에서 Tab 정지점은 선택 항목 하나, 화살표로 이동하면서 바로 선택한다.
 * 항목은 button이 아니라 span이라 <form> 안에서 Enter·Space가 제출로 새지 않는다
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabelledBy,
  ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  const itemRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const count = options.length;

  function handleKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onChange(options[index].value);
      return;
    }
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const next = (index + step + count) % count;
    onChange(options[next].value);
    itemRefs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby={ariaLabelledBy}
      aria-label={ariaLabel}
      className={cn("relative grid rounded-xl border border-border bg-muted p-1", className)}
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    >
      {/* 선택 칸. 트랙 안쪽 폭(좌우 padding 4px씩 제외)을 항목 수로 나눈 폭이고, 자기 폭만큼씩 옮긴다 */}
      <div
        data-segment-thumb=""
        aria-hidden="true"
        className="absolute top-1 bottom-1 left-1 rounded-lg bg-foreground shadow-sm transition-transform duration-200 ease-out pointer-events-none motion-reduce:transition-none"
        style={{
          width: `calc((100% - 8px) / ${count})`,
          transform: `translateX(${selectedIndex * 100}%)`,
        }}
      />
      {options.map((option, i) => {
        const selected = i === selectedIndex;
        return (
          <span
            key={option.value}
            {...option.attrs}
            ref={(el) => { itemRefs.current[i] = el; }}
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={cn(
              "relative z-10 flex items-center justify-center rounded-lg px-2 py-2.5 text-center text-sm font-medium transition-colors duration-200 select-none cursor-pointer",
              selected ? "text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </span>
        );
      })}
    </div>
  );
}
