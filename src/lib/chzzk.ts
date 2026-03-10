import type { ChzzkTokenResponse, ChzzkUserInfo } from "@/types";

const CHZZK_AUTH_URL = "https://chzzk.naver.com/account-interlock";
const CHZZK_TOKEN_URL = "https://openapi.chzzk.naver.com/auth/v1/token";
const CHZZK_USER_URL = "https://openapi.chzzk.naver.com/open/v1/users/me";

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

  const res = await fetch(CHZZK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grantType: "authorization_code",
      clientId,
      clientSecret,
      code,
      state,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CHZZK token exchange failed: ${res.status} ${text}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json();

  // CHZZK API가 { content: { ... } } 로 래핑하는 경우 처리
  const data = json.content ?? json;

  if (!data.accessToken) {
    throw new Error(
      `CHZZK token response missing accessToken: ${JSON.stringify(json)}`
    );
  }

  return data as ChzzkTokenResponse;
}

export async function getUserInfo(
  accessToken: string
): Promise<ChzzkUserInfo> {
  const res = await fetch(CHZZK_USER_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CHZZK user info failed: ${res.status} ${text}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json();
  const data = json.content ?? json;

  if (!data.id && !data.channelId) {
    throw new Error(
      `CHZZK user response missing id: ${JSON.stringify(json)}`
    );
  }

  // CHZZK user API의 필드명 차이 대응
  return {
    id: data.id ?? data.channelId,
    nickname: data.nickname ?? data.channelName,
    profileImageUrl: data.profileImageUrl ?? data.channelImageUrl ?? null,
  };
}
