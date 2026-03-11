"use client";

import { Button } from "./Button";
import { ChevronLeftIcon, ChevronRightIcon } from "./Icons";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  return (
    <div className="flex items-center justify-center gap-4">
      <Button
        variant="ghost"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="이전 페이지"
      >
        <ChevronLeftIcon className="w-4 h-4" />
        <span className="ml-1">이전</span>
      </Button>
      <span className="text-sm text-muted-foreground">
        {page} / {totalPages}
      </span>
      <Button
        variant="ghost"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label="다음 페이지"
      >
        <span className="mr-1">다음</span>
        <ChevronRightIcon className="w-4 h-4" />
      </Button>
    </div>
  );
}
