"use client";

import { useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { CountdownDisplay } from "@/components/timer/CountdownDisplay";
import { TimerControls, MODIFY_FAILED_QUICK_MESSAGE } from "@/components/timer/TimerControls";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { FormDialog } from "@/components/ui/FormDialog";
import { useToast } from "@/components/ui/Toast";
import { cn, formatDateTime, formatLogTime, displayActorName, formatDeltaSeconds } from "@/lib/utils";
import { RemainingChart } from "@/components/graph/RemainingChart";
import { useKeyboardShortcuts, SHORTCUT_HELP } from "@/hooks/useKeyboardShortcuts";
import { usePolling } from "@/hooks/usePolling";
import { useCountdownEnded } from "@/hooks/useCountdownEnded";
import { useUndoableModifyToast } from "@/hooks/useUndoableModifyToast";
import { authFetch, isSessionExpired } from "@/lib/auth-fetch";
import { hasExternalChange, type SyncedTimerSnapshot } from "@/lib/timer-sync";
import { connectionLostAgo } from "@/lib/connection-status";
import type {
  ApiSuccessResponse,
  ApiErrorResponse,
  TimerDetailResponse,
  TimerModifyResponse,
  ModifyAction,
  TimerLogsResponse,
  TimerLogResponse,
  ActionType,
  GraphResponse,
} from "@/types";

const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  CREATE: "생성",
  ADD: "추가",
  SUBTRACT: "차감",
  EXPIRE: "만료",
  REOPEN: "재시작",
  ACTIVATE: "활성화",
  DELETE: "삭제",
};

const ACTION_TYPE_BADGE_VARIANT: Record<ActionType, "create" | "add" | "subtract" | "expire" | "reopen" | "activate" | "delete"> = {
  CREATE: "create",
  ADD: "add",
  SUBTRACT: "subtract",
  EXPIRE: "expire",
  REOPEN: "reopen",
  ACTIVATE: "activate",
  DELETE: "delete",
};

// 필터는 보는 사람이 찾는 단위로 세 묶음만 둔다. 삭제(DELETE)된 타이머는 기록 자체를 볼 수 없어 칩이 필요 없다
const FILTER_GROUPS: { label: string; actions: ActionType[] }[] = [
  { label: "추가", actions: ["ADD"] },
  { label: "차감", actions: ["SUBTRACT"] },
  { label: "기타", actions: ["CREATE", "EXPIRE", "REOPEN", "ACTIVATE"] },
];

// 접힌 기록은 방금 일어난 일만 확인하는 용도라 몇 건만 보여 준다. 펼치면 필터와 페이지가 생긴다
const RECENT_LOG_LIMIT = 5;
const FULL_LOG_LIMIT = 20;

/**
 * 연결 끊김 배지. 경과 시간 문구만 1초마다 바뀌도록 따로 둔다(끊겼을 때만 마운트).
 * 좁은 화면에서는 경과 문구를 빼서 '실행 중' 배지처럼 카운트다운 옆 한 줄에 남게 한다(아래 내용이 밀리지 않게)
 */
