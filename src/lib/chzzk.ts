import type { ChzzkTokenResponse, ChzzkUserInfo } from "@/types";

const CHZZK_AUTH_URL = "https://chzzk.naver.com/account-interlock";
const CHZZK_TOKEN_URL = "https://openapi.chzzk.naver.com/auth/v1/token";
const CHZZK_USER_URL = "https://openapi.chzzk.naver.com/open/v1/users/me";

export type ChzzkStage = "token" | "user";

/**
 * CHZZK API 호출 실패. 응답 본문 원문은 담지 않는다(로그로 흘러가므로).
 * 본문이 JSON이고 짧은 code 필드가 있을 때만 메시지에 붙인다.
 */
export class ChzzkApiError extends Error {
  readonly stage: ChzzkStage;
  readonly status?: number;
  readonly timedOut: boolean;

  constructor(
    stage: ChzzkStage,
    message: string,
    options: { status?: number; timedOut?: boolean; cause?: unknown } = {}
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ChzzkApiError";
    this.stage = stage;
    this.status = options.status;
    this.timedOut = options.timedOut ?? false;
  }
}

const STAGE_LABEL: Record<ChzzkStage, string> = {
  token: "CHZZK token exchange",
  user: "CHZZK user info",
};

/** AbortSignal.timeout이나 네트워크 오류로 fetch 자체가 실패한 경우도 stage를 붙여 다시 던진다 */
async function chzzkFetch(stage: ChzzkStage, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    const timedOut =
      typeof err === "object" && err !== null && (err as { name?: unknown }).name === "TimeoutError";
    throw new ChzzkApiError(
      stage,
      `${STAGE_LABEL[stage]} ${timedOut ? "timed out" : "request failed"}`,
      { timedOut, cause: err }
    );
  }
}

/** 실패 응답 본문에서 JSON code 필드만 꺼낸다. 원문은 버린다 */
async function errorCode(res: Response): Promise<string | null> {
  try {
    const parsed: unknown = JSON.parse(await res.text());
    const code =
      typeof parsed === "object" && parsed !== null ? (parsed as { code?: unknown }).code : undefined;
    const str = typeof code === "string" || typeof code === "number" ? String(code) : "";
    return /^[\w.-]{1,50}$/.test(str) ? str : null;
  } catch {
    return null;
  }
}

async function failure(stage: ChzzkStage, res: Response): Promise<ChzzkApiError> {
  const code = await errorCode(res);
  return new ChzzkApiError(
    stage,
    `${STAGE_LABEL[stage]} failed: ${res.status}${code ? ` (code=${code})` : ""}`,
    { status: res.status }
  );
}

/**
 * 성공 응답 본문을 JSON으로 읽는다. 본문이 JSON이 아니면(프록시 HTML 오류 페이지 등) SyntaxError 메시지에
 * 본문 일부가 인용되므로 cause로 넘기지 않고 status만 담은 ChzzkApiError로 바꾼다
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readJson(stage: ChzzkStage, res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new ChzzkApiError(stage, `${STAGE_LABEL[stage]} invalid JSON`, { status: res.status });
  }
}

function getConfig() {
  const clientId = process.env.CHZZK_CLIENT_ID;
  const clientSecret = process.env.CHZZK_CLIENT_SECRET;
  const baseUrl = process.env.BASE_URL;
  if (!clientId || !clientSecret || !baseUrl) {
    throw new Error("CHZZK OAuth environment variables are not set");
  }
  return { clientId, clientSecret, baseUrl };
}

export function buildAuthorizationUrl(state: string): string {
  const { clientId, baseUrl } = getConfig();
  const params = new URLSearchParams({
    clientId,
    redirectUri: `${baseUrl}/api/auth/callback`,
    state,
  });
  return `${CHZZK_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(
  code: string,
  state: string
): Promise<ChzzkTokenResponse> {
  const { clientId, clientSecret } = getConfig();

  const res = await chzzkFetch("token", CHZZK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grantType: "authorization_code",
      clientId,
      clientSecret,
      code,
      state,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw await failure("token", res);
  }

  const json = await readJson("token", res);

  // CHZZK API가 { content: { ... } } 로 래핑하는 경우 처리
  const data = json?.content ?? json;

  if (!data?.accessToken) {
    throw new ChzzkApiError("token", "CHZZK token response missing accessToken", { status: res.status });
  }

  return data as ChzzkTokenResponse;
}

export async function getUserInfo(
  accessToken: string
): Promise<ChzzkUserInfo> {
  const res = await chzzkFetch("user", CHZZK_USER_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw await failure("user", res);
  }

  const json = await readJson("user", res);
  const data = json?.content ?? json;

  if (!data?.id && !data?.channelId) {
    throw new ChzzkApiError("user", "CHZZK user response missing id", { status: res.status });
  }

  // CHZZK user API의 필드명 차이 대응
  return {
    id: data.id ?? data.channelId,
    nickname: data.nickname ?? data.channelName,
    profileImageUrl: data.profileImageUrl ?? data.channelImageUrl ?? null,
  };
}
