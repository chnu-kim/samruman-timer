/**
 * 필수 환경변수 검증 헬퍼
 *
 * 서버 시작 시 누락된 환경변수가 있으면 명확한 에러 메시지와 함께 빠르게 실패한다.
 */

const REQUIRED_ENV_VARS = [
  "JWT_SECRET",
  "CHZZK_CLIENT_ID",
  "CHZZK_CLIENT_SECRET",
  "BASE_URL",
] as const;

type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number];

let validated = false;

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
    throw new Error(
      `필수 환경변수가 설정되지 않았습니다: ${missing.join(", ")}\n` +
        `wrangler.toml 또는 .dev.vars 파일을 확인하세요.`
    );
  }

  validated = true;
}

/**
 * 테스트에서 validated 플래그를 초기화하기 위한 헬퍼
 */
export function resetEnvValidation(): void {
  validated = false;
}
