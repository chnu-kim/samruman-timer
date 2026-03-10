import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildAuthorizationUrl, exchangeCode, getUserInfo } from "@/lib/chzzk";

describe("buildAuthorizationUrl", () => {
  beforeEach(() => {
    vi.stubEnv("CHZZK_CLIENT_ID", "test-client-id");
    vi.stubEnv("CHZZK_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("BASE_URL", "https://example.com");
  });

  it("올바른 CHZZK 인증 URL을 생성한다", () => {
    const url = buildAuthorizationUrl("random-state-123");
    expect(url).toContain("https://chzzk.naver.com/account-interlock");
    expect(url).toContain("clientId=test-client-id");
    expect(url).toContain("redirectUri=https%3A%2F%2Fexample.com%2Fapi%2Fauth%2Fcallback");
    expect(url).toContain("state=random-state-123");
  });

  it("환경변수 미설정 시 에러 발생", () => {
    vi.stubEnv("CHZZK_CLIENT_ID", "");
    expect(() => buildAuthorizationUrl("state")).toThrow(
      "CHZZK OAuth environment variables are not set"
    );
  });
});

describe("exchangeCode", () => {
  beforeEach(() => {
    vi.stubEnv("CHZZK_CLIENT_ID", "test-client-id");
    vi.stubEnv("CHZZK_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("BASE_URL", "https://example.com");
  });

  it("성공 시 토큰 응답을 반환한다", async () => {
    const mockResponse = {
      accessToken: "access-123",
      refreshToken: "refresh-456",
      expiresIn: 3600,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await exchangeCode("auth-code", "random-state");
    expect(result).toEqual(mockResponse);

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    expect(fetchCall[0]).toBe("https://openapi.chzzk.naver.com/auth/v1/token");
    const body = JSON.parse(fetchCall[1]!.body as string);
    expect(body.code).toBe("auth-code");
    expect(body.clientId).toBe("test-client-id");
    expect(body.grantType).toBe("authorization_code");
  });

  it("실패 시 에러를 던진다", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("Bad Request"),
    });

    await expect(exchangeCode("bad-code", "state")).rejects.toThrow(
      "CHZZK token exchange failed: 400"
    );
  });
});

describe("getUserInfo", () => {
  beforeEach(() => {
    vi.stubEnv("CHZZK_CLIENT_ID", "test-client-id");
    vi.stubEnv("CHZZK_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("BASE_URL", "https://example.com");
  });

  it("성공 시 사용자 정보를 반환한다", async () => {
    const mockUser = {
      id: "chzzk-user-1",
      nickname: "테스트유저",
      profileImageUrl: "https://img.example.com/profile.jpg",
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockUser),
    });

    const result = await getUserInfo("access-token");
    expect(result).toEqual(mockUser);

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    expect(fetchCall[1]!.headers).toEqual({
      Authorization: "Bearer access-token",
      "Content-Type": "application/json",
    });
  });

  it("실패 시 에러를 던진다", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });

    await expect(getUserInfo("bad-token")).rejects.toThrow(
      "CHZZK user info failed: 401"
    );
  });
});
