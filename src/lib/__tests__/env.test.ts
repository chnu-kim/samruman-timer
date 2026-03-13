import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateEnv, resetEnvValidation } from "../env";

describe("validateEnv", () => {
  beforeEach(() => {
    resetEnvValidation();
    vi.stubEnv("JWT_SECRET", "test-secret");
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
});
