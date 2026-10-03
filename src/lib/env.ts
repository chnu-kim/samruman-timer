/**
 * 필수 환경변수 검증 헬퍼
 *
 * 서버 시작 시 누락된 환경변수가 있으면 명확한 에러 메시지와 함께 빠르게 실패한다.
 */

import { logger } from "@/lib/logger";

const REQUIRED_ENV_VARS = [
  "JWT_SECRET",
  "CHZZK_CLIENT_ID",
  "CHZZK_CLIENT_SECRET",
  "BASE_URL",
] as const;

const MIN_JWT_SECRET_BYTES = 32;

type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number];

let validated = false;

/** 검증 실패. invalid에는 문제가 된 환경변수 이름만 담는다(값은 담지 않는다) */
export class EnvValidationError extends Error {
  constructor(
    message: string,
    readonly invalid: string[]
  ) {
    super(message);
    this.name = "EnvValidationError";
  }
}

/**
 * 필수 환경변수가 모두 설정되어 있는지 검증한다.
 * 누락된 변수가 있으면 에러를 throw한다.
 *
 * 여러 번 호출해도 최초 1회만 검증을 수행한다.
 */
export function validateEnv(): void {
  if (validated) return;

  const missing: RequiredEnvVar[] = [];

  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new EnvValidationError(
      `필수 환경변수가 설정되지 않았습니다: ${missing.join(", ")}\n` +
        `wrangler.toml 또는 .dev.vars 파일을 확인하세요.`,
      missing
    );
  }

  try {
    new URL(process.env.BASE_URL!);
  } catch {
    throw new EnvValidationError(`BASE_URL이 올바른 URL이 아닙니다. 예: https://example.com`, ["BASE_URL"]);
  }

  // HS256 키는 32바이트 이상이어야 무차별 대입에 안전하다. 기존 배포를 멈추지 않도록 경고만 남긴다
  if (new TextEncoder().encode(process.env.JWT_SECRET!).length < MIN_JWT_SECRET_BYTES) {
    logger.warn("env.weak_jwt_secret", { variable: "JWT_SECRET", minBytes: MIN_JWT_SECRET_BYTES });
  }

  validated = true;
}

/**
 * 테스트에서 validated 플래그를 초기화하기 위한 헬퍼
 */
export function resetEnvValidation(): void {
  validated = false;
}
