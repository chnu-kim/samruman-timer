"use client";

import { useState, useEffect, useLayoutEffect, useRef, useId } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SegmentedControl, type SegmentedOption } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { authFetch } from "@/lib/auth-fetch";
import { useUndoableModifyToast } from "@/hooks/useUndoableModifyToast";
import { normalizeTimeParts, resolveQuickActor, type TimeParts } from "@/lib/timer-input";
import type { ApiSuccessResponse, ApiErrorResponse, TimerModifyResponse, TimerLogResponse, ModifyAction, TimerStatus } from "@/types";

const ACTION_OPTIONS = [
  { value: "ADD", label: "추가", attrs: { "aria-keyshortcuts": "X" } },
  { value: "SUBTRACT", label: "차감", attrs: { "aria-keyshortcuts": "X" } },
] as const satisfies readonly SegmentedOption<ModifyAction>[];

interface TimerControlsProps {
  timerId: string;
  status?: TimerStatus;
  remainingSeconds?: number;
  /** 추가/차감 방향. 단축키와 같은 상태를 쓰도록 상위(page)가 소유한다 */
  selectedAction: ModifyAction;
  onActionChange: (action: ModifyAction) => void;
  onModified?: (data: TimerModifyResponse) => void;
  /** 조작 중 타이머가 이미 삭제됐음(404)을 알게 됐을 때. 상위가 '타이머 없음' 상태로 바꾼다 */
  onTimerRemoved?: () => void;
  /**
   * 즉시 적용 닉네임을 상위와 공유하는 ref. 숫자 단축키(상위 소유)가 모바일 바와 같은 이름으로 기록하게 한다.
   * effect가 아니라 렌더 중에 채워, 닉네임을 바꾼 직후의 단축키도 화면에 보이는 이름을 쓴다
   */
  quickActorRef?: { current: string };
  /**
   * 닉네임 입력란으로 안내하는 함수를 상위와 공유하는 ref. 닉네임 없이 숫자 단축키를 눌렀을 때 상위가 불러
   * 입력란으로 포커스를 옮긴다(안내 문구는 상위 토스트가 맡으므로 입력란 옆 alert는 띄우지 않는다)
   */
  nicknamePromptRef?: { current: (() => void) | null };
  /** 카운트다운이 0에 닿아 만료로 보이는지. 폴링 전이라 status가 아직 RUNNING이어도 상위가 알려 준다 */
  expired?: boolean;
  /** 서버와 연결이 끊긴 상태. 버튼은 그대로 두고 안내 줄 문구만 바꾼다 */
  disconnected?: boolean;
  className?: string;
}

// 카드(md 이상)와 모바일 하단 바가 같은 값·같은 표기('+1시간')를 쓴다. 화면에는 둘 중 한 벌만 보인다
const PRESETS = [
  { label: "1시간", seconds: 3600 },
  { label: "5시간", seconds: 18000 },
  { label: "10시간", seconds: 36000 },
];

// 바 제출 버튼은 제출 직후 같은 자리가 즉시 적용 프리셋(+5시간)으로 바뀐다.
// 확인하려고 한 번 더 누른 탭이 프리셋으로 새지 않게 그동안 프리셋을 잠근다
const BAR_SUBMIT_COOLDOWN_MS = 800;

const RECENT_ACTORS_KEY = "recentActors";
const DEFAULT_ACTOR_KEY = "defaultActorName";
const MAX_RECENT_ACTORS = 10;

