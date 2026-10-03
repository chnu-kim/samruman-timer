import { SignJWT, jwtVerify } from "jose";
import { NextRequest } from "next/server";
import type { JwtPayload, RefreshTokenRow } from "@/types";

const COOKIE_NAME = "session";
export const ACCESS_TOKEN_MAX_AGE = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60; // 30 days
// 로그인 1회로 이어지는 세션(refresh family)의 최대 수명. rotation해도 이 기간을 넘겨 연장되지 않는다
export const SESSION_ABSOLUTE_MAX_AGE = 90 * 24 * 60 * 60; // 90 days
export const REFRESH_COOKIE_NAME = "refresh";

/**
 * OAuth state 쿠키 이름. HTTPS에서는 `__Host-` 접두사를 붙여 Secure·Path=/·Domain 없음을 강제한다.
 * 그래야 평문 HTTP 응답이 공격자의 state 쿠키를 심어 로그인 CSRF를 일으킬 수 없다.
 * 개발(http://localhost)에서는 Secure를 쓸 수 없으므로 접두사 없는 이름을 쓴다.
 */
export function oauthStateCookieName(): string {
  return process.env.NODE_ENV !== "development" ? "__Host-oauth_state" : "oauth_state";
}

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function signJwt(
  payload: Omit<JwtPayload, "iat" | "exp">
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_MAX_AGE}s`)
    .sign(getSecret());
}

export async function verifyJwt(token: string): Promise<JwtPayload | null> {
  try {
    // 서명 알고리즘을 고정하고 만료가 없는 토큰은 받지 않는다
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
      requiredClaims: ["exp", "iat"],
    });
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

export async function getCurrentUser(
  request: NextRequest
): Promise<JwtPayload | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyJwt(token);
}

export function createSessionCookie(token: string): string {
  const secure = process.env.NODE_ENV !== "development";
  return `${COOKIE_NAME}=${token}; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax; Path=/; Max-Age=${ACCESS_TOKEN_MAX_AGE}`;
}

export function deleteSessionCookie(): string {
  const secure = process.env.NODE_ENV !== "development";
  return `${COOKIE_NAME}=; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax; Path=/; Max-Age=0`;
}

// ─── Refresh Token ───

export function generateRefreshToken(): string {
  return crypto.randomUUID();
}

export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function createRefreshCookie(token: string): string {
  const secure = process.env.NODE_ENV !== "development";
  return `${REFRESH_COOKIE_NAME}=${token}; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax; Path=/; Max-Age=${REFRESH_TOKEN_MAX_AGE}`;
}

export function deleteRefreshCookie(): string {
  const secure = process.env.NODE_ENV !== "development";
  return `${REFRESH_COOKIE_NAME}=; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax; Path=/; Max-Age=0`;
}

function generateId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

function nowISO(): string {
  return new Date().toISOString();
}

/** 새 로그인으로 시작하는 family의 절대 만료 시각 */
export function newFamilyExpiresAt(): string {
  return new Date(Date.now() + SESSION_ABSOLUTE_MAX_AGE * 1000).toISOString();
}

export async function createRefreshTokenInDB(
  db: D1Database,
  userId: string,
  tokenHash: string,
  familyId: string,
  familyExpiresAt: string
): Promise<void> {
  const id = generateId();
  const now = nowISO();
  const slidingExpiresAt = Date.now() + REFRESH_TOKEN_MAX_AGE * 1000;
  const expiresAt = new Date(
    Math.min(slidingExpiresAt, new Date(familyExpiresAt).getTime())
  ).toISOString();

  await db
    .prepare(
      "INSERT INTO refresh_tokens (id, user_id, token_hash, family_id, status, expires_at, created_at, family_expires_at) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?)"
    )
    .bind(id, userId, tokenHash, familyId, expiresAt, now, familyExpiresAt)
    .run();
}

/** 만료된 refresh token 행을 지운다. 만료 토큰은 어떤 판정에도 쓰이지 않는다 */
export async function deleteExpiredRefreshTokens(db: D1Database, userId: string): Promise<void> {
  await db
    .prepare("DELETE FROM refresh_tokens WHERE user_id = ? AND expires_at <= ?")
    .bind(userId, nowISO())
    .run();
}

export async function revokeRefreshTokenFamily(
  db: D1Database,
  familyId: string
): Promise<void> {
  await db
    .prepare(
      "UPDATE refresh_tokens SET status = 'REVOKED' WHERE family_id = ? AND status IN ('ACTIVE', 'USED')"
    )
    .bind(familyId)
    .run();
}

// 동시 요청 grace period: 토큰이 rotation된 지 30초 이내에 다시 쓰이면 race condition으로 판단
const RACE_GRACE_MS = 30_000;

function isWithinRaceGrace(usedAt: string | null): boolean {
  return usedAt !== null && Date.now() - new Date(usedAt).getTime() < RACE_GRACE_MS;
}

/** Grace: 새 토큰 발급 없이 사용자 정보만 반환한다 */
async function graceResult(db: D1Database, row: RefreshTokenRow): Promise<RotateOutcome> {
  const user = await db
    .prepare("SELECT id, chzzk_user_id, nickname FROM users WHERE id = ?")
    .bind(row.user_id)
    .first<{ id: string; chzzk_user_id: string; nickname: string }>();
  if (!user) return { ok: false, reason: "user_missing", userId: row.user_id, familyId: row.family_id };
  return {
    ok: true,
    userId: user.id,
    chzzkUserId: user.chzzk_user_id,
    nickname: user.nickname,
    newRawToken: null,
    newTokenHash: null,
    familyId: row.family_id,
  };
}

export interface RotateResult {
  userId: string;
  chzzkUserId: string;
  nickname: string;
  /** race condition grace 시 null (새 토큰 발급 불필요) */
  newRawToken: string | null;
  newTokenHash: string | null;
  familyId: string;
}

/** refresh 거부 사유. middleware가 운영 로그에 남긴다(이 모듈은 로깅하지 않는다) */
export type RotateRejectReason =
  | "not_found"
  | "expired"
  | "family_expired"
  | "reuse_detected"
  | "user_missing";

export type RotateOutcome =
  | ({ ok: true } & RotateResult)
  | { ok: false; reason: RotateRejectReason; userId?: string; familyId?: string };

export async function rotateRefreshToken(
  db: D1Database,
  rawToken: string
): Promise<RotateOutcome> {
  const tokenHash = await hashToken(rawToken);

  // 1. 토큰 해시로 DB 조회
  const row = await db
    .prepare("SELECT * FROM refresh_tokens WHERE token_hash = ?")
    .bind(tokenHash)
    .first<RefreshTokenRow>();

  if (!row) return { ok: false, reason: "not_found" };

  // 2. USED/REVOKED면 → grace period 확인 후 reuse detection
  if (row.status === "USED" || row.status === "REVOKED") {
    // 동시 요청 grace: 이 토큰 자신이 방금 rotation됐을 때만 정상적인 동시 요청으로 본다.
    // family에 최근 ACTIVE 토큰이 있는지로 판단하면, 탈취자가 주기적으로 rotation하는 동안
    // 피해자의 재사용이 계속 grace로 통과해 탐지가 일어나지 않는다.
    if (row.status === "USED" && isWithinRaceGrace(row.used_at)) {
      return graceResult(db, row);
    }

    await revokeRefreshTokenFamily(db, row.family_id);
    return { ok: false, reason: "reuse_detected", userId: row.user_id, familyId: row.family_id };
  }

  // 3. 만료 확인. family 절대 만료가 지났으면 토큰 자체 만료가 남아 있어도 거부한다
  if (new Date(row.expires_at) <= new Date()) {
    return { ok: false, reason: "expired", userId: row.user_id, familyId: row.family_id };
  }
  if (row.family_expires_at && new Date(row.family_expires_at) <= new Date()) {
    return { ok: false, reason: "family_expired", userId: row.user_id, familyId: row.family_id };
  }

  // 4. 동시성 대응: UPDATE ... WHERE status='ACTIVE' + changes 체크
  const updateResult = await db
    .prepare(
      "UPDATE refresh_tokens SET status = 'USED', used_at = ? WHERE id = ? AND status = 'ACTIVE'"
    )
    .bind(nowISO(), row.id)
    .run();

  if (!updateResult.meta.changes || updateResult.meta.changes === 0) {
    // Race condition: 조회와 UPDATE 사이에 다른 요청이 이 토큰을 사용했다.
    // 그 사이 family가 폐기됐을 수 있으므로 현재 상태를 다시 읽는다.
    const current = await db
      .prepare("SELECT status, used_at FROM refresh_tokens WHERE id = ?")
      .bind(row.id)
      .first<Pick<RefreshTokenRow, "status" | "used_at">>();

    if (current?.status === "USED" && isWithinRaceGrace(current.used_at)) {
      return graceResult(db, row);
    }

    await revokeRefreshTokenFamily(db, row.family_id);
    return { ok: false, reason: "reuse_detected", userId: row.user_id, familyId: row.family_id };
  }

  // 5. 새 토큰 생성, 같은 family_id
  const newRawToken = generateRefreshToken();
  const newTokenHash = await hashToken(newRawToken);
  // 절대 만료는 family를 따라간다. 0009 이전 행처럼 비어 있으면 이 토큰 생성 시각 기준으로 정한다
  const familyExpiresAt =
    row.family_expires_at ??
    new Date(new Date(row.created_at).getTime() + SESSION_ABSOLUTE_MAX_AGE * 1000).toISOString();
  await createRefreshTokenInDB(db, row.user_id, newTokenHash, row.family_id, familyExpiresAt);

  // 6. user 정보 조회
  const user = await db
    .prepare(
      "SELECT id, chzzk_user_id, nickname FROM users WHERE id = ?"
    )
    .bind(row.user_id)
    .first<{ id: string; chzzk_user_id: string; nickname: string }>();

  if (!user) return { ok: false, reason: "user_missing", userId: row.user_id, familyId: row.family_id };

  return {
    ok: true,
    userId: user.id,
    chzzkUserId: user.chzzk_user_id,
    nickname: user.nickname,
    newRawToken,
    newTokenHash,
    familyId: row.family_id,
  };
}
