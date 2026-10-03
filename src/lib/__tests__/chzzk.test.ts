import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildAuthorizationUrl, exchangeCode, getUserInfo, ChzzkApiError } from "@/lib/chzzk";

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

  it("실패 응답 본문 원문은 메시지에 넣지 않고 JSON code만 붙인다", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve(JSON.stringify({ code: "INVALID_CODE", message: "echo: auth-secret-code" })),
    });

    const err = await exchangeCode("auth-secret-code", "state").catch((e) => e);
    expect(err).toBeInstanceOf(ChzzkApiError);
    expect(err).toMatchObject({ stage: "token", status: 400, timedOut: false });
    expect(err.message).toBe("CHZZK token exchange failed: 400 (code=INVALID_CODE)");
    expect(err.message).not.toContain("auth-secret-code");
  });

  it("JSON이 아닌 본문은 버린다", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: () => Promise.resolve("<html>upstream nickname=홍길동</html>"),
    });

    const err = await exchangeCode("c", "s").catch((e) => e);
    expect(err.message).toBe("CHZZK token exchange failed: 502");
  });

  it("시간 초과는 timedOut=true인 ChzzkApiError로 바뀐다", async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));

    const err = await exchangeCode("c", "s").catch((e) => e);
    expect(err).toBeInstanceOf(ChzzkApiError);
    expect(err).toMatchObject({ stage: "token", timedOut: true, status: undefined });
    expect(err.message).toBe("CHZZK token exchange timed out");
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

  it("네트워크 오류는 stage=user, timedOut=false로 바뀐다", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

    const err = await getUserInfo("t").catch((e) => e);
    expect(err).toBeInstanceOf(ChzzkApiError);
    expect(err).toMatchObject({ stage: "user", timedOut: false });
    expect(err.message).toBe("CHZZK user info request failed");
  });
});
