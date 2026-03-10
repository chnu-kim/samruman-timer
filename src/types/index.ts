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
}

// ─── API 공통 타입 ───

export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";

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
  createdAt: string;
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
  title: string;
  description: string | null;
  remainingSeconds: number;
  status: TimerStatus;
  scheduledStartAt: string | null;
  createdBy: {
    id: string;
    nickname: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface TimerModifyResponse {
  id: string;
  remainingSeconds: number;
  status: TimerStatus;
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
