/**
 * 헬스체크(`GET /api/health`)의 스키마 판정.
 *
 * 코드만 배포되고 원격 D1 마이그레이션이 빠지는 장애(0007)를 사용자보다 먼저 잡으려고,
 * 원격 `d1_migrations`의 마지막 행을 이 코드가 기대하는 최신 마이그레이션과 비교한다.
 * 로깅은 라우트가 한다(lib는 판정 결과만 돌려준다).
 */

/**
 * 이 코드가 기대하는 최신 마이그레이션. wrangler가 `d1_migrations.name`에 넣는 값(파일명, `.sql` 포함)과 같은 형식이다.
 * Workers 런타임은 `migrations/`를 읽을 수 없어 상수로 둔다. 새 마이그레이션을 추가하면 함께 바꾼다
 * (`src/lib/__tests__/health.test.ts`가 디렉토리의 최신 파일명과 대조한다)
 */
export const EXPECTED_LATEST_MIGRATION = "0009_timer_unique_and_session_lifetime.sql";

/**
 * - `current`: 기대값과 같다
 * - `ahead`: 원격이 더 새 마이그레이션까지 적용됐다. 원격 마이그레이션을 먼저 적용하고 코드를 배포하는 사이의 정상 상태다
 * - `behind`: 원격이 뒤처졌다(마이그레이션 누락)
 * - `mismatch`: 번호가 같은데 이름이 다르거나 번호를 읽을 수 없다(다른 브랜치의 마이그레이션 적용 등)
 * - `missing`: 적용 기록이 없다
 */
export type SchemaState = "current" | "ahead" | "behind" | "mismatch" | "missing";

export type SchemaCheck = { ok: boolean; state: SchemaState };

/** `0009_xxx.sql` → 9. 번호로 시작하지 않으면 null */
function migrationNumber(name: string): number | null {
  const m = /^(\d+)_/.exec(name);
  return m ? Number(m[1]) : null;
}

/** 원격의 마지막 적용 마이그레이션 이름(`actual`)을 기대값과 비교한다 */
export function compareSchema(actual: string | null, expected: string = EXPECTED_LATEST_MIGRATION): SchemaCheck {
  if (actual === null) return { ok: false, state: "missing" };
  if (actual === expected) return { ok: true, state: "current" };
  const a = migrationNumber(actual);
  const e = migrationNumber(expected);
  if (a === null || e === null || a === e) return { ok: false, state: "mismatch" };
  return a > e ? { ok: true, state: "ahead" } : { ok: false, state: "behind" };
}