function ConnectionLostBadge({ lastSyncedAtMs, className }: { lastSyncedAtMs: number | null; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const ago = connectionLostAgo(lastSyncedAtMs, now);
  return (
    <Badge variant="disconnected" className={cn("tabular-nums", className)}>
      연결 끊김{ago && <span className="hidden sm:inline"> · {ago}</span>}
    </Badge>
  );
}

/** 오류 상태인 기록·그래프를 폴링 성공 때 다시 불러오는 최소 간격(목표의 30초 재요청과 같다) */
const ERROR_RETRY_INTERVAL_MS = 30_000;

/** 폴링 한 번의 응답 대기 한도. 넘으면 실패 1회로 센다 */
const POLL_TIMEOUT_MS = 10_000;

/** 첫 화면에서 기록·그래프를 타이머 상세 뒤로 더 기다리는 한도. 넘으면 시간 카드를 먼저 그리고 콘솔이 다시 부른다 */
const SNAPSHOT_EXTRA_WAIT_MS = 500;

/** 콘솔이 첫 화면에 그리는 데이터. 상위 화면이 미리 받아 넘기면 골격 다음 한 번에 그린다(기록·그래프가 뒤늦게 채워지지 않게) */
export interface ConsoleSnapshot {
  timer: TimerDetailResponse;
  /** 접힌 '최근 기록'의 첫 페이지. 받지 못했으면 null이고 콘솔이 다시 부른다 */
  logs: TimerLogsResponse | null;
  /** 잔여 시간 추이. 받지 못했으면 null이고 콘솔이 다시 부른다 */
  graph: GraphResponse | null;
}

function recentLogsQuery() {
  return new URLSearchParams({ page: "1", limit: String(RECENT_LOG_LIMIT) });
}

/**
 * 콘솔 첫 화면 데이터를 함께 받는다. 세 요청은 함께 떠나 보통 같이 도착한다.
 * 타이머가 없으면(404) "removed", 상세를 받지 못하면 null(콘솔이 직접 다시 부르고 실패하면 오류를 보인다).
 * 기록·그래프가 상세보다 많이 늦으면 기다리지 않는다. 방송 중 주 조작(시간 카드)을 부가 정보 때문에 늦추지 않기 위해서다
 */
export async function loadConsoleSnapshot(timerId: string): Promise<ConsoleSnapshot | "removed" | null> {
  const data = async <T,>(request: Promise<Response>): Promise<T | null> => {
    try {
      const res = await request;
      return res.ok ? ((await res.json()) as ApiSuccessResponse<T>).data : null;
    } catch {
      return null;
    }
  };
  const logs = data<TimerLogsResponse>(authFetch(`/api/timers/${timerId}/logs?${recentLogsQuery()}`));
  const graph = data<GraphResponse>(authFetch(`/api/timers/${timerId}/graph?mode=remaining`));
  let res: Response;
  try {
    res = await fetch(`/api/timers/${timerId}`);
  } catch {
    return null;
  }
  if (res.status === 404) return "removed";
  if (!res.ok) return null;
  const timer = ((await res.json()) as ApiSuccessResponse<TimerDetailResponse>).data;
  const late = new Promise<null>((resolve) => setTimeout(() => resolve(null), SNAPSHOT_EXTRA_WAIT_MS));
  const [firstLogs, firstGraph] = await Promise.all([Promise.race([logs, late]), Promise.race([graph, late])]);
  return { timer, logs: firstLogs, graph: firstGraph };
}

interface TimerConsoleProps {
  timerId: string;
  /** 상위 화면이 `loadConsoleSnapshot`으로 미리 받은 첫 화면 데이터. 있으면 그 부분은 다시 부르지 않고 바로 그린다. 없으면 직접 불러온다 */
  initialSnapshot?: ConsoleSnapshot | null;
  isOwner: boolean;
  /** 시간 카드 옆(소유자가 아니면 카운트다운 아래)에 둘 영역. 프로젝트 화면은 목표를 넣는다 */
  aside?: ReactNode;
  /** 시간이 바뀌었을 때(여기서 조작했거나 다른 기기에서 바뀌었을 때). 목표 진행률처럼 시간에 딸린 데이터를 다시 불러오는 데 쓴다 */
  onTimeChanged?: () => void;
  /** 다른 탭·기기에서 타이머가 삭제돼 폴링이 404를 받았을 때. 상위 화면이 '타이머 없음' 상태로 바꾼다 */
  onTimerRemoved?: () => void;
}

export function TimerConsole({ timerId, initialSnapshot, isOwner, aside, onTimeChanged, onTimerRemoved }: TimerConsoleProps) {
  const { toast } = useToast();
  // 마운트 때의 값만 쓴다(상위가 나중에 넘기는 값으로 상태를 덮거나 다시 부르지 않는다)
  const [snapshot] = useState(initialSnapshot ?? null);

  const [timer, setTimer] = useState<TimerDetailResponse | null>(snapshot?.timer ?? null);
  // 시간 추가·차감(낙관적 반영 포함)·되돌리기로 스냅샷이 바뀐 횟수. 응답에 updatedAt이 없어 종료 예정 시각을 다시 잡는 신호로 쓴다
  const [modifySeq, setModifySeq] = useState(0);
  const [loading, setLoading] = useState(!snapshot);
  const [error, setError] = useState(false);

  // 기록
  const [logsExpanded, setLogsExpanded] = useState(false);
  // null은 아직 받지 못한 상태다. 빈 배열(받았는데 0건)과 구분해 실패를 '기록이 없습니다'로 가리지 않는다
  const [logs, setLogs] = useState<TimerLogResponse[] | null>(snapshot?.logs?.logs ?? null);
  const [logsError, setLogsError] = useState(false);
  const [logPage, setLogPage] = useState(1);
  const [logTotalPages, setLogTotalPages] = useState(snapshot?.logs?.pagination.totalPages ?? 1);
  const [activeFilters, setActiveFilters] = useState<Set<ActionType>>(new Set());
  const [logsLoading, setLogsLoading] = useState(false);
  // 타이머 전체에 CREATE 외 기록이 없는지. 필터 없는 첫 페이지(최신순이라 CREATE뿐이면 그게 전부다)를 받을 때만 갱신해,
  // 펼친 기록의 페이지 이동·필터 결과에 따라 바뀌지 않게 한다. null은 아직 모른다
  const [logsBaseEmpty, setLogsBaseEmpty] = useState<boolean | null>(
    snapshot?.logs ? snapshot.logs.logs.every((log) => log.actionType === "CREATE") : null,
  );

  // 그래프(잔여 시간 추이. 누적 변경량은 통계 페이지에 있다). 받은 것이 없으면 마운트하자마자 불러오므로 로딩으로 시작해
  // 첫 화면부터 그래프 상자가 제 높이(h-64)를 갖는다(빈 상자 → 스피너로 커지며 아래를 밀지 않게)
  const [graphData, setGraphData] = useState<GraphResponse | null>(snapshot?.graph ?? null);
  const [graphLoading, setGraphLoading] = useState(!snapshot?.graph);
  const [graphError, setGraphError] = useState(false);

  // 추가/차감 방향. 세그먼트, 프리셋 라벨, 단축키가 이 상태 하나를 공유한다
  const [selectedAction, setSelectedAction] = useState<ModifyAction>("ADD");

  // 상위 화면은 렌더마다 새 콜백을 넘긴다. 첫 로드 effect가 의존하는 fetchTimer의 의존성에 넣으면
  // 렌더마다 첫 로드를 다시 하므로 ref로 최신 콜백만 읽는다
  const onTimerRemovedRef = useRef(onTimerRemoved);
  onTimerRemovedRef.current = onTimerRemoved;

  const fetchTimer = useCallback(async () => {
    try {
      const res = await fetch(`/api/timers/${timerId}`);
      // 목록을 받은 뒤 첫 조회 전에 다른 곳에서 삭제됐을 수 있다. 오류 화면 대신 '타이머 없음'으로 보낸다
      if (res.status === 404 && onTimerRemovedRef.current) {
        onTimerRemovedRef.current();
        return;
      }
      if (!res.ok) {
        setError(true);
        return;
      }
      const json = (await res.json()) as ApiSuccessResponse<TimerDetailResponse>;
      setTimer(json.data);
      setError(false);
    } catch {
      setError(true);
    }
  }, [timerId]);

  // silent: 폴링이 부르는 백그라운드 갱신. 로딩 표시 없이 기존 목록을 둔 채 새 데이터로 바꾸고, 실패해도 보이던 목록을 오류로 바꾸지 않는다.
  // 직접 부른 조회(첫 로드·필터·페이지·펼침·다시 시도)가 실패하면 다른 조건의 목록이 남지 않게 비우고 오류 줄을 띄운다.
  // 비-ok 응답과 예외는 같은 실패다. 세션 만료는 그 안내가 맡는다(이 GET은 공개라 보통 오지 않는다)
  // 요청이 겹치면(폴링·조작·필터 변경) 가장 나중에 보낸 요청의 결과만 반영한다. 늦게 도착한 옛 조건의 응답이
  // 새 조건의 오류·목록을 덮지 않게 하기 위해서다. 로딩 표시는 끝나지 않은 직접 조회가 남아 있는 동안 유지한다
  const logsSeqRef = useRef(0);
  const logsPendingRef = useRef(0);
  const fetchLogs = useCallback(async (page: number, filters: Set<ActionType>, expanded: boolean, { silent = false } = {}) => {
    // 직접 조회가 진행 중이면 백그라운드 갱신은 건너뛴다. 그 조회가 최신 조건의 결과(또는 오류)를 가져온다
    if (silent && logsPendingRef.current > 0) return;
    const seq = ++logsSeqRef.current;
    if (!silent) {
      logsPendingRef.current += 1;
      setLogsLoading(true);
    }
    const fail = () => {
      if (silent || seq !== logsSeqRef.current) return;
      setLogs(null);
      setLogsError(true);
    };
    try {
      const params = expanded
        ? new URLSearchParams({ page: String(page), limit: String(FULL_LOG_LIMIT) })
        : recentLogsQuery();
      if (expanded && filters.size > 0) {
        params.set("actionType", Array.from(filters).join(","));
      }
      const res = await authFetch(`/api/timers/${timerId}/logs?${params}`);
      if (res.ok) {
        const json = (await res.json()) as ApiSuccessResponse<TimerLogsResponse>;
        if (seq !== logsSeqRef.current) return;
        setLogs(json.data.logs);
        if (!(expanded && filters.size > 0) && (!expanded || page === 1)) {
          setLogsBaseEmpty(json.data.logs.every((log) => log.actionType === "CREATE"));
        }
        setLogTotalPages(json.data.pagination.totalPages);
        setLogsError(false);
      } else if (!isSessionExpired(res)) {
        fail();
      }
    } catch {
      fail();
    } finally {
      if (!silent) {
        logsPendingRef.current -= 1;
        if (logsPendingRef.current === 0) setLogsLoading(false);
      }
    }
  }, [timerId]);

  // silent: 폴링이 부르는 백그라운드 갱신. 스피너를 띄우지 않고, 실패해도 보이던 그래프를 오류 문구로 바꾸지 않는다
  const fetchGraph = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setGraphLoading(true);
      setGraphError(false);
    }
    try {
      const res = await authFetch(`/api/timers/${timerId}/graph?mode=remaining`);
      if (res.ok) {
        const json = (await res.json()) as ApiSuccessResponse<GraphResponse>;
        setGraphData(json.data);
        setGraphError(false);
      } else if (!silent && !isSessionExpired(res)) {
        setGraphError(true);
      }
    } catch {
      if (!silent) setGraphError(true);
    } finally {
      if (!silent) setGraphLoading(false);
    }
  }, [timerId]);

  // 상위가 넘긴 데이터가 있으면 그 부분의 첫 조회를 건너뛴다
  useEffect(() => {
    if (snapshot) return;
    async function load() {
      await fetchTimer();
      setLoading(false);
    }
    load();
  }, [snapshot, fetchTimer]);

  // 조건(페이지·필터·펼침)이 바뀔 때 부른다. 마지막으로 부른 조건과 같으면 다시 부르지 않는다
  // (넘겨받은 첫 기록과 같은 조건의 첫 실행, 개발 모드에서 effect가 두 번 도는 경우)
  const logsQueryKeyRef = useRef<string | null>(snapshot?.logs ? "1||false" : null);
  useEffect(() => {
    const key = `${logPage}|${Array.from(activeFilters).sort().join(",")}|${logsExpanded}`;
    if (logsQueryKeyRef.current === key) return;
    logsQueryKeyRef.current = key;
    fetchLogs(logPage, activeFilters, logsExpanded);
  }, [logPage, activeFilters, logsExpanded, fetchLogs]);

  useEffect(() => {
    if (snapshot?.graph) return;
    fetchGraph();
  }, [snapshot, fetchGraph]);

  // 폴링: 서버 동기화
  const pollInterval = timer?.status === "RUNNING" ? 5000 : 15000;

  // 화면에 마지막으로 반영한 값과 그 시각. 폴링 값이 다른 기기의 변경인지 판단하는 기준이다
  const syncedRef = useRef<SyncedTimerSnapshot | null>(null);
  useEffect(() => {
    syncedRef.current = timer
      ? { status: timer.status, remainingSeconds: timer.remainingSeconds, syncedAtMs: Date.now() }
      : null;
  }, [timer]);

  // 실패(네트워크 오류·5xx)는 잡지 않고 reject로 넘긴다. 화면은 마지막 값으로 로컬 카운트를 이어 가고,
  // 연속 실패 횟수는 usePolling이 세어 연결 상태로 돌려준다
  const errorRetryAtRef = useRef(0);
  const pollTimer = useCallback(async () => {
    // 응답 없이 멈춘 요청(연결은 살아 있는데 패킷이 안 오는 경우)도 실패로 세도록 시간 제한을 둔다
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), POLL_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`/api/timers/${timerId}`, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (res.status === 404) {
      onTimerRemovedRef.current?.();
      return;
    }
    // 5xx 등은 서버 값을 받지 못한 것이라 실패로 알린다. 연속 실패가 쌓이면 배지가 '연결 끊김'으로 바뀐다
    if (!res.ok) throw new Error(`poll ${res.status}`);
    const json = (await res.json()) as ApiSuccessResponse<TimerDetailResponse>;
    const serverData = json.data;
    const synced = syncedRef.current;
    const externalChange = !!synced && hasExternalChange(synced, serverData, Date.now());

    setTimer((prev) => {
      if (!prev) return prev;
      if (prev.status !== serverData.status) {
        return serverData;
      }
      if (prev.status === "RUNNING") {
        const diff = Math.abs(prev.remainingSeconds - serverData.remainingSeconds);
        // updatedAt이 바뀌었으면(다른 기기의 시간 조작) 작은 차이여도 스냅샷을 받아 종료 예정 시각을 다시 잡게 한다
        if (diff >= 2 || prev.updatedAt !== serverData.updatedAt) {
          return { ...prev, remainingSeconds: serverData.remainingSeconds, updatedAt: serverData.updatedAt };
        }
      }
      return prev;
    });

    // 상태 전이(만료 등)나 다른 기기의 조작이 있을 때만 기록·그래프·목표를 다시 불러온다.
    // 펼친 기록의 2페이지 이후를 보고 있으면 목록이 밀리지 않게 기록은 건너뛴다
    if (externalChange) {
      if (logPage === 1) fetchLogs(1, activeFilters, logsExpanded, { silent: true });
      fetchGraph({ silent: true });
      onTimeChanged?.();
      return;
    }
    // 기록·그래프가 오류 상태면 서버가 응답하는 지금 조용히 다시 불러온다. 성공하면 오류 줄이 사라진다.
    // 계속 실패하는 엔드포인트를 폴링마다 두드리지 않게 목표와 같은 30초 간격으로만 한다
    if ((logsError || graphError) && Date.now() - errorRetryAtRef.current >= ERROR_RETRY_INTERVAL_MS) {
      errorRetryAtRef.current = Date.now();
      if (logsError) fetchLogs(logPage, activeFilters, logsExpanded, { silent: true });
      if (graphError) fetchGraph({ silent: true });
    }
  }, [timerId, logPage, activeFilters, logsExpanded, logsError, graphError, fetchLogs, fetchGraph, onTimeChanged]);

  const connection = usePolling({
    fn: pollTimer,
    interval: pollInterval,
    enabled: !loading && !error && !!timer,
  });

  // 연결이 돌아오면(끊김 → 복원) 끊긴 동안 실패했을 수 있는 기록·그래프·목표를 함께 다시 불러온다.
  // 성공하면 오류 줄이 저절로 사라지고, 다시 실패해도 보이던 데이터는 그대로 둔다(silent)
  const wasDisconnectedRef = useRef(false);
  useEffect(() => {
    const wasDisconnected = wasDisconnectedRef.current;
    wasDisconnectedRef.current = connection.disconnected;
    if (!wasDisconnected || connection.disconnected) return;
    // 펼친 기록의 2페이지 이후를 보고 있으면 목록이 밀리지 않게 오류일 때만 다시 불러온다(폴링의 규칙과 같다)
    if (logPage === 1 || logsError) fetchLogs(logPage, activeFilters, logsExpanded, { silent: true });
    fetchGraph({ silent: true });
    onTimeChanged?.();
    // 전이 시점에만 부른다. 나머지 값은 그 순간의 것을 읽으면 된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.disconnected]);

  function handleModified(data: TimerModifyResponse) {
    setModifySeq((n) => n + 1);
    setTimer((prev) =>
      prev
        ? { ...prev, remainingSeconds: data.remainingSeconds, status: data.status }
        : prev,
    );
    // optimistic 호출(log.id 없음)에서는 기록·그래프·목표 갱신 생략
    if (data.log?.id) {
      // 서버가 새 ADD/SUBTRACT 기록을 만들었으므로 '생성 기록뿐'이라는 판정을 먼저 푼다. 아래 silent 갱신이 실패하거나
      // 건너뛰어져도 '전체 기록'이 계속 숨지 않게 한다(폴링은 같은 서버 상태라 복구해 주지 않는다).
      // 되돌리기로 다시 CREATE뿐이 되면 이어지는 성공한 조회가 다시 판정한다
      setLogsBaseEmpty(false);
      // silent: 갱신이 실패해도 방금까지 보이던 목록을 오류 줄로 바꾸지 않는다(오류 상태였다면 성공 시 풀린다)
      fetchLogs(1, activeFilters, logsExpanded, { silent: true });
      setLogPage(1);
      fetchGraph();
      onTimeChanged?.();
    }
  }

  // 단축키 성공 토스트('+10분 · 닉네임' + 되돌리기). 되돌린 결과도 handleModified로 반영해 기록·그래프·목표를 다시 불러온다
  const showModifiedToast = useUndoableModifyToast(timerId, handleModified);

  // 숫자 단축키가 기록할 닉네임. 시간 카드(TimerControls)가 모바일 하단 바와 같은 규칙으로 렌더마다 채운다
  // (입력란의 이름 우선, 비면 기본 닉네임). 단축키 핸들러가 다시 만들어지지 않도록 ref로 들고 있는다
  const quickActorRef = useRef("");
  // 닉네임 없이 숫자키를 눌렀을 때 입력란으로 포커스를 옮기는 함수. TimerControls가 렌더마다 채운다
  const nicknamePromptRef = useRef<(() => void) | null>(null);

  // 카운트다운이 0에 닿으면 다음 폴링을 기다리지 않고 배지를 '만료'로 보여 준다
  const countdownEnded = useCountdownEnded(timer?.remainingSeconds, timer?.status);
  // 만료(잔여 0)면 차감할 시간이 없으므로 숫자키·바·카드 모두 '추가'로만 적용한다
  const expired = countdownEnded || timer?.status === "EXPIRED";
  // 만료로 들어가면 선택도 '추가'로 되돌린다. 숨긴 세그먼트의 '차감'을 남겨 두면 '+'로 재시작한 직후 같은 자리
  // 바 버튼이 '−'로 바뀌어, 연달아 누른 두 번째 탭이 방금 더한 시간을 빼 버린다. 효과가 돌기 전 렌더는 아래 강제값이 맡는다
  useEffect(() => {
    if (expired) setSelectedAction("ADD");
  }, [expired]);
  const effectiveAction: ModifyAction = expired ? "ADD" : selectedAction;

  // 키보드 단축키 핸들러
  const handleKeyboardPreset = useCallback(async (seconds: number) => {
    if (!isOwner || !timer || timer.status === "SCHEDULED") return;
    const actor = quickActorRef.current;
    if (actor) {
      try {
        const res = await authFetch(`/api/timers/${timerId}/modify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: effectiveAction, deltaSeconds: seconds, actorName: actor }),
        });
        if (res.ok) {
          const json = (await res.json()) as ApiSuccessResponse<TimerModifyResponse>;
          handleModified(json.data);
          showModifiedToast(json.data.log);
        } else if (!isSessionExpired(res)) {
          // 세션 만료는 그 안내가 따로 뜬다. 4xx는 서버가 이유를 알려 주고, 5xx는 다시 누르면 된다
          const json = (await res.json().catch(() => null)) as ApiErrorResponse | null;
          toast(res.status < 500 && json?.error?.message ? json.error.message : MODIFY_FAILED_QUICK_MESSAGE, "error");
        }
      } catch {
        toast(MODIFY_FAILED_QUICK_MESSAGE, "error");
      }
    } else {
      // 누른 키를 기억해 두었다 나중에 적용하지 않는다. 입력란으로 보내고 한 문장만 알린다
      // (기본 닉네임 안내는 그 버튼이 보이는 입력란 옆 한 줄이 맡는다)
      nicknamePromptRef.current?.();
      toast("닉네임을 먼저 입력하세요", "info");
    }
    // handleModified가 읽는 기록 상태(필터, 펼침)가 바뀌면 다시 만들어 오래된 값으로 기록을 불러오지 않게 한다
  }, [isOwner, timer, toast, showModifiedToast, timerId, effectiveAction, activeFilters, logsExpanded]);

  // 만료 중에는 세그먼트가 없으므로 X로 보이지 않는 선택을 바꾸지 않는다
  const handleToggleAction = useCallback(() => {
    if (expired) return;
    setSelectedAction((prev) => (prev === "ADD" ? "SUBTRACT" : "ADD"));
  }, [expired]);

  const handleRefresh = useCallback(() => {
    fetchTimer();
    fetchLogs(logPage, activeFilters, logsExpanded);
    fetchGraph();
    onTimeChanged?.();
  }, [fetchTimer, fetchLogs, fetchGraph, onTimeChanged, logPage, activeFilters, logsExpanded]);

  const shortcutsEnabled = isOwner && !!timer && timer.status !== "SCHEDULED";
  const { showHelp, setShowHelp } = useKeyboardShortcuts({
    enabled: shortcutsEnabled,
    onPreset: handleKeyboardPreset,
    onToggleAction: handleToggleAction,
    onRefresh: handleRefresh,
  });

  const isFilterOn = (actions: ActionType[]) => actions.every((a) => activeFilters.has(a));

  function toggleFilter(actions: ActionType[]) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      const on = actions.every((a) => next.has(a));
      for (const a of actions) {
        if (on) next.delete(a);
        else next.add(a);
      }
      return next;
    });
    setLogPage(1);
  }

  function toggleLogsExpanded() {
    setLogsExpanded((prev) => !prev);
    setLogPage(1);
    setActiveFilters(new Set());
  }

  // 보통은 상위 화면이 상세를 넘겨 이 단계가 없다(골격은 상위의 ProjectDetailSkeleton 하나).
  // 상위가 받지 못했을 때만 여기서 불러오며, 그동안 두 번째 골격을 그리지 않고 자리만 둔다
  if (loading) {
    return <div aria-busy="true" />;
  }

  if (error || !timer) {
    return (
      <ErrorState
        message="타이머 정보를 불러오지 못했습니다."
        onRetry={async () => { setLoading(true); await fetchTimer(); setLoading(false); }}
      />
    );
  }

  // 예약 상태의 시간 카드는 안내와 버튼 하나뿐이라 제목을 숨긴다. 만료 상태는 재시작 안내와 입력 폼이 모두 보이므로 제목을 둔다
  const hideControlsHeading = timer.status === "SCHEDULED" && !expired;
  const showControlsHeader = !hideControlsHeading || shortcutsEnabled;
  // 기록이 아직 하나도 없다: 타이머 전체에 0건이거나 생성(CREATE) 행뿐이다(logsBaseEmpty).
  // 타이머는 만들 때 CREATE 기록이 항상 생기므로 0건만 보면 이 분기에 닿지 못한다. 시간을 한 번도 바꾸지 않았으면 '없음'으로 본다.
  // 오류에는 해당하지 않고, 이미 펼친 뒤에는 숨기지 않는다(누른 '접기'가 사라지면 포커스를 잃고, 필터 결과 0건에도 칩이 있어야 풀 수 있다)
  const noLogsYet = logsBaseEmpty === true && !logsError && !logsExpanded;
  // '전체 기록'은 기록이 있다고 확인된 뒤에 보인다. 판정 전(첫 조회 중)에 그렸다가 생성 기록뿐이라 지우면 깜빡인다.
  // 버튼은 제목 줄(24px)을 키우지 않으므로 늦게 나타나도 아래가 밀리지 않는다
  const showLogsToggle = logsExpanded || logsError || logsBaseEmpty === false;

  const displayStatus = countdownEnded ? "EXPIRED" : timer.status;
  const statusBadgeVariant = displayStatus === "SCHEDULED" ? "scheduled" : displayStatus === "RUNNING" ? "running" : "expired";
  const statusLabel = displayStatus === "SCHEDULED" ? "예약됨" : displayStatus === "RUNNING" ? "실행 중" : "만료";

  return (
    <div className="space-y-8">
      {/* 카운트다운 */}
      {/* 배지는 숫자와 같은 행에 둔다. 좁은 폭에서 줄바꿈돼도 숫자 바로 아래, 보조 문구('종료 예정')보다 위에 붙는다 */}
      <CountdownDisplay
        remainingSeconds={timer.remainingSeconds}
        status={timer.status}
        snapshotKey={`${timer.updatedAt}:${modifySeq}`}
        scheduledStartAt={timer.scheduledStartAt}
        size="large"
        aside={
          // 연결이 끊기면 서버 상태를 알 수 없으므로 상태 배지 자리를 연결 끊김으로 바꾼다. 숫자는 로컬 추정값으로 계속 흐른다
          connection.disconnected ? (
            <ConnectionLostBadge lastSyncedAtMs={connection.lastSuccessAtMs} className="mt-2" />
          ) : (
            <Badge variant={statusBadgeVariant} className="mt-2">
              {statusLabel}
            </Badge>
          )
        }
      />

      {/* 시간 + 곁 영역(목표). 아래 기록·그래프 행과 같은 3:2 트랙·gap-5라 열 경계가 위아래로 맞는다. 방송 중 가장 자주 쓰는 두 가지를 첫 화면에 나란히 둔다 */}
      {(isOwner || aside) && (
        <div className={cn("grid gap-x-5 gap-y-8", isOwner && !!aside && "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start")}>
          {isOwner && (
            <section
              aria-labelledby={hideControlsHeading ? undefined : "timer-controls-heading"}
              aria-label={hideControlsHeading ? "시간" : undefined}
              className="rounded-card border border-border bg-background p-5"
            >
              {/* 단축키가 있다는 사실을 '?'를 몰라도 알 수 있게, 도움말로 가는 진입점을 제목 줄에 하나만 둔다.
                  키보드가 있는 포인터 기기에서만 보인다(터치 기기에서는 단축키를 쓸 수 없다).
                  예약·만료 상태의 내용은 안내와 버튼 하나뿐이라 제목은 숨긴다(상태는 배지·보조 문구가 알린다) */}
              {showControlsHeader && (
                <div
                  className={cn(
                    "items-center gap-3",
                    // 터치 기기에서는 버튼만 있는 줄 전체를 접어 빈 줄 높이가 생기지 않게 한다
                    hideControlsHeading ? "hidden justify-end pointer-fine:flex" : "flex justify-between",
                  )}
                >
                  {!hideControlsHeading && (
                    <h2 id="timer-controls-heading" className="text-base font-semibold text-foreground">시간</h2>
                  )}
                  {shortcutsEnabled && (
                    // Button 기본 클래스에 inline-flex가 있어 같은 요소에 hidden을 두면 진다. 표시 여부는 래퍼가 정한다
                    <span className="hidden pointer-fine:inline-flex">
                      <Button
                        type="button"
                        variant="link"
                        onClick={() => setShowHelp(true)}
                        aria-haspopup="dialog"
                        className="-mr-2"
                      >
                        단축키
                      </Button>
                    </span>
                  )}
                </div>
              )}
              <TimerControls
                timerId={timerId}
                status={timer.status}
                remainingSeconds={timer.remainingSeconds}
                selectedAction={selectedAction}
                onActionChange={setSelectedAction}
                onModified={handleModified}
                onTimerRemoved={() => onTimerRemovedRef.current?.()}
                quickActorRef={quickActorRef}
                nicknamePromptRef={nicknamePromptRef}
                expired={expired}
                disconnected={connection.disconnected}
                className={showControlsHeader ? "mt-3" : undefined}
              />
            </section>
          )}
          {aside}
        </div>
      )}

      {/* 기록 + 그래프 */}
      <div className="grid gap-x-5 gap-y-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <section aria-labelledby="timer-logs-heading">
          <div className="flex items-center justify-between gap-4">
            <h2 id="timer-logs-heading" className="text-base font-semibold">
              {logsExpanded ? "기록" : "최근 기록"}
            </h2>
            {showLogsToggle && (
              <Button
                type="button"
                variant="link"
                className="-mr-2 pointer-coarse:-my-2.5"
                onClick={toggleLogsExpanded}
                aria-expanded={logsExpanded}
              >
                {logsExpanded ? "접기" : "전체 기록"}
              </Button>
            )}
          </div>

          {/* 필터 */}
          {logsExpanded && !noLogsYet && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {FILTER_GROUPS.map(({ label, actions }) => (
                <button
                  key={label}
                  onClick={() => toggleFilter(actions)}
                  aria-pressed={isFilterOn(actions)}
                  className={cn(
                    "rounded-full px-3 py-2 min-h-11 text-xs font-medium transition-colors",
                    isFilterOn(actions)
                      ? "bg-accent text-accent-foreground"
                      : "border border-border text-muted-foreground hover:bg-foreground/5",
                  )}
                >
                  {label}
                </button>
              ))}
              {activeFilters.size > 0 && (
                <button
                  onClick={() => { setActiveFilters(new Set()); setLogPage(1); }}
                  aria-label="필터 초기화"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
                >
                  초기화
                </button>
              )}
            </div>
          )}

          <div className={cn("mt-3 relative", logsLoading && "opacity-50")}>
            {logsLoading && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <Spinner />
              </div>
            )}

            {/* 실패면 오류 한 줄, 아직 받지 못했으면 자리만(스피너가 위에 뜬다). 빈 문구는 받은 결과가 0건일 때만.
                접힌 목록의 자리는 최근 기록 5행(행 61px) 높이라, 받은 뒤 아래 그래프(좁은 화면)가 밀리지 않는다 */}
            {logsError ? (
              <ErrorState
                compact
                message="기록을 불러오지 못했습니다."
                onRetry={() => fetchLogs(logPage, activeFilters, logsExpanded)}
              />
            ) : logs === null ? (
              <div className={logsExpanded ? "h-21" : "h-[19.0625rem]"} />
            ) : logs.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">기록이 없습니다.</p>
            ) : (
              <ul>
                {logs.map((log) => (
                  <li
                    key={log.id}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-border/50 py-2.5 text-sm"
                  >
                    <Badge variant={ACTION_TYPE_BADGE_VARIANT[log.actionType]}>
                      {ACTION_TYPE_LABELS[log.actionType]}
                    </Badge>
                    {/* 되돌린 기록은 지우지 않고 글자로 표시한다(통계·그래프에서는 빠진다) */}
                    <span className="truncate">
                      {displayActorName(log)}
                      {log.revertedAt && <span className="ml-1.5 text-xs text-muted-foreground">· 되돌림</span>}
                    </span>
                    {log.deltaSeconds > 0 ? (
                      <span className={cn(
                        "text-right font-mono text-xs font-medium",
                        log.revertedAt
                          ? "text-muted-foreground line-through"
                          : log.actionType === "ADD" ? "text-green-700 dark:text-green-400" : log.actionType === "SUBTRACT" ? "text-red-600 dark:text-red-400" : "",
                      )}>
                        {log.actionType === "ADD" ? "+" : log.actionType === "SUBTRACT" ? "-" : ""}
                        {formatDeltaSeconds(log.deltaSeconds)}
                      </span>
                    ) : (
                      <span className="text-right font-mono text-xs text-muted-foreground">—</span>
                    )}
                    {/* 좁은 화면에서 변경 전→후가 길면 날짜가 둘로 쪼개지지 않고 전→후가 다음 줄로 내려간다 */}
                    <div className="col-span-3 flex flex-wrap items-baseline justify-between gap-x-3 font-mono text-xs text-muted-foreground">
                      {/* 오늘이면 'HH:mm'만, 날짜는 오늘이 아닐 때만. 초까지의 전체 시각은 title로 */}
                      <time dateTime={log.createdAt} title={formatDateTime(log.createdAt)} className="whitespace-nowrap">
                        {formatLogTime(log.createdAt)}
                      </time>
                      <span className="ml-auto whitespace-nowrap text-right">
                        {formatDeltaSeconds(log.beforeSeconds)} → <span className="text-foreground">{formatDeltaSeconds(log.afterSeconds)}</span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {logsExpanded && !logsError && logTotalPages > 1 && (
            <div className="mt-4">
              <Pagination
                page={logPage}
                totalPages={logTotalPages}
                onPageChange={setLogPage}
              />
            </div>
          )}
        </section>

        <section aria-labelledby="timer-graph-heading">
          <h2 id="timer-graph-heading" className="text-base font-semibold">잔여 시간 추이</h2>
          <div className="mt-3 rounded-card border border-border bg-background p-5">
            {graphLoading ? (
              <div className="flex h-64 items-center justify-center">
                <Spinner />
              </div>
            ) : graphError ? (
              <ErrorState compact className="h-64" message="그래프를 불러오지 못했습니다." onRetry={() => fetchGraph()} />
            ) : graphData?.mode === "remaining" ? (
              <RemainingChart points={graphData.points} />
            ) : null}
          </div>
        </section>
      </div>

      {/* 단축키 도움말. 다른 다이얼로그와 같은 FormDialog(닫기 버튼, Escape, 배경 클릭)를 쓴다.
          본문은 열렸을 때만 렌더한다 */}
      <FormDialog open={showHelp} title="키보드 단축키" onClose={() => setShowHelp(false)}>
        {showHelp && (
          <>
            <div className="space-y-2">
              {SHORTCUT_HELP.map((item) => (
                <div key={item.key} className="flex items-center gap-3 text-sm">
                  <kbd className="rounded-control border border-border bg-muted px-2 py-0.5 font-mono text-xs">
                    {item.key}
                  </kbd>
                  <span className="text-muted-foreground">{item.description}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              숫자키는 닉네임 칸의 이름(없으면 기본 닉네임)으로 바로 적용됩니다.
            </p>
          </>
        )}
      </FormDialog>
    </div>
  );
}
