import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateEnv, resetEnvValidation, EnvValidationError } from "../env";

describe("validateEnv", () => {
  beforeEach(() => {
    resetEnvValidation();
    vi.stubEnv("JWT_SECRET", "test-secret-key-at-least-32-chars-long!");
    vi.stubEnv("CHZZK_CLIENT_ID", "test-client-id");
    vi.stubEnv("CHZZK_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("BASE_URL", "http://localhost:3000");
  });

  it("모든 환경변수가 설정되면 에러 없이 통과", () => {
    expect(() => validateEnv()).not.toThrow();
  });

  it("JWT_SECRET 누락 시 에러", () => {
    vi.stubEnv("JWT_SECRET", "");
    expect(() => validateEnv()).toThrow("JWT_SECRET");
  });

  it("실패 오류는 문제가 된 변수 이름만 invalid에 담는다", () => {
    vi.stubEnv("JWT_SECRET", "");
    vi.stubEnv("BASE_URL", "");
    try {
      validateEnv();
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      expect((err as EnvValidationError).invalid).toEqual(["JWT_SECRET", "BASE_URL"]);
    }
  });

  it("CHZZK_CLIENT_ID 누락 시 에러", () => {
    vi.stubEnv("CHZZK_CLIENT_ID", "");
    expect(() => validateEnv()).toThrow("CHZZK_CLIENT_ID");
  });

  it("CHZZK_CLIENT_SECRET 누락 시 에러", () => {
    vi.stubEnv("CHZZK_CLIENT_SECRET", "");
    expect(() => validateEnv()).toThrow("CHZZK_CLIENT_SECRET");
  });

  it("BASE_URL 누락 시 에러", () => {
    vi.stubEnv("BASE_URL", "");
    expect(() => validateEnv()).toThrow("BASE_URL");
  });

  it("여러 변수 누락 시 모두 에러 메시지에 포함", () => {
    vi.stubEnv("JWT_SECRET", "");
    vi.stubEnv("CHZZK_CLIENT_ID", "");
    expect(() => validateEnv()).toThrow("JWT_SECRET, CHZZK_CLIENT_ID");
  });

  it("두 번째 호출은 검증을 건너뛴다", () => {
    validateEnv(); // 첫 호출 통과
    vi.stubEnv("JWT_SECRET", ""); // 이후 제거해도
    expect(() => validateEnv()).not.toThrow(); // 캐시된 결과로 통과
  });

  it("resetEnvValidation 후 재검증 수행", () => {
    validateEnv();
    resetEnvValidation();
    vi.stubEnv("JWT_SECRET", "");
    expect(() => validateEnv()).toThrow("JWT_SECRET");
  });

  it("BASE_URL이 URL 형식이 아니면 에러", () => {
    vi.stubEnv("BASE_URL", "not a url");
    expect(() => validateEnv()).toThrow("BASE_URL");
  });

  it("JWT_SECRET이 32바이트보다 짧으면 경고만 남기고 통과", () => {
    vi.stubEnv("JWT_SECRET", "test-secret");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => validateEnv()).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("JWT_SECRET"));
    const entry = JSON.parse(String(warn.mock.calls[0][0]));
    expect(entry).toMatchObject({ level: "warn", event: "env.weak_jwt_secret", minBytes: 32 });
    warn.mockRestore();
  });

  it("JWT_SECRET이 32바이트 이상이면 경고하지 않는다", () => {
    vi.stubEnv("JWT_SECRET", "x".repeat(32));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    validateEnv();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
