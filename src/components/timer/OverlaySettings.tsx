"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { CopyIcon, XIcon, CheckIcon } from "@/components/ui/Icons";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

interface OverlaySettingsProps {
  timerId: string;
  onClose: () => void;
}

type Position = "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface OverlayConfig {
  fontSize: number;
  color: string;
  bg: string;
  showTitle: boolean;
  shadow: boolean;
  position: Position;
}

const PRESETS: { name: string; config: Partial<OverlayConfig> }[] = [
  {
    name: "기본 흰색",
    config: { color: "#ffffff", bg: "transparent", shadow: true, fontSize: 72 },
  },
  {
    name: "게이밍 네온",
    config: { color: "#00ff88", bg: "transparent", shadow: true, fontSize: 96 },
  },
  {
    name: "미니멀",
    config: { color: "#cccccc", bg: "transparent", shadow: false, fontSize: 48 },
  },
];

const POSITION_LABELS: Record<Position, string> = {
  center: "중앙",
  "top-left": "좌상단",
  "top-right": "우상단",
  "bottom-left": "좌하단",
  "bottom-right": "우하단",
};

const POSITIONS: Position[] = ["top-left", "top-right", "center", "bottom-left", "bottom-right"];

export function OverlaySettings({ timerId, onClose }: OverlaySettingsProps) {
  const { toast } = useToast();
  const modalRef = useRef<HTMLDivElement>(null);
  const [savedConfig, setSavedConfig] = useState<OverlayConfig | null>(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<OverlayConfig>({
    fontSize: 72,
    color: "#ffffff",
    bg: "transparent",
    showTitle: false,
    shadow: true,
    position: "center",
  });
  const [iframeSrc, setIframeSrc] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/timers/${timerId}/overlay-settings`);
        const json = await res.json() as { data?: OverlayConfig };
        if (json.data) {
          setConfig(json.data);
          setSavedConfig(json.data);
        } else {
          setSavedConfig({
            fontSize: 72, color: "#ffffff", bg: "transparent",
            showTitle: false, shadow: true, position: "center",
          });
        }
      } catch {
        // ignore — use defaults
        setSavedConfig({
          fontSize: 72, color: "#ffffff", bg: "transparent",
          showTitle: false, shadow: true, position: "center",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [timerId]);

  const isDirty = useMemo(
    () => savedConfig !== null && JSON.stringify(config) !== JSON.stringify(savedConfig),
    [config, savedConfig],
  );

  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowUnsavedDialog(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  // P0: ESC key handler + focus trap
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
        return;
      }

      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  // P0: Auto-focus first focusable element on mount
  useEffect(() => {
    if (modalRef.current) {
      const first = modalRef.current.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      first?.focus();
    }
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/timers/${timerId}/overlay-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setSavedConfig({ ...config });
        toast("설정이 저장되었습니다", "success");
      } else {
        const json = await res.json() as { error?: { message?: string } };
        toast(json.error?.message ?? "저장에 실패했습니다", "error");
      }
    } catch {
      toast("저장에 실패했습니다", "error");
    } finally {
      setSaving(false);
    }
  }, [timerId, config, toast]);

  const overlayUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (config.fontSize !== 72) params.set("fontSize", String(config.fontSize));
    if (config.color !== "#ffffff") params.set("color", config.color);
    if (config.bg !== "transparent") params.set("bg", config.bg);
    if (config.showTitle) params.set("showTitle", "true");
    if (!config.shadow) params.set("shadow", "false");
    if (config.position !== "center") params.set("position", config.position);

    const base = `${typeof window !== "undefined" ? window.location.origin : ""}/timers/${timerId}/overlay`;
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }, [timerId, config]);

  // P1 #10: Debounced iframe src to avoid reload on every config change
  useEffect(() => {
    const timeout = setTimeout(() => {
      setIframeSrc(overlayUrl);
    }, 500);
    return () => clearTimeout(timeout);
  }, [overlayUrl]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(overlayUrl);
    toast("OBS 오버레이 URL이 복사되었습니다", "success");
  }, [overlayUrl, toast]);

  const applyPreset = useCallback((preset: (typeof PRESETS)[number]) => {
    setConfig((prev) => ({ ...prev, ...preset.config }));
  }, []);

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="OBS 오버레이 설정"
    >
      {/* P2 #13: fade-in animation */}
      <div
        ref={modalRef}
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg mx-4 animate-[fade-in_0.15s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 pb-0">
          <h2 className="text-lg font-bold">OBS 오버레이 설정</h2>
          <button
            onClick={handleClose}
            aria-label="닫기"
            className="rounded-lg p-1.5 min-h-11 min-w-11 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            설정을 불러오는 중...
          </div>
        ) : <>
        {/* 스크롤 가능 콘텐츠 */}
        <div className="flex-1 overflow-y-auto p-6 pt-5">
        {/* 프리셋 테마 */}
        <div className="mb-5">
          <label className="text-sm font-medium text-foreground">프리셋 테마</label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => applyPreset(preset)}
                className="rounded-lg border border-border px-3 py-2 min-h-11 text-sm font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        {/* 폰트 크기 슬라이더 */}
        <div className="mb-5">
          <label className="text-sm font-medium text-foreground">
            폰트 크기: {config.fontSize}px
          </label>
          <input
            type="range"
            min={24}
            max={200}
            value={config.fontSize}
            onChange={(e) => setConfig((prev) => ({ ...prev, fontSize: Number(e.target.value) }))}
            className="mt-1.5 w-full accent-accent"
            aria-label="폰트 크기"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
            <span>24px</span>
            <span>200px</span>
          </div>
        </div>

        {/* 색상 선택 — P1 #9: responsive grid */}
        <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-foreground">텍스트 색상</label>
            <div className="mt-1.5 flex items-center gap-2">
              {/* P1 #6: 44px color input */}
              <input
                type="color"
                value={config.color}
                onChange={(e) => setConfig((prev) => ({ ...prev, color: e.target.value }))}
                className="w-11 h-11 rounded border border-border cursor-pointer"
                aria-label="텍스트 색상"
              />
              <Input
                value={config.color}
                onChange={(e) => setConfig((prev) => ({ ...prev, color: e.target.value }))}
                className="flex-1 font-mono text-sm"
                maxLength={7}
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">배경색</label>
            <div className="mt-1.5 flex items-center gap-2">
              {/* P1 #6: 44px color input */}
              <input
                type="color"
                value={config.bg === "transparent" ? "#000000" : config.bg}
                onChange={(e) => setConfig((prev) => ({ ...prev, bg: e.target.value }))}
                className="w-11 h-11 rounded border border-border cursor-pointer"
                aria-label="배경색"
              />
              <div className="flex-1 flex items-center gap-1">
                <Input
                  value={config.bg}
                  onChange={(e) => setConfig((prev) => ({ ...prev, bg: e.target.value }))}
                  className="flex-1 font-mono text-sm"
                  placeholder="transparent"
                />
              </div>
            </div>
            {/* P1 #7: 44px touch target for reset button */}
            <button
              type="button"
              onClick={() => setConfig((prev) => ({ ...prev, bg: "transparent" }))}
              className="mt-1 min-h-11 px-1 inline-flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              투명으로 초기화
            </button>
          </div>
        </div>

        {/* 위치 선택 비주얼 그리드 — P1 #5: larger grid */}
        <div className="mb-5">
          <label className="text-sm font-medium text-foreground">위치</label>
          <div className="mt-1.5 grid grid-cols-3 grid-rows-3 gap-1 w-56 h-40 border border-border rounded-lg p-1 bg-muted">
            {/* Row 1 */}
            <button
              type="button"
              onClick={() => setConfig((prev) => ({ ...prev, position: "top-left" }))}
              className={cn(
                "rounded text-xs transition-colors min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                config.position === "top-left" ? "bg-accent text-accent-foreground" : "hover:bg-foreground/10",
              )}
              aria-label="좌상단"
            />
            <div className="min-h-[40px]" />
            <button
              type="button"
              onClick={() => setConfig((prev) => ({ ...prev, position: "top-right" }))}
              className={cn(
                "rounded text-xs transition-colors min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                config.position === "top-right" ? "bg-accent text-accent-foreground" : "hover:bg-foreground/10",
              )}
              aria-label="우상단"
            />
            {/* Row 2 */}
            <div className="min-h-[40px]" />
            <button
              type="button"
              onClick={() => setConfig((prev) => ({ ...prev, position: "center" }))}
              className={cn(
                "rounded text-xs transition-colors min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                config.position === "center" ? "bg-accent text-accent-foreground" : "hover:bg-foreground/10",
              )}
              aria-label="중앙"
            />
            <div className="min-h-[40px]" />
            {/* Row 3 */}
            <button
              type="button"
              onClick={() => setConfig((prev) => ({ ...prev, position: "bottom-left" }))}
              className={cn(
                "rounded text-xs transition-colors min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                config.position === "bottom-left" ? "bg-accent text-accent-foreground" : "hover:bg-foreground/10",
              )}
              aria-label="좌하단"
            />
            <div className="min-h-[40px]" />
            <button
              type="button"
              onClick={() => setConfig((prev) => ({ ...prev, position: "bottom-right" }))}
              className={cn(
                "rounded text-xs transition-colors min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                config.position === "bottom-right" ? "bg-accent text-accent-foreground" : "hover:bg-foreground/10",
              )}
              aria-label="우하단"
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            현재: {POSITION_LABELS[config.position]}
          </p>
        </div>

        {/* 토글 옵션 */}
        <div className="mb-5 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.showTitle}
              onChange={(e) => setConfig((prev) => ({ ...prev, showTitle: e.target.checked }))}
              className="w-4 h-4 accent-accent rounded"
            />
            <span className="text-sm">타이틀 표시</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.shadow}
              onChange={(e) => setConfig((prev) => ({ ...prev, shadow: e.target.checked }))}
              className="w-4 h-4 accent-accent rounded"
            />
            <span className="text-sm">텍스트 그림자</span>
          </label>
        </div>

        {/* 실시간 미리보기 — P1 #10: debounced iframe, P2 #11: CSS var background */}
        <div className="mb-5">
          <label className="text-sm font-medium text-foreground">미리보기</label>
          <div
            className="mt-1.5 rounded-lg border border-border overflow-hidden"
            style={{ height: 200 }}
          >
            {iframeSrc && (
              <iframe
                src={iframeSrc}
                className="w-full h-full"
                title="오버레이 미리보기"
                style={{
                  border: "none",
                  background: config.bg === "transparent" ? "var(--muted)" : config.bg,
                }}
              />
            )}
          </div>
        </div>

        {/* URL 복사 */}
        <div className="mb-4">
          <label className="text-sm font-medium text-foreground">OBS 브라우저 소스 URL</label>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-xs font-mono break-all select-all">
              {overlayUrl}
            </code>
            <Button onClick={handleCopy} size="sm" className="shrink-0">
              <CopyIcon className="w-4 h-4 mr-1" />
              복사
            </Button>
          </div>
        </div>

        </div>

        {/* 하단 고정 저장 영역 */}
        <div className="flex items-center justify-between flex-wrap gap-2 border-t border-border px-6 py-4">
          <span
            role="status"
            aria-live="polite"
            className={cn(
              "text-xs font-medium text-amber-600 dark:text-amber-400 transition-opacity duration-200",
              isDirty ? "opacity-100" : "opacity-0 pointer-events-none",
            )}
          >
            저장하지 않은 변경 사항이 있습니다
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "min-h-11 transition-opacity duration-200",
                isDirty ? "opacity-100" : "opacity-0 pointer-events-none",
              )}
              tabIndex={isDirty ? 0 : -1}
              onClick={() => {
                if (savedConfig) {
                  setConfig({ ...savedConfig });
                }
              }}
            >
              변경 취소
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !isDirty}
              size="sm"
              className={cn("min-h-11", saving && "cursor-wait")}
            >
              <CheckIcon className="w-4 h-4 mr-1" />
              {saving ? "저장 중..." : "저장"}
            </Button>
          </div>
        </div>
        </>}
      </div>
    </div>

    <ConfirmDialog
      open={showUnsavedDialog}
      title="저장하지 않고 닫기"
      description="변경된 설정이 저장되지 않았습니다. 그래도 닫으시겠습니까?"
      confirmLabel="닫기"
      variant="danger"
      onConfirm={onClose}
      onCancel={() => setShowUnsavedDialog(false)}
    />
    </>
  );
}
