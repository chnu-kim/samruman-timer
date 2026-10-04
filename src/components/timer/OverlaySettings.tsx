"use client";

import { useState, useCallback, useMemo, useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { CopyIcon, XIcon, CheckIcon } from "@/components/ui/Icons";
import { useToast } from "@/components/ui/Toast";
import { authFetch } from "@/lib/auth-fetch";
import { cn } from "@/lib/utils";
import { HEX_COLOR } from "@/lib/overlay-style";

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
  animation: boolean;
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

// 프리셋이 정하는 값(color·bg·shadow·fontSize)이 모두 같으면 그 프리셋이 적용된 상태로 본다
function matchesPreset(config: OverlayConfig, preset: (typeof PRESETS)[number]): boolean {
  return (Object.keys(preset.config) as (keyof OverlayConfig)[]).every(
    (key) => config[key] === preset.config[key],
  );
}

// 투명은 type=color가 표현하지 못해 검정으로 그려지므로 견본 자리에 체커보드를 깐다
const CHECKERBOARD = "repeating-conic-gradient(#d4d4d4 0% 25%, #ffffff 0% 50%) 50% / 12px 12px";

const POSITION_LABELS: Record<Position, string> = {
  center: "중앙",
  "top-left": "좌상단",
  "top-right": "우상단",
  "bottom-left": "좌하단",
  "bottom-right": "우하단",
};

// 입력 중간 상태(#ff 등)가 URL에 들어가면 오버레이 글자가 body 색을 물려받으므로 완성된 값만 반영한다

// 3×3 칸에 놓을 위치. null은 고를 수 없는 빈 칸이다
const POSITION_GRID: (Position | null)[] = [
  "top-left", null, "top-right",
  null, "center", null,
  "bottom-left", null, "bottom-right",
];

export function OverlaySettings({ timerId, onClose }: OverlaySettingsProps) {
  const { toast } = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
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
    animation: true,
  });
  const [fontSizeInput, setFontSizeInput] = useState(String(config.fontSize));
  // 색 코드 입력칸의 미완성 값. null이면 config 값을 그대로 보여 준다
  const [colorDraft, setColorDraft] = useState<string | null>(null);
  const [bgDraft, setBgDraft] = useState<string | null>(null);
  const [iframeSrc, setIframeSrc] = useState<string>("");
  // 타이머 제목은 오버레이의 '타이틀 표시'에서만 화면에 나오므로 여기서 함께 고친다.
  // 저장 전 변경 여부와 닫기 경고에 포함되도록 설정과 같은 저장 흐름에 둔다
  const [savedTitle, setSavedTitle] = useState<string | null>(null);
  const [title, setTitle] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/timers/${timerId}`);
        if (res.ok) {
          const json = (await res.json()) as { data?: { title: string } };
          if (json.data) {
            setSavedTitle(json.data.title);
            setTitle(json.data.title);
          }
        }
      } catch {
        // 제목을 못 불러오면 제목 입력란만 숨긴다
      }
    })();
  }, [timerId]);

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch(`/api/timers/${timerId}/overlay-settings`);
        const json = await res.json() as { data?: OverlayConfig };
        if (json.data) {
          const loaded = { ...json.data, animation: json.data.animation ?? true };
          setConfig(loaded);
          setFontSizeInput(String(loaded.fontSize));
          setSavedConfig(loaded);
        } else {
          setSavedConfig({
            fontSize: 72, color: "#ffffff", bg: "transparent",
            showTitle: false, shadow: true, position: "center", animation: true,
          });
        }
      } catch {
        // ignore — use defaults
        setSavedConfig({
          fontSize: 72, color: "#ffffff", bg: "transparent",
          showTitle: false, shadow: true, position: "center", animation: true,
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [timerId]);

  const titleDirty = savedTitle !== null && title.trim() !== savedTitle;
  const isDirty = useMemo(
    () => titleDirty || (savedConfig !== null && JSON.stringify(config) !== JSON.stringify(savedConfig)),
    [config, savedConfig, titleDirty],
  );

  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowUnsavedDialog(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  // 네이티브 모달 <dialog>가 배경 inert·Tab 순환을 맡는다. 부모가 이 컴포넌트를 바로 언마운트하므로
  // close()의 포커스 복귀 대신, DOM에서 빠진 뒤(useEffect 정리) 연 버튼으로 직접 돌려준다
  // 연 버튼은 showModal 직전에 한 번만 잡는다. StrictMode의 재실행 때는 이미 열려 있어 포커스가 모달 안에 있다
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    }
    return () => {
      const opener = openerRef.current;
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const handleSave = useCallback(async () => {
    const trimmedTitle = title.trim();
    if (titleDirty && !trimmedTitle) {
      toast("표시할 제목을 입력해주세요", "error");
      return;
    }
    setSaving(true);
    try {
      if (titleDirty) {
        const titleRes = await authFetch(`/api/timers/${timerId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: trimmedTitle }),
        });
        if (!titleRes.ok) {
          const json = await titleRes.json().catch(() => null) as { error?: { message?: string } } | null;
          toast(json?.error?.message ?? "제목을 저장하지 못했습니다", "error");
          return;
        }
        setSavedTitle(trimmedTitle);
        setTitle(trimmedTitle);
      }
      // 제목만 바뀌었으면 URL이 그대로라 다시 붙여넣을 필요가 없다
      const configDirty = savedConfig === null || JSON.stringify(config) !== JSON.stringify(savedConfig);
      if (!configDirty) {
        toast("제목이 저장되었습니다", "success");
        return;
      }
      const res = await authFetch(`/api/timers/${timerId}/overlay-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setSavedConfig({ ...config });
        // 모바일 390px에서도 한 줄에 들어가게 짧게 둔다. 자세한 안내는 URL 블록에 상시 표시된다
        toast("저장되었습니다. OBS에 URL을 다시 붙여넣으세요", "success");
      } else {
        const json = await res.json() as { error?: { message?: string } };
        toast(json.error?.message ?? "저장에 실패했습니다", "error");
      }
    } catch {
      toast("저장에 실패했습니다", "error");
    } finally {
      setSaving(false);
    }
  }, [timerId, config, savedConfig, toast, title, titleDirty]);

  const overlayUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (config.fontSize !== 72) params.set("fontSize", String(config.fontSize));
    if (config.color !== "#ffffff") params.set("color", config.color);
    if (config.bg !== "transparent") params.set("bg", config.bg);
    if (config.showTitle) params.set("showTitle", "true");
    if (!config.shadow) params.set("shadow", "false");
    if (config.position !== "center") params.set("position", config.position);
    if (!config.animation) params.set("animation", "false");

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

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(overlayUrl);
      toast("OBS 오버레이 URL이 복사되었습니다", "success");
    } catch {
      // 실패를 성공으로 알리면 클립보드에 남아 있던 이전 URL을 OBS에 붙여 넣게 된다
      toast("URL을 복사하지 못했습니다. 주소를 직접 선택해 복사해 주세요", "error");
    }
  }, [overlayUrl, toast]);

  const applyPreset = useCallback((preset: (typeof PRESETS)[number]) => {
    setColorDraft(null);
    setBgDraft(null);
    setConfig((prev) => {
      const next = { ...prev, ...preset.config };
      setFontSizeInput(String(next.fontSize));
      return next;
    });
  }, []);

  return (
    <>
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby={titleId}
      // Esc: 저장 안 한 변경이 있으면 확인창을 거치도록 기본 닫기를 막는다
      onCancel={(e) => {
        e.preventDefault();
        handleClose();
      }}
      // 브라우저가 cancel을 막지 못하고 닫은 경우(사용자 활성화 없는 Esc 반복 등)에도 상태를 맞춘다
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) handleClose();
      }}
      className="m-auto w-full max-w-[min(42rem,calc(100%-2rem))] max-h-[90dvh] overflow-hidden rounded-xl border border-border bg-background p-0 text-foreground shadow-dialog backdrop:bg-black/50 animate-[fade-in_0.15s_ease-out]"
    >
      <div className="flex max-h-[90dvh] flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 pb-0">
          <h2 id={titleId} className="text-lg font-bold">OBS 오버레이 설정</h2>
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
        {/* URL 복사 — 모달의 최종 목적이므로 맨 위에 둔다 */}
        <div className="mb-5">
          <span className="text-sm font-medium text-foreground">OBS 브라우저 소스 URL</span>
          {/* 오버레이 페이지는 URL 파라미터만 읽으므로 저장만으로는 방송 화면이 바뀌지 않는다 */}
          <p className="mt-0.5 text-xs text-muted-foreground">
            URL을 바꿨다면 OBS 브라우저 소스에 새로 붙여넣어야 방송에 반영됩니다.
          </p>
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

        {/* 프리셋 테마 */}
        <div className="mb-5">
          <span className="text-sm font-medium text-foreground">프리셋 테마</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {PRESETS.map((preset) => {
              const active = matchesPreset(config, preset);
              return (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-lg border px-3 py-2 min-h-11 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "border-accent bg-accent-light text-foreground"
                      : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                  )}
                >
                  {preset.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* 폰트 크기 슬라이더 + 직접 입력 */}
        <div className="mb-5">
          <span className="text-sm font-medium text-foreground">
            폰트 크기
          </span>
          <div className="mt-1.5 flex items-center gap-3">
            <input
              type="range"
              min={24}
              max={200}
              value={config.fontSize}
              onChange={(e) => {
                const v = Number(e.target.value);
                setConfig((prev) => ({ ...prev, fontSize: v }));
                setFontSizeInput(String(v));
              }}
              className="flex-1 accent-accent"
              aria-label="폰트 크기 슬라이더"
            />
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={24}
                max={200}
                value={fontSizeInput}
                onChange={(e) => {
                  setFontSizeInput(e.target.value);
                  // 서버는 정수만 받으므로 소수 입력은 반올림해 반영한다
                  const v = Math.round(Number(e.target.value));
                  if (!Number.isNaN(v) && v >= 24 && v <= 200) {
                    setConfig((prev) => ({ ...prev, fontSize: v }));
                  }
                }}
                onBlur={() => {
                  const v = Number(fontSizeInput);
                  if (Number.isNaN(v) || fontSizeInput === "") {
                    setFontSizeInput(String(config.fontSize));
                  } else {
                    const clamped = Math.max(24, Math.min(200, Math.round(v)));
                    setFontSizeInput(String(clamped));
                    setConfig((prev) => ({ ...prev, fontSize: clamped }));
                  }
                }}
                className="w-16 text-center rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="폰트 크기 입력"
              />
              <span className="text-sm text-muted-foreground">px</span>
            </div>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
            <span>24px</span>
            <span>200px</span>
          </div>
        </div>

        {/* 색상 선택 — P1 #9: responsive grid */}
        <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <span className="text-sm font-medium text-foreground">텍스트 색상</span>
            <div className="mt-1.5 flex items-center gap-2">
              {/* P1 #6: 44px color input */}
              <input
                type="color"
                value={config.color}
                onChange={(e) => {
                  setColorDraft(null);
                  setConfig((prev) => ({ ...prev, color: e.target.value }));
                }}
                className="w-11 h-11 rounded border border-border cursor-pointer"
                aria-label="텍스트 색상"
              />
              <Input
                value={colorDraft ?? config.color}
                onChange={(e) => {
                  const v = e.target.value;
                  if (HEX_COLOR.test(v)) {
                    setColorDraft(null);
                    setConfig((prev) => ({ ...prev, color: v }));
                  } else {
                    setColorDraft(v);
                  }
                }}
                aria-invalid={colorDraft !== null}
                className="flex-1 font-mono text-sm aria-[invalid=true]:border-red-500"
                maxLength={7}
                aria-label="텍스트 색상 코드"
              />
            </div>
          </div>
          <div>
            <span className="text-sm font-medium text-foreground">배경색</span>
            <div className="mt-1.5 flex items-center gap-2">
              <span
                className="relative w-11 h-11 shrink-0 rounded has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                style={config.bg === "transparent" ? { background: CHECKERBOARD } : undefined}
                data-testid="bg-swatch"
              >
                <input
                  type="color"
                  value={config.bg === "transparent" ? "#000000" : config.bg}
                  onChange={(e) => {
                    setBgDraft(null);
                    setConfig((prev) => ({ ...prev, bg: e.target.value }));
                  }}
                  className={cn(
                    "block w-11 h-11 rounded border border-border cursor-pointer",
                    config.bg === "transparent" && "opacity-0",
                  )}
                  aria-label="배경색"
                />
                {config.bg === "transparent" && (
                  <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded border border-border" />
                )}
              </span>
              <div className="flex-1 flex items-center gap-1">
                <Input
                  value={bgDraft ?? config.bg}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "transparent" || HEX_COLOR.test(v)) {
                      setBgDraft(null);
                      setConfig((prev) => ({ ...prev, bg: v }));
                    } else {
                      setBgDraft(v);
                    }
                  }}
                  aria-invalid={bgDraft !== null}
                  className="flex-1 font-mono text-sm aria-[invalid=true]:border-red-500"
                  placeholder="transparent"
                  aria-label="배경색 코드"
                />
              </div>
            </div>
            {/* 이미 투명이면 누를 일이 없으므로 숨긴다 */}
            {config.bg !== "transparent" && (
              <button
                type="button"
                onClick={() => {
                  setBgDraft(null);
                  setConfig((prev) => ({ ...prev, bg: "transparent" }));
                }}
                className="mt-1 min-h-11 px-1 inline-flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                투명으로 초기화
              </button>
            )}
          </div>
        </div>

        {/* 위치 선택 비주얼 그리드 — P1 #5: larger grid */}
        <div className="mb-5">
          <span className="text-sm font-medium text-foreground">위치</span>
          <div className="mt-1.5 grid grid-cols-3 grid-rows-3 gap-1 w-56 h-40 border border-border rounded-lg p-1 bg-muted">
            {POSITION_GRID.map((pos, i) =>
              pos === null ? (
                <div key={i} className="min-h-[40px]" />
              ) : (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setConfig((prev) => ({ ...prev, position: pos }))}
                  className={cn(
                    "rounded border text-xs transition-colors min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    // 고르지 않은 칸도 누를 수 있는 자리로 보이게 윤곽을 상시 둔다(배경 대비 3:1 이상)
                    config.position === pos
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-foreground/50 hover:bg-foreground/10",
                  )}
                  aria-label={POSITION_LABELS[pos]}
                  aria-pressed={config.position === pos}
                />
              ),
            )}
          </div>

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
          {config.showTitle && savedTitle !== null && (
            <div className="pl-7">
              <Input
                label="표시할 제목"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
              />
              {/* 제목은 오버레이가 주기적으로 다시 읽으므로 URL을 다시 붙여넣지 않아도 바뀐다 */}
              <p className="mt-1 text-xs text-muted-foreground">제목은 저장하면 방송 화면에 바로 반영됩니다.</p>
            </div>
          )}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.shadow}
              onChange={(e) => setConfig((prev) => ({ ...prev, shadow: e.target.checked }))}
              className="w-4 h-4 accent-accent rounded"
            />
            <span className="text-sm">텍스트 그림자</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.animation}
              onChange={(e) => setConfig((prev) => ({ ...prev, animation: e.target.checked }))}
              className="w-4 h-4 accent-accent rounded"
            />
            <span className="text-sm">애니메이션</span>
          </label>
        </div>

        {/* 실시간 미리보기 — P1 #10: debounced iframe, P2 #11: CSS var background */}
        <div className="mb-5">
          <span className="text-sm font-medium text-foreground">미리보기</span>
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
                  // 투명 배경은 테마와 무관하게 방송 화면에 가까운 중간 어두운 색으로 미리 본다
                  background: config.bg === "transparent" ? "#3f3f46" : config.bg,
                }}
              />
            )}
          </div>
        </div>

        </div>

        {/* 하단 고정 저장 영역 */}
        <div className="flex items-center justify-between flex-wrap gap-2 border-t border-border px-6 py-4">
          <span
            role="status"
            aria-live="polite"
            className={cn(
              "text-xs font-medium text-amber-700 dark:text-amber-400 transition-opacity duration-200",
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
                  setColorDraft(null);
                  setBgDraft(null);
                  setConfig({ ...savedConfig });
                }
                if (savedTitle !== null) setTitle(savedTitle);
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
    </dialog>

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
