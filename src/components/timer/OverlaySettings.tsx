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
// 투명 배경을 미리 볼 때 깔 방송 화면 색. 어두운 쪽이 기본이고, 밝은 게임·캠 화면에서 글자가 읽히는지는 밝은 쪽으로 확인한다
const PREVIEW_DARK = "#3f3f46";
const PREVIEW_LIGHT = "#ffffff";
// 배경색 칸에 CSS 키워드(transparent) 대신 보여 주는 말. 입력으로도 받는다
const TRANSPARENT_LABEL = "투명";

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
  // 미리보기 전용 배경. 설정(config.bg)·URL에는 넣지 않는다(방송 화면이 흰색으로 덮이면 안 된다)
  const [lightPreview, setLightPreview] = useState(false);
  // 타이머 제목은 오버레이의 '제목 표시'에서만 화면에 나오므로 여기서 함께 고친다.
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
  const configDirty = useMemo(
    () => savedConfig !== null && JSON.stringify(config) !== JSON.stringify(savedConfig),
    [config, savedConfig],
  );
  const isDirty = titleDirty || configDirty;

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

  // 오버레이는 URL 파라미터만 읽는다. 바뀐 URL이 방송에 반영되는 길은 복사해서 OBS에 다시 붙여넣는 것뿐이므로
  // 하단 주 버튼 하나가 저장과 복사를 같이 한다. 제목은 오버레이가 폴링으로 다시 읽어 URL과 무관하다
  const titleOnly = titleDirty && !configDirty;

  // 제목과 설정은 서로 무관한 요청이라 함께 보내고, 하나가 실패해도 다른 하나는 저장한다.
  // 실패가 있으면 첫 실패 사유를, 모두 성공하면 null을 돌려준다
  const save = useCallback(async (trimmedTitle: string | null): Promise<string | null> => {
    const failMessage = async (res: Response, fallback: string) => {
      const json = await res.json().catch(() => null) as { error?: { message?: string } } | null;
      return json?.error?.message ?? fallback;
    };
    const tasks: Promise<void>[] = [];
    if (trimmedTitle !== null) {
      tasks.push((async () => {
        const res = await authFetch(`/api/timers/${timerId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: trimmedTitle }),
        });
        if (!res.ok) throw new Error(await failMessage(res, "제목을 저장하지 못했습니다"));
        setSavedTitle(trimmedTitle);
        setTitle(trimmedTitle);
      })());
    }
    if (configDirty) {
      const snapshot = { ...config };
      tasks.push((async () => {
        const res = await authFetch(`/api/timers/${timerId}/overlay-settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(snapshot),
        });
        if (!res.ok) throw new Error(await failMessage(res, "설정을 저장하지 못했습니다"));
        setSavedConfig(snapshot);
      })());
    }
    const failed = (await Promise.allSettled(tasks)).find((r) => r.status === "rejected");
    if (!failed) return null;
    return failed.reason instanceof Error ? failed.reason.message : "저장하지 못했습니다";
  }, [timerId, config, configDirty]);

  const handlePrimary = useCallback(async () => {
    const trimmedTitle = title.trim();
    // 빈 제목은 저장하지 않는다. 다만 URL과는 무관하므로 복사·설정 저장까지 막지는 않는다
    const titleInvalid = titleDirty && !trimmedTitle;
    if (titleOnly && titleInvalid) {
      toast("표시할 제목을 입력해 주세요", "error");
      return;
    }
    // 복사는 await 전에 시작한다. Safari는 await를 지나면 클릭의 사용자 활성화를 잃어 클립보드 쓰기를 막는다
    const copying = titleOnly
      ? null
      : navigator.clipboard?.writeText(overlayUrl) ?? Promise.reject(new Error("clipboard unavailable"));
    copying?.catch(() => {});
    const titleToSave = titleDirty && !titleInvalid ? trimmedTitle : null;
    const needsSave = configDirty || titleToSave !== null;
    let saveError: string | null = null;
    if (needsSave) {
      setSaving(true);
      try {
        saveError = await save(titleToSave);
      } finally {
        setSaving(false);
      }
    }

    if (copying === null) {
      // 제목만 바뀌었으면 URL이 그대로라 다시 붙여넣을 필요가 없다
      if (saveError) toast(saveError, "error");
      else toast("제목을 저장했습니다. 다시 붙여넣지 않아도 됩니다", "success");
      return;
    }
    const copied = await copying.then(() => true, () => false);
    // 복사와 저장은 따로 알린다. 실패를 성공으로 알리면 클립보드에 남아 있던 이전 URL을 OBS에 붙여 넣게 된다.
    // 모바일 390px에서 넘치지 않게 문구는 짧게 둔다
    if (copied && !saveError) {
      toast("URL을 복사했습니다. OBS에 붙여넣으세요", "success");
    } else if (copied) {
      toast("URL은 복사했지만 저장하지 못했습니다", "error");
    } else if (needsSave && !saveError) {
      toast("저장했지만 복사하지 못했습니다. 주소를 직접 복사해 주세요", "error");
    } else {
      toast("URL을 복사하지 못했습니다. 주소를 직접 복사해 주세요", "error");
      if (saveError) toast("변경 사항도 저장하지 못했습니다", "error");
    }
    if (titleInvalid) toast("제목이 비어 있어 제목은 저장하지 않았습니다", "error");
  }, [title, titleDirty, titleOnly, configDirty, overlayUrl, save, toast]);

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
      // md 미만에서는 화면 아래에 붙은 시트: 좌우 꽉 채우고 위쪽 모서리만 둥글게, 아래 여백 없이 붙인다
      className="m-auto w-full max-w-[min(42rem,calc(100%-2rem))] max-h-[90dvh] overflow-hidden rounded-xl border border-border bg-background p-0 text-foreground shadow-dialog backdrop:bg-black/50 animate-[fade-in_0.15s_ease-out] max-md:mb-0 max-md:max-w-none max-md:rounded-b-none max-md:border-b-0"
    >
      <div className="flex max-h-[90dvh] flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 pb-0 max-md:pt-4">
          <h2 id={titleId} className="text-lg font-bold">OBS 오버레이 설정</h2>
          <button
            onClick={handleClose}
            aria-label="닫기"
            className="rounded-lg p-1.5 min-h-11 min-w-11 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            설정을 불러오는 중…
          </div>
        ) : <>
        {/* 스크롤 가능 콘텐츠 */}
        {/* 미리보기가 붙어 있을 때 Tab으로 이동한 컨트롤이 그 아래로 숨지 않게 그 높이만큼 scroll-padding을 둔다 */}
        <div className="flex-1 overflow-y-auto p-6 pt-5 [@media(min-width:48rem)_and_(min-height:56rem)]:scroll-pt-[25rem]">
        {/* URL — 무엇이 복사되는지 확인하는 자리. 복사는 하단 주 버튼이 저장과 함께 한다 */}
        <div className="mb-4">
          <span className="text-sm font-medium text-foreground">OBS 브라우저 소스 URL</span>
          <code className="mt-1.5 block rounded-lg border border-border bg-muted px-3 py-2 text-xs font-mono break-all select-all">
            {overlayUrl}
          </code>
          {/* 처음 연결할 때 막히는 것은 소스 크기다. OBS 브라우저 소스 기본값(800×600)이면 위치가 어긋난다 */}
          <p className="mt-1 text-xs text-muted-foreground">
            OBS 브라우저 소스에 붙여넣기 · 너비 1920 높이 1080
          </p>
        </div>

        {/* 미리보기 — 1920×1080 방송 화면을 그대로 그린 뒤 축소해 크기·위치를 실제 비율로 보여 준다.
            세로 여유가 있는 데스크톱(높이 896px 이상)에서는 아래 설정을 바꾸는 동안에도 보이게 붙여 둔다 */}
        <div className="mb-5 bg-background pb-1 [@media(min-width:48rem)_and_(min-height:56rem)]:sticky [@media(min-width:48rem)_and_(min-height:56rem)]:top-0 [@media(min-width:48rem)_and_(min-height:56rem)]:z-10">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">미리보기</span>
            {/* 배경색을 정했으면 오버레이가 그 색을 직접 칠하므로 투명일 때만 의미가 있다 */}
            {config.bg === "transparent" && (
              <button
                type="button"
                aria-pressed={lightPreview}
                onClick={() => setLightPreview((v) => !v)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:text-foreground aria-pressed:text-foreground pointer-coarse:min-h-11"
              >
                {/* 프리셋 버튼과 같이 켜진 상태는 체크로 알린다(C004). 꺼져 있을 때는 흰 견본으로 무엇을 켜는지 보여 준다 */}
                {lightPreview ? (
                  <CheckIcon className="h-3.5 w-3.5" />
                ) : (
                  <span
                    aria-hidden="true"
                    className="h-3.5 w-3.5 rounded-full border border-border-input"
                    style={{ background: PREVIEW_LIGHT }}
                  />
                )}
                밝은 화면에서 보기
              </button>
            )}
          </div>
          <OverlayPreview
            src={iframeSrc}
            background={config.bg === "transparent" ? (lightPreview ? PREVIEW_LIGHT : PREVIEW_DARK) : config.bg}
          />
        </div>

        {/* 프리셋 테마 */}
        <div className="mb-5">
          <span className="text-sm font-medium text-foreground">프리셋 테마</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {PRESETS.map((preset) => {
              const active = matchesPreset(config, preset);
              // 누르면 값을 한꺼번에 바꾸는 즉시 적용 버튼이다. 선택 컨트롤(세그먼트)처럼 칠하지 않고,
              // 현재 값과 같은 프리셋에만 체크 표시를 둔다(C004)
              return (
                <Button
                  key={preset.name}
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => applyPreset(preset)}
                  aria-pressed={active}
                  className="min-h-11"
                >
                  {active && <CheckIcon className="w-4 h-4 mr-1" />}
                  {preset.name}
                </Button>
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
              // 터치 기기에서는 입력 상자를 44px로 키워 트랙 위아래를 눌러도 값이 바뀌게 한다(트랙·썸 모양은 그대로)
              className="flex-1 accent-accent pointer-coarse:h-11"
              aria-label="폰트 크기 슬라이더"
            />
            <div className="flex items-center gap-1">
              <input
                type="number"
                inputMode="numeric"
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
                className="w-16 text-center rounded border border-border-input bg-background px-2 py-1 text-sm text-foreground"
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
                className="w-11 h-11 rounded border border-border-input cursor-pointer"
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
                    "block w-11 h-11 rounded border border-border-input cursor-pointer",
                    config.bg === "transparent" && "opacity-0",
                  )}
                  aria-label="배경색"
                />
                {config.bg === "transparent" && (
                  <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded border border-border-input" />
                )}
              </span>
              <div className="flex-1 flex items-center gap-1">
                <Input
                  // 저장값·URL은 CSS 키워드 transparent 그대로 두고, 화면에는 '투명'으로 보인다
                  value={bgDraft ?? (config.bg === "transparent" ? TRANSPARENT_LABEL : config.bg)}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === TRANSPARENT_LABEL || v === "transparent" || HEX_COLOR.test(v)) {
                      setBgDraft(null);
                      setConfig((prev) => ({ ...prev, bg: v === TRANSPARENT_LABEL ? "transparent" : v }));
                    } else {
                      setBgDraft(v);
                    }
                  }}
                  aria-invalid={bgDraft !== null}
                  className="flex-1 font-mono text-sm aria-[invalid=true]:border-red-500"
                  placeholder={TRANSPARENT_LABEL}
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
                    "rounded border text-xs transition-colors min-h-[40px]",
                    // 고르지 않은 칸도 누를 수 있는 자리로 보이게 입력 경계 토큰으로 윤곽을 상시 둔다(bg-muted 대비 3:1 이상)
                    config.position === pos
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border-input hover:bg-foreground/10",
                  )}
                  aria-label={POSITION_LABELS[pos]}
                  aria-pressed={config.position === pos}
                />
              ),
            )}
          </div>

        </div>

        {/* 토글 옵션 — 터치 기기에서는 행마다 44px 높이로 누르게 하고, 그만큼 행 사이 간격을 없앤다 */}
        <div className="mb-5 space-y-3 pointer-coarse:space-y-0">
          <label className="flex pointer-coarse:min-h-11 items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.showTitle}
              onChange={(e) => {
                const checked = e.target.checked;
                setConfig((prev) => ({ ...prev, showTitle: checked }));
                // 입력란이 사라지면 고친 제목도 보이지 않으므로, 숨은 값을 저장하지 않게 되돌린다
                if (!checked && savedTitle !== null) setTitle(savedTitle);
              }}
              className="w-4 h-4 accent-accent rounded"
            />
            <span className="text-sm">제목 표시</span>
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
          <label className="flex pointer-coarse:min-h-11 items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.shadow}
              onChange={(e) => setConfig((prev) => ({ ...prev, shadow: e.target.checked }))}
              className="w-4 h-4 accent-accent rounded"
            />
            <span className="text-sm">텍스트 그림자</span>
          </label>
          <label className="flex pointer-coarse:min-h-11 items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.animation}
              onChange={(e) => setConfig((prev) => ({ ...prev, animation: e.target.checked }))}
              className="w-4 h-4 accent-accent rounded"
            />
            <span className="text-sm">애니메이션</span>
          </label>
        </div>

        </div>

        {/* 하단 고정 영역 — 주 버튼은 저장을 포함한 URL 복사 */}
        {/* 시트(md 미만)에서는 한 줄 높이로 줄이고 홈 인디케이터(safe-area)만큼 띄운다 */}
        <div className="flex items-center justify-between flex-wrap gap-2 border-t border-border px-6 py-4 max-md:py-3 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <span
            role="status"
            aria-live="polite"
            className={cn(
              "text-xs font-medium text-amber-700 dark:text-amber-400 transition-opacity duration-200",
              isDirty ? "opacity-100" : "opacity-0 pointer-events-none",
            )}
          >
            {!isDirty ? "" : titleOnly ? "저장하지 않은 변경 사항이 있습니다" : "복사하면 변경 사항도 저장됩니다"}
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
              // 저장 중에 되돌리면 응답이 저장값을 덮어써 화면과 서버가 어긋난다
              disabled={saving}
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
            {/* 제목만 바뀌면 URL이 그대로라 복사할 것이 없다. 버튼 이름을 하는 일에 맞춘다 */}
            <Button
              onClick={handlePrimary}
              disabled={saving}
              size="sm"
              className={cn("min-h-11", saving && "cursor-wait")}
            >
              {titleOnly ? <CheckIcon className="w-4 h-4 mr-1" /> : <CopyIcon className="w-4 h-4 mr-1" />}
              {saving ? "저장 중…" : titleOnly ? "제목 저장" : "URL 복사"}
            </Button>
          </div>
        </div>
        </>}
      </div>
    </dialog>

    <ConfirmDialog
      open={showUnsavedDialog}
      title="저장하지 않고 닫기"
      description="바꾼 설정은 저장되지 않고 사라집니다."
      confirmLabel="닫기"
      variant="danger"
      onConfirm={onClose}
      onCancel={() => setShowUnsavedDialog(false)}
    />
    </>
  );
}

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;

// 오버레이는 뷰포트 기준으로 위치를 잡으므로 iframe을 방송 캔버스 크기로 그리고 상자 폭에 맞춰 축소한다.
// transform은 레이아웃 크기를 줄이지 않아서, 상자가 넘친 부분을 잘라야 스크롤 영역이 가로로 넓어지지 않는다
function OverlayPreview({ src, background }: { src: string; background: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => {
      const width = box.clientWidth;
      if (width > 0) setScale(width / CANVAS_WIDTH);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={boxRef}
      className="relative mt-1.5 aspect-video w-full overflow-hidden rounded-lg border border-border"
      style={{ background }}
      data-testid="overlay-preview"
    >
      {src && (
        <iframe
          src={src}
          title="오버레이 미리보기"
          tabIndex={-1}
          className="pointer-events-none absolute left-0 top-0 origin-top-left"
          style={{
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            border: "none",
            // 투명 배경은 테마와 무관하게 방송 화면에 가까운 중간 어두운 색으로 미리 본다
            background,
            transform: `scale(${scale ?? 0})`,
            visibility: scale === null ? "hidden" : undefined,
          }}
        />
      )}
    </div>
  );
}