function getRecentActors(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_ACTORS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecentActor(name: string) {
  const current = getRecentActors();
  const filtered = current.filter((n) => n !== name);
  const next = [name, ...filtered].slice(0, MAX_RECENT_ACTORS);
  localStorage.setItem(RECENT_ACTORS_KEY, JSON.stringify(next));
}

function getDefaultActor(): string {
  try {
    return localStorage.getItem(DEFAULT_ACTOR_KEY) || "";
  } catch {
    return "";
  }
}

function saveDefaultActor(name: string) {
  localStorage.setItem(DEFAULT_ACTOR_KEY, name);
}

/** 닉네임 없이 폼(확인 버튼·Enter)으로 제출했을 때의 안내 */
export const NICKNAME_REQUIRED_MESSAGE = "시청자 닉네임을 입력해 주세요.";
/** 닉네임 없이 하단 바를 눌렀을 때 입력란 옆에 띄우는 한 줄 */
export const NICKNAME_PROMPT_MESSAGE = "닉네임을 입력하면 바로 적용됩니다";
/** 연결이 끊긴 동안의 안내 줄 */
export const DISCONNECTED_HINT_MESSAGE = "연결이 돌아오면 적용할 수 있습니다";
/** 서버 오류·네트워크 실패(폼). 실패하면 입력을 되살리므로 다시 누르면 된다 */
export const MODIFY_FAILED_FORM_MESSAGE = "적용하지 못했습니다. 입력은 그대로 있으니 다시 확인을 누르세요.";
/** 서버 오류·네트워크 실패(하단 바처럼 입력 없이 바로 적용하는 경로) */
export const MODIFY_FAILED_QUICK_MESSAGE = "적용하지 못했습니다. 다시 눌러 주세요.";

/**
 * 글자를 입력하는 칸인지. 모바일에서 키보드가 올라오는 칸에 포커스가 있는 동안만 하단 바를 숨긴다.
 * 버튼·추가/차감 토글(role=radio)·바 버튼에 포커스가 가도 바는 그대로 둔다
 */
function isTextEntry(el: EventTarget | null): boolean {
  if (el instanceof HTMLTextAreaElement) return true;
  if (!(el instanceof HTMLInputElement)) return false;
  return ["text", "number", "search", "tel", "email", "url", ""].includes(el.type);
}

/**
 * 인라인 오류가 보이는 자리인지. 오류 문구는 확인 버튼 바로 위에 뜨므로 그 버튼이 뷰포트 안(모바일은 하단 바 위)에 있는지 본다
 */
function isInlineErrorVisible(anchor: HTMLElement | null): boolean {
  if (!anchor) return false;
  const rect = anchor.getBoundingClientRect();
  // 하단 바가 떠 있으면(모바일) 그 위까지만 보이는 영역이다. md 이상에서는 display:none이라 높이가 0이다
  const bar = document.querySelector<HTMLElement>("[data-quick-bar]")?.getBoundingClientRect();
  // 낮은 화면(max-height 480px)에서 바는 문서 흐름(static)에 놓여 뷰포트 아래에 있을 수 있으므로 뷰포트 높이를 넘지 않게 한다
  const visibleBottom = bar && bar.height > 0 ? Math.min(bar.top, window.innerHeight) : window.innerHeight;
  return rect.top >= 0 && rect.bottom <= visibleBottom;
}

export function TimerControls({ timerId, status, remainingSeconds, selectedAction, onActionChange, onModified, onTimerRemoved, quickActorRef, nicknamePromptRef, expired: expiredProp, disconnected, className }: TimerControlsProps) {
  const { toast } = useToast();
  const showModifiedToast = useUndoableModifyToast(timerId, onModified);
  const [actorName, setActorName] = useState("");
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [recentActors, setRecentActors] = useState<string[]>([]);
  const [defaultActor, setDefaultActor] = useState("");
  // 예약 타이머 '지금 시작'. 시간 조작 폼과 오류 문구가 섞이지 않도록 따로 둔다
  const [activating, setActivating] = useState(false);
  // 지금 시작은 되돌릴 수 없고(예약 시각이 사라짐) 드물게 쓰므로, 자주 쓰는 시간 조작과 달리 확인을 한 번 거친다
  const [confirmActivate, setConfirmActivate] = useState(false);
  const [activateError, setActivateError] = useState("");
  // 실패 시 입력을 되돌릴 때, 요청 중에 새로 입력한 값을 덮어쓰지 않도록 최신 입력을 들고 있는다
  const inputsRef = useRef({ hours, minutes, seconds });
  inputsRef.current = { hours, minutes, seconds };
  // 겹친 요청 중 먼저 실패한 쪽이 이미 대체된 금액을 되살리지 않도록 제출 순번을 센다
  const submitSeqRef = useRef(0);
  const [barCooldown, setBarCooldown] = useState(false);
  const barCooldownTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(barCooldownTimerRef.current), []);
  const actionGroupLabelId = useId();
  const submitHintId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const actorInputRef = useRef<HTMLInputElement>(null);
  // 닉네임 없이 바를 눌렀을 때 입력란 옆에 띄우는 안내. 닉네임을 입력하면 사라진다(누른 프리셋은 따로 기억하지 않는다)
  const [nicknamePrompt, setNicknamePrompt] = useState(false);
  // 글자 입력 칸에 포커스가 있는 동안 모바일 하단 바를 숨긴다(키보드 위로 떠서 입력란을 가리지 않게)
  const [typing, setTyping] = useState(false);
  // 추가/차감 토글에 포커스가 있는지. 만료로 토글이 사라질 때 포커스가 body로 떨어지지 않게 재시작 안내로 옮긴다
  const actionFocusedRef = useRef(false);
  const actionWrapperRef = useRef<HTMLDivElement>(null);
  const restartNoticeRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    setRecentActors(getRecentActors());
    const saved = getDefaultActor();
    setDefaultActor(saved);
    if (saved) {
      setActorName(saved);
    }
  }, []);

  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  // 만료(잔여 0)에서는 차감할 시간이 없으므로 세그먼트를 숨기고 '추가'로만 적용한다.
  // 선택 상태는 바꾸지 않고 실효 동작만 고정한다(바·카드·숫자키가 모두 이 값을 쓴다)
  const expired = status === "EXPIRED" || !!expiredProp;
  // 토글은 사용자 조작 없이(카운트다운이 0에 닿아) 사라질 수 있다. 그때 포커스가 토글 안이었으면 새로 나타난 안내로 옮긴다.
  // 지워진 노드의 blur는 브라우저마다 다르므로, 포커스가 이미 다른 곳으로 옮겨 갔으면 건드리지 않는다
  useLayoutEffect(() => {
    if (!expired || !actionFocusedRef.current) return;
    actionFocusedRef.current = false;
    const active = document.activeElement;
    if (active && active !== document.body && document.contains(active)) return;
    // 사용자가 보던 위치(기록·그래프)로 화면이 끌려가지 않게 스크롤은 하지 않는다
    restartNoticeRef.current?.focus({ preventScroll: true });
  }, [expired]);

  // 토글을 떠난 blur. relatedTarget이 있으면 그 자리에서 판단하고, 없으면(빈 곳 클릭·창 전환·노드 제거) 다음 틱에 본다.
  // 그때 토글이 아직 화면에 있고 포커스가 그 밖이면 실제로 떠난 것이다. 노드 제거로 생긴 blur는 같은 커밋의
  // layout effect가 먼저 처리하고 토글이 사라져 있으므로 건드리지 않는다. 창 전환은 activeElement가 radio로 남아 유지된다
  function handleActionBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (e.relatedTarget) {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) actionFocusedRef.current = false;
      return;
    }
    setTimeout(() => {
      const wrapper = actionWrapperRef.current;
      if (wrapper && wrapper.isConnected && !wrapper.contains(document.activeElement)) actionFocusedRef.current = false;
    }, 0);
  }
  const action: ModifyAction = expired ? "ADD" : selectedAction;
  const actionLabel = action === "ADD" ? "추가" : "차감";
  // 즉시 적용(모바일 하단 바·숫자 단축키)이 기록할 닉네임. 표시와 제출이 어긋나지 않도록 한 곳에서 정한다
  const quickActor = resolveQuickActor(actorName, defaultActor);
  if (quickActorRef) quickActorRef.current = quickActor;
  if (nicknamePromptRef) nicknamePromptRef.current = () => focusNickname(false);
  // 모바일 하단 바: 입력값이 있으면 프리셋 대신 그 값을 적용하는 제출 버튼 하나가 된다.
  // 제출은 폼(handleSubmit)이라 입력란의 닉네임이 있어야 하므로, 바의 캡션·활성도 그 이름을 따른다
  const barSubmits = totalSeconds > 0;
  const barActor = barSubmits ? actorName.trim() : quickActor;

  /**
   * 닉네임 입력란으로 안내한다. 누른 프리셋을 대기열에 두었다가 나중에 적용하지 않는다(기록은 실제 닉네임으로만).
   * withAlert: 입력란 옆 한 줄(role=alert). 숫자 단축키는 토스트가 같은 안내를 하므로 끈다
   */
  function focusNickname(withAlert: boolean) {
    const input = actorInputRef.current;
    if (withAlert) {
      setNicknamePrompt(true);
      // 같은 뜻의 폼 오류가 떠 있으면 내린다(입력란 아래 안내 한 줄만 남긴다)
      setError((prev) => (prev === NICKNAME_REQUIRED_MESSAGE ? "" : prev));
    }
    if (!input) return;
    input.focus();
    input.scrollIntoView?.({ block: "center" });
  }

  // 닉네임이 생기면 바 안내(role=alert)를 끈다. 입력·칩 어느 쪽으로 채워도 같은 규칙이라, 나중에 다시 비워도 안내가 되살아나지 않는다
  function changeActorName(name: string) {
    setActorName(name);
    if (name.trim()) setNicknamePrompt(false);
  }

  function setTime({ hours, minutes, seconds }: TimeParts) {
    setHours(hours);
    setMinutes(minutes);
    setSeconds(seconds);
  }

  // 60 이상의 분·초는 자르지 않고 윗자리로 올린다(90분 → 1시간 30분). 결과는 확인 버튼 라벨에 보인다
  function changeTime(field: keyof TimeParts, value: number) {
    const next = { hours, minutes, seconds, [field]: value };
    setTime(normalizeTimeParts(next.hours, next.minutes, next.seconds));
  }

  function addPreset(presetSeconds: number) {
    setTime(normalizeTimeParts(hours, minutes, seconds + presetSeconds));
  }

  /**
   * 실패는 한 곳에만 알린다. 폼에서 제출했고 오류 자리가 화면에 보이면 인라인(role=alert), 아니면 토스트.
   * 하단 바는 입력부와 떨어져 있어 늘 토스트다
   */
  function reportFailure(message: string, fromForm: boolean) {
    if (fromForm && isInlineErrorVisible(formRef.current?.querySelector<HTMLElement>("button[type=submit]") ?? null)) {
      setError(message);
    } else {
      toast(message, "error");
    }
  }

  async function submitModify(action: ModifyAction, delta: number, actor: string, fromForm: boolean) {
    setError("");

    const prevRemaining = remainingSeconds ?? 0;
    const optimisticRemaining = Math.max(0, prevRemaining + (action === "ADD" ? delta : -delta));

    // Optimistic UI: 즉시 갱신
    onModified?.({
      id: timerId,
      remainingSeconds: optimisticRemaining,
      status: optimisticRemaining > 0 ? "RUNNING" : (status ?? "RUNNING"),
      log: {} as TimerLogResponse,
    });

    // 입력 즉시 초기화 (실패하면 restoreInputs로 되돌린다)
    const submitted = { hours, minutes, seconds };
    const seq = ++submitSeqRef.current;
    saveRecentActor(actor);
    setRecentActors(getRecentActors());
    setHours(0);
    setMinutes(0);
    setSeconds(0);

    function restoreInputs() {
      if (seq !== submitSeqRef.current) return; // 이후 제출이 있으면 그 금액이 사용자 의도다
      const current = inputsRef.current;
      if (current.hours !== 0 || current.minutes !== 0 || current.seconds !== 0) return;
      setHours(submitted.hours);
      setMinutes(submitted.minutes);
      setSeconds(submitted.seconds);
    }

    // 백그라운드에서 서버 확정
    try {
      const res = await authFetch(`/api/timers/${timerId}/modify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, deltaSeconds: delta, actorName: actor }),
      });

      if (!res.ok) {
        // 롤백
        onModified?.({
          id: timerId,
          remainingSeconds: prevRemaining,
          status: status ?? "RUNNING",
          log: {} as TimerLogResponse,
        });
        restoreInputs();
        // 401은 세션 만료 안내(SessionExpiredHandler) 한 건만 띄운다. 여기서 또 알리면 그 안내를 덮는다
        if (res.status === 401) return;
        // 4xx는 서버가 이유를 알려 준다(만료된 타이머 차감 등, 다시 눌러도 안 된다). 5xx는 다시 시도하면 된다
        const json = (await res.json().catch(() => null)) as ApiErrorResponse | null;
        const message = res.status < 500 && json?.error?.message
          ? json.error.message
          : fromForm ? MODIFY_FAILED_FORM_MESSAGE : MODIFY_FAILED_QUICK_MESSAGE;
        reportFailure(message, fromForm);
        return;
      }

      const json = (await res.json()) as ApiSuccessResponse<TimerModifyResponse>;
      onModified?.(json.data); // 서버 값으로 확정
      // 폼·하단 바 공통: '+10분 · 닉네임' + 되돌리기. 결과 잔여는 카운트다운이 보여 준다
      showModifiedToast(json.data.log);
    } catch {
      // 롤백
      onModified?.({
        id: timerId,
        remainingSeconds: prevRemaining,
        status: status ?? "RUNNING",
        log: {} as TimerLogResponse,
      });
      restoreInputs();
      reportFailure(fromForm ? MODIFY_FAILED_FORM_MESSAGE : MODIFY_FAILED_QUICK_MESSAGE, fromForm);
    }
  }

  // 모바일 하단 바: 프리셋 탭 한 번으로 즉시 적용
  async function handleQuickApply(presetSeconds: number) {
    if (!quickActor) {
      focusNickname(true);
      return;
    }
    await submitModify(action, presetSeconds, quickActor, false);
  }

  // 바가 제출 버튼일 때(입력값이 있을 때). 제출은 입력란의 닉네임을 쓰므로 비어 있으면 프리셋과 같이 입력란으로 안내한다
  function handleBarSubmitClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (!actorName.trim()) {
      e.preventDefault();
      focusNickname(true);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!actorName.trim()) {
      // 바가 띄운 입력란 안내가 이미 같은 말을 하고 있으면 폼 오류를 겹쳐 띄우지 않는다
      if (!nicknamePrompt) setError(NICKNAME_REQUIRED_MESSAGE);
      return;
    }
    if (totalSeconds <= 0) {
      setError("시간은 1초 이상이어야 합니다.");
      return;
    }
    setBarCooldown(true);
    clearTimeout(barCooldownTimerRef.current);
    barCooldownTimerRef.current = setTimeout(() => setBarCooldown(false), BAR_SUBMIT_COOLDOWN_MS);
    await submitModify(action, totalSeconds, actorName.trim(), true);
  }

  function handleSetDefault() {
    const name = actorName.trim();
    if (name) {
      saveDefaultActor(name);
      setDefaultActor(name);
      toast("기본 닉네임이 설정되었습니다", "success");
    }
  }

  function handleClearDefault() {
    saveDefaultActor("");
    setDefaultActor("");
    toast("기본 닉네임이 해제되었습니다", "success");
  }

  // 낙관적 반영 없이 서버 확정 후에만 바꾼다. 응답은 modify와 같은 형태라 상위가 기록·그래프·목표를 새로 불러온다.
  // 이미 시작된 타이머(예약 시각 경과, 다른 탭)도 서버가 현재 상태로 200을 주므로 화면이 곧바로 실행 중으로 바뀐다
  async function handleActivate() {
    setConfirmActivate(false);
    setActivateError("");
    setActivating(true);
    try {
      const res = await authFetch(`/api/timers/${timerId}/activate`, { method: "POST" });
      if (res.status === 404 && onTimerRemoved) {
        onTimerRemoved();
        return;
      }
      // 401은 세션 만료 안내가 따로 뜬다
      if (res.status === 401) return;
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as ApiErrorResponse | null;
        setActivateError(json?.error?.message || "타이머를 시작하지 못했습니다.");
        return;
      }
      const json = (await res.json()) as ApiSuccessResponse<TimerModifyResponse>;
      onModified?.(json.data);
    } catch {
      setActivateError("타이머를 시작하지 못했습니다.");
    } finally {
      setActivating(false);
    }
  }

  if (status === "SCHEDULED") {
    return (
      <div className={cn("space-y-3", className)}>
        <p className="text-sm text-muted-foreground">
          시작 시각까지 기다리거나 지금 시작할 수 있습니다. 시작을 늦추려면 타이머를 삭제한 뒤 다시 만드세요.
        </p>
        <Button type="button" onClick={() => setConfirmActivate(true)} disabled={activating} aria-busy={activating}>
          지금 시작
        </Button>
        {activateError && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{activateError}</p>}
        <ConfirmDialog
          open={confirmActivate}
          title="지금 시작"
          description="예약 시각을 기다리지 않고 바로 카운트다운을 시작합니다. 시작한 뒤에는 예약 상태로 되돌릴 수 없습니다."
          confirmLabel="지금 시작"
          cancelLabel="돌아가기"
          onConfirm={handleActivate}
          onCancel={() => setConfirmActivate(false)}
        />
      </div>
    );
  }

  // 한국어 IME 조합 중에 누른 Enter는 글자 확정이지 제출이 아니다
  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Enter" && (e.nativeEvent.isComposing || e.keyCode === 229)) {
      e.preventDefault();
    }
  }

  // 포커스가 폼 밖으로 나가거나 버튼·토글로 옮겨 가면 바를 다시 보인다
  function handleFormFocus(e: React.FocusEvent<HTMLFormElement>) {
    setTyping(isTextEntry(e.target));
  }
  function handleFormBlur(e: React.FocusEvent<HTMLFormElement>) {
    if (!isTextEntry(e.relatedTarget) || !formRef.current?.contains(e.relatedTarget as Node)) setTyping(false);
  }

  const showNicknamePrompt = nicknamePrompt && !actorName.trim();

  return (
    // Enter로 제출한다. 오류 안내는 아래 role=alert 문구가 맡으므로 브라우저 기본 검증 말풍선은 끈다
    <form ref={formRef} noValidate onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} onFocus={handleFormFocus} onBlur={handleFormBlur} className={cn("space-y-5", className)}>
      {/* 만료 상태에서 추가는 곧 재시작이므로 결과를 한 줄로 미리 알린다 */}
      {/* tabIndex -1: 추가/차감 토글이 사라질 때 그 안에 있던 포커스를 받는다(Tab 순서에는 넣지 않는다) */}
      {expired && (
        <p ref={restartNoticeRef} tabIndex={-1} className="text-sm text-muted-foreground">
          시간을 추가하면 다시 시작됩니다
        </p>
      )}
      {/* 시청자 닉네임과 추가/차감은 넓은 화면에서 한 줄에 두어 조작 카드 높이를 줄인다. 만료면 닉네임만 */}
      <div className={cn("flex flex-col gap-5", !expired && "md:grid md:grid-cols-[minmax(0,1fr)_14rem] md:gap-4")}>
        <div>
          <Input
            ref={actorInputRef}
            label="시청자 닉네임"
            value={actorName}
            onChange={(e) => changeActorName(e.target.value)}
            required
            maxLength={50}
            autoComplete="off"
            placeholder={defaultActor ? `기본: ${defaultActor}` : "시간 변경을 요청한 시청자"}
          />
          {showNicknamePrompt && (
            <p className="mt-1.5 text-sm text-red-600 dark:text-red-400" role="alert">{NICKNAME_PROMPT_MESSAGE}</p>
          )}
          {/* 최근 닉네임 칩 */}
          {recentActors.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {recentActors.map((name) => {
                const isDefault = name === defaultActor;
                const isSelected = name === actorName;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => changeActorName(name)}
                    className={cn(
                      "rounded-full border px-3 py-2 text-xs cursor-pointer transition-colors",
                      isDefault
                        ? "border-accent text-accent hover:bg-accent/10"
                        : "border-border text-muted-foreground hover:bg-accent/10 hover:text-foreground",
                      isSelected && "bg-accent/10",
                    )}
                  >
                    {isDefault && <span className="mr-0.5">★</span>}
                    {name}
                  </button>
                );
              })}
            </div>
          )}
          {/* 버튼 터치 영역(px-2)만 넓히고 글자는 칩과 왼쪽 정렬을 맞춘다 */}
          <div className="mt-1.5 -ml-2 flex flex-wrap items-center gap-x-2">
            {/* 설명 문구와 구분되도록 글자색·밑줄로 버튼임을 드러낸다 */}
            {actorName.trim() && actorName.trim() !== defaultActor && (
              <button
                type="button"
                onClick={handleSetDefault}
                className="min-h-11 whitespace-nowrap px-2 text-xs font-medium text-foreground underline underline-offset-4 decoration-border-input hover:decoration-foreground transition-colors"
              >
                기본 닉네임으로 설정
              </button>
            )}
            {/* 기본 닉네임 안내는 그 버튼이 보이는 자리에서만, 버튼 아래 한 줄로(버튼 라벨과 한 문장처럼 이어지지 않게) */}
            {actorName.trim() && !defaultActor && (
              <p className="basis-full -mt-2 pl-2 text-xs text-muted-foreground">다음부터 입력 없이 바로 적용됩니다</p>
            )}
            {defaultActor && (
              <button
                type="button"
                onClick={handleClearDefault}
                className="min-h-11 whitespace-nowrap px-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                기본 닉네임 해제
              </button>
            )}
          </div>
        </div>

        {/* 추가/차감 토글. X 단축키는 포커스를 받는 라디오에 알려야 스크린리더가 읽는다. 만료면 추가만 되므로 숨긴다 */}
        {!expired && (
          <div
            ref={actionWrapperRef}
            onFocus={() => { actionFocusedRef.current = true; }}
            onBlur={handleActionBlur}
          >
            <span id={actionGroupLabelId} className="mb-1.5 block text-sm font-medium text-foreground">변경 유형</span>
            <SegmentedControl
              options={ACTION_OPTIONS}
              value={selectedAction}
              onChange={onActionChange}
              ariaLabelledBy={actionGroupLabelId}
            />
          </div>
        )}
      </div>

      {/* 시간 입력 */}
      <div>
        <span className="text-sm font-medium text-foreground">시간</span>

        {/* 프리셋은 입력값에 더하기만 하고, 적용은 아래 확인 버튼으로 한다(즉시 적용은 모바일 하단 바와 숫자 단축키).
            md 미만에서는 같은 프리셋이 하단 바에 있으므로 카드 쪽은 숨겨 한 벌만 남긴다 */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-2.5">
          <div className="hidden md:flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => addPreset(preset.seconds)}
                className="rounded-control border border-border px-3 py-2 min-h-[48px] min-w-[48px] text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:bg-muted disabled:hover:border-border disabled:hover:text-muted-foreground disabled:cursor-not-allowed"
              >
                +{preset.label}
              </button>
            ))}
          </div>

          {/* 직접 입력. 칸 폭을 고정하지 않고 줄 폭을 나눠 써서 320px에서도 가로로 넘치지 않게 한다
              (Input은 div로 감싸여 있어 flex 항목인 그 div에 flex-1·min-w-0을 준다) */}
          <div className="flex items-center gap-2 [&>div]:min-w-0 [&>div]:flex-1">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={hours}
              onChange={(e) => changeTime("hours", Number(e.target.value))}
              className="w-full text-center"
              aria-label="시간"
            />
            <span className="text-sm text-muted-foreground">시</span>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={minutes}
              onChange={(e) => changeTime("minutes", Number(e.target.value))}
              className="w-full text-center"
              aria-label="분"
            />
            <span className="text-sm text-muted-foreground">분</span>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={seconds}
              onChange={(e) => changeTime("seconds", Number(e.target.value))}
              className="w-full text-center"
              aria-label="초"
            />
            <span className="text-sm text-muted-foreground">초</span>
          </div>
        </div>
        {/* 확인 버튼이 비활성인 이유. 값을 넣으면 사라지고 버튼 라벨이 적용될 양을 보여 준다.
            연결이 끊긴 동안은 문구만 바꾼다(버튼은 막지 않는다. 눌러 실패하면 롤백·안내가 따른다) */}
        {disconnected ? (
          // 모바일에도 보인다. 바 캡션('즉시 적용 → 이름')은 모드 단서라 그대로 두고 이 줄이 안내한다
          <p id={submitHintId} className="mt-1 text-xs text-muted-foreground">
            {DISCONNECTED_HINT_MESSAGE}
          </p>
        ) : totalSeconds <= 0 && (
          <p id={submitHintId} className="mt-1 text-xs text-muted-foreground max-md:hidden">
            시간을 입력하면 {actionLabel}할 수 있습니다.
          </p>
        )}
      </div>

      {/* 에러 메시지 */}
      {error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}

      {/* 라벨은 늘 동작(동사)이고, 값이 있으면 적용될 양을 덧붙인다.
          md 미만에서는 하단 바가 같은 제출 버튼으로 바뀌므로 숨긴다(바 뒤에 가려지던 버튼). 폼의 Enter 제출은 그대로 된다 */}
      <Button
        type="submit"
        size="lg"
        variant={action === "SUBTRACT" ? "danger" : "primary"}
        disabled={totalSeconds <= 0}
        aria-describedby={totalSeconds <= 0 || disconnected ? submitHintId : undefined}
        className="w-full max-md:hidden"
      >
        {totalSeconds > 0 ? `시간 ${actionLabel} (${formatDelta(totalSeconds)})` : `시간 ${actionLabel}`}
      </Button>

      {/* 모바일 하단 고정 빠른 액션 바 */}
      {/* data-quick-bar: 바가 있을 때 body 하단 여백을 잡는다(globals.css). 낮은 화면(max-height 480px)에서는 문서 흐름에 놓인다.
          글자 입력 칸에 포커스가 있는 동안은 숨긴다(언마운트하지 않아 하단 여백은 그대로라 화면이 튀지 않는다) */}
      <div data-quick-bar className={cn("md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-sm px-4 py-3 safe-area-bottom", typing && "hidden")}>
        {/* grid-cols-3 = repeat(3, minmax(0, 1fr)): 좁은 폭에서도 버튼이 바 밖으로 밀리지 않는다.
            값이 0이면 프리셋 세 개(탭 한 번에 바로 적용), 값이 있으면 그 값을 적용하는 제출 버튼 하나(같은 높이) */}
        <div className="grid grid-cols-3 gap-2">
          {(barSubmits
            ? [{ key: "submit", label: `시간 ${actionLabel} (${formatDelta(totalSeconds)})`, seconds: totalSeconds }]
            : PRESETS.map((preset) => ({ key: preset.label, label: `${action === "SUBTRACT" ? "-" : "+"}${preset.label}`, seconds: preset.seconds }))
          ).map((item) => (
            // 닉네임이 없어도 막지 않는다. 누르면 닉네임 입력란으로 안내한다
            <button
              key={item.key}
              type={barSubmits ? "submit" : "button"}
              disabled={!barSubmits && barCooldown}
              onClick={barSubmits ? handleBarSubmitClick : () => handleQuickApply(item.seconds)}
              className={cn(
                "rounded-lg py-3 min-h-[48px] text-sm font-bold transition-colors disabled:opacity-50",
                barSubmits && "col-span-3",
                action === "ADD"
                  ? "bg-green-700 text-white hover:bg-green-800 active:bg-green-900"
                  : "bg-red-600 text-white hover:bg-red-700 active:bg-red-800",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        {/* 확인 없이 바로 적용되고, 누구 이름으로 기록되는지 항상 보여 준다(모드의 색 외 단서라 연결이 끊겨도 바꾸지 않는다) */}
        <p className="mt-1.5 truncate text-center text-xs text-muted-foreground">
          {barActor ? `즉시 적용 → ${barActor}` : "즉시 적용 → 닉네임 칸의 이름"}
        </p>
      </div>
    </form>
  );
}

function formatDelta(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}시간`);
  if (m > 0) parts.push(`${m}분`);
  if (s > 0) parts.push(`${s}초`);
  return parts.join(" ");
}
