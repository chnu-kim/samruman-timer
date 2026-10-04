// ─── 유니온/enum 타입 ───

export type ProjectStatus = "ACTIVE" | "DELETED";
export type TimerStatus = "RUNNING" | "EXPIRED" | "SCHEDULED" | "DELETED";
export type ActionType = "CREATE" | "ADD" | "SUBTRACT" | "EXPIRE" | "REOPEN" | "ACTIVATE" | "DELETE";
export type ModifyAction = "ADD" | "SUBTRACT";
export type GraphMode = "remaining" | "cumulative" | "frequency";

// ─── DB 엔티티 타입 ───

export interface User {
  id: string;
  chzzkUserId: string;
  nickname: string;
  profileImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  ownerUserId: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Timer {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  baseRemainingSeconds: number;
  lastCalculatedAt: string;
  status: TimerStatus;
  scheduledStartAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimerLog {
  id: string;
  timerId: string;
  actionType: ActionType;
  actorName: string;
  actorUserId: string | null;
  deltaSeconds: number;
  beforeSeconds: number;
  afterSeconds: number;
  createdAt: string;
  /** 되돌린(취소 처리한) 시각. null이면 유효한 기록이다(0010) */
  revertedAt?: string | null;
}

// ─── API 공통 타입 ───

export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE";

export interface ApiSuccessResponse<T> {
  data: T;
}

export interface ApiErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ─── API 요청 타입 ───

export interface CreateProjectRequest {
  name: string;
  description?: string;
}

export interface CreateTimerRequest {
  title: string;
  description?: string;
  initialSeconds: number;
  scheduledStartAt?: string;
}

export interface ModifyTimerRequest {
  action: ModifyAction;
  deltaSeconds: number;
  actorName: string;
}

export interface LogsQueryParams {
  page?: number;
  limit?: number;
  actionType?: string;
}

export interface GraphQueryParams {
  mode: GraphMode;
}

// ─── API 응답 타입: Auth ───

export interface MeResponse {
  id: string;
  chzzkUserId: string;
  nickname: string;
  profileImageUrl: string | null;
}

// ─── API 응답 타입: Project ───

export interface ProjectListItem {
  id: string;
  name: string;
  description: string | null;
  ownerNickname: string;
  timerCount: number;
  /** 조회 시점에 계산한 타이머 상태. 타이머가 없으면 null */
  timerStatus: Exclude<TimerStatus, "DELETED"> | null;
  /** 조회 시점 잔여초. 타이머가 없으면 null */
  remainingSeconds: number | null;
  /** 예약 상태일 때 시작 시각 */
  scheduledStartAt: string | null;
  createdAt: string;
}

export interface ProjectListResponse {
  projects: ProjectListItem[];
  pagination: Pagination;
}

export interface ProjectCreateResponse {
  id: string;
  name: string;
  description: string | null;
  ownerUserId: string;
  createdAt: string;
}

export interface ProjectDetailResponse {
  id: string;
  name: string;
  description: string | null;
  owner: {
    id: string;
    nickname: string;
    profileImageUrl: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

// ─── API 응답 타입: Timer ───

export interface TimerListItem {
  id: string;
  title: string;
  description: string | null;
  remainingSeconds: number;
  status: TimerStatus;
  scheduledStartAt: string | null;
  createdAt: string;
}

export interface TimerCreateResponse {
  id: string;
  title: string;
  remainingSeconds: number;
  status: TimerStatus;
  scheduledStartAt: string | null;
  createdAt: string;
}

export interface TimerDetailResponse {
  id: string;
  projectId: string;
  /** 브레드크럼에 상위 프로젝트 이름을 보여 주기 위해 함께 내려 준다 */
  projectName: string;
  title: string;
  description: string | null;
  remainingSeconds: number;
  status: TimerStatus;
  scheduledStartAt: string | null;
  createdBy: {
    id: string;
    nickname: string;
  };
  projectOwnerId: string;
  createdAt: string;
  updatedAt: string;
  /** `?since=<updatedAt>`로 조회했을 때 그 뒤 지금까지의 시간 추가·차감 변경량 합계(초, 차감은 음수).
   *  그사이 추가·차감이 없으면 null, since가 없거나 계산할 수 없으면 필드가 없다 */
  deltaSinceSeconds?: number | null;
}

export interface TimerModifyResponse {
  id: string;
  remainingSeconds: number;
  status: TimerStatus;
  /**
   * 시간 변경: 이번 ADD/SUBTRACT 기록(차감으로 만료돼도 EXPIRE가 아니라 SUBTRACT). 되돌리기가 이 id를 쓴다.
   * 되돌리기: 되돌린 기록(revertedAt 채워짐)
   */
  log: TimerLogResponse;
}

// ─── API 응답 타입: Log ───

export interface TimerLogResponse {
  id: string;
  actionType: ActionType;
  actorName: string;
  actorUserId: string | null;
  deltaSeconds: number;
  beforeSeconds: number;
  afterSeconds: number;
  createdAt: string;
  /** 되돌린 시각. null이면 유효한 기록이다. 되돌린 기록은 통계·그래프·목표 집계에서 빠진다 */
  revertedAt: string | null;
}

export interface TimerLogsResponse {
  logs: TimerLogResponse[];
  pagination: Pagination;
}

// ─── API 응답 타입: Graph ───

export interface RemainingGraphPoint {
  timestamp: string;
  remainingSeconds: number;
}

export interface CumulativeGraphPoint {
  timestamp: string;
  totalAdded: number;
  totalSubtracted: number;
}

export interface FrequencyGraphBucket {
  hour: string;
  count: number;
  adds: number;
  subtracts: number;
}

export type GraphResponse =
  | { mode: "remaining"; points: RemainingGraphPoint[] }
  | { mode: "cumulative"; points: CumulativeGraphPoint[] }
  | { mode: "frequency"; buckets: FrequencyGraphBucket[] };

// ─── API 응답 타입: Stats ───

export interface StatsSummary {
  totalAddedSeconds: number;
  totalSubtractedSeconds: number;
  netAddedSeconds: number;
  totalEvents: number;
  uniqueDonors: number;
  peakHour: number | null;
}

export interface TopDonor {
  actorName: string;
  totalSeconds: number;
  eventCount: number;
}

export interface HourlyDistribution {
  hour: number;
  eventCount: number;
  adds: number;
  subtracts: number;
  addedSeconds: number;
}

export interface DailyActivity {
  date: string;
  eventCount: number;
  addedSeconds: number;
  subtractedSeconds: number;
}

export interface StatsResponse {
  summary: StatsSummary;
  topDonors: TopDonor[];
  hourlyDistribution: HourlyDistribution[];
  dailyActivity: DailyActivity[];
}

export type TimerStatsResponse = StatsResponse;

// ─── API 응답 타입: Overlay Settings ───

export type OverlayPosition = "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface OverlaySettingsResponse {
  fontSize: number;
  color: string;
  bg: string;
  showTitle: boolean;
  shadow: boolean;
  position: OverlayPosition;
  animation: boolean;
}

export interface OverlaySettingsRequest {
  fontSize?: number;
  color?: string;
  bg?: string;
  showTitle?: boolean;
  shadow?: boolean;
  position?: OverlayPosition;
  animation?: boolean;
}

// ─── API 응답 타입: Goal ───

export type GoalType = "DURATION" | "DEADLINE";
export type GoalStatus = "ACTIVE" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface CreateGoalRequest {
  type: GoalType;
  title: string;
  targetSeconds?: number;
  targetDatetime?: string;
}

export interface GoalResponse {
  id: string;
  type: GoalType;
  title: string;
  targetSeconds: number | null;
  targetDatetime: string | null;
  status: GoalStatus;
  progress: GoalProgress;
  createdAt: string;
  completedAt: string | null;
}

export interface GoalProgress {
  percentage: number;
  currentSeconds?: number;
  remainingToTarget?: number;
  timerSurvivesDeadline?: boolean;
  deadlineIn?: number;
  /** DEADLINE: 지금 잔여 시간대로면 타이머가 마감 전에 끝난다 */
  deadlineAfterTimerEnd?: boolean;
}

// ─── Refresh Token 타입 ───

export type RefreshTokenStatus = "ACTIVE" | "USED" | "REVOKED";

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  family_id: string;
  status: RefreshTokenStatus;
  expires_at: string;
  created_at: string;
  used_at: string | null;
  /** family 절대 만료(0009). 이전 행은 마이그레이션이 채운다 */
  family_expires_at: string | null;
}

// ─── Auth 타입 ───

export interface JwtPayload {
  userId: string;
  chzzkUserId: string;
  nickname: string;
  iat: number;
  exp: number;
}

export interface ChzzkTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface ChzzkUserInfo {
  id: string;
  nickname: string;
  profileImageUrl: string | null;
}
