import { SignJWT, jwtVerify } from "jose";
import { NextRequest } from "next/server";
import type { JwtPayload, RefreshTokenRow } from "@/types";

const COOKIE_NAME = "session";
export const ACCESS_TOKEN_MAX_AGE = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60; // 30 days
export const REFRESH_COOKIE_NAME = "refresh";

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
    const { payload } = await jwtVerify(token, getSecret());
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

export async function createRefreshTokenInDB(
  db: D1Database,
  userId: string,
  tokenHash: string,
  familyId: string
): Promise<void> {
  const id = generateId();
  const now = nowISO();
  const expiresAt = new Date(
    Date.now() + REFRESH_TOKEN_MAX_AGE * 1000
  ).toISOString();

  await db
    .prepare(
      "INSERT INTO refresh_tokens (id, user_id, token_hash, family_id, status, expires_at, created_at) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)"
    )
    .bind(id, userId, tokenHash, familyId, expiresAt, now)
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

// 동시 요청 grace period: 30초 이내에 같은 family의 ACTIVE 토큰이 있으면 race condition으로 판단
const RACE_GRACE_MS = 30_000;

export interface RotateResult {
  userId: string;
  chzzkUserId: string;
  nickname: string;
  /** race condition grace 시 null (새 토큰 발급 불필요) */
  newRawToken: string | null;
  newTokenHash: string | null;
  familyId: string;
}

export async function rotateRefreshToken(
  db: D1Database,
  rawToken: string
): Promise<RotateResult | null> {
  const tokenHash = await hashToken(rawToken);

  // 1. 토큰 해시로 DB 조회
  const row = await db
    .prepare("SELECT * FROM refresh_tokens WHERE token_hash = ?")
    .bind(tokenHash)
    .first<RefreshTokenRow>();

  if (!row) return null;

  // 2. USED/REVOKED면 → grace period 확인 후 reuse detection
  if (row.status === "USED" || row.status === "REVOKED") {
    // 동시 요청 grace: 같은 family에 최근 발급된 ACTIVE 토큰이 있으면
    // 정상적인 동시 요청으로 판단하고 사용자 정보만 반환
    if (row.status === "USED") {
      const recentActive = await db
        .prepare(
          "SELECT id FROM refresh_tokens WHERE family_id = ? AND status = 'ACTIVE' AND created_at > ? LIMIT 1"
        )
        .bind(row.family_id, new Date(Date.now() - RACE_GRACE_MS).toISOString())
        .first<{ id: string }>();

      if (recentActive) {
        const user = await db
          .prepare("SELECT id, chzzk_user_id, nickname FROM users WHERE id = ?")
          .bind(row.user_id)
          .first<{ id: string; chzzk_user_id: string; nickname: string }>();
        if (!user) return null;
        return {
          userId: user.id,
          chzzkUserId: user.chzzk_user_id,
          nickname: user.nickname,
          newRawToken: null,
          newTokenHash: null,
          familyId: row.family_id,
        };
      }
    }

    await revokeRefreshTokenFamily(db, row.family_id);
    return null;
  }

  // 3. 만료 확인
  if (new Date(row.expires_at) <= new Date()) {
    return null;
  }

  // 4. 동시성 대응: UPDATE ... WHERE status='ACTIVE' + changes 체크
  const updateResult = await db
    .prepare(
      "UPDATE refresh_tokens SET status = 'USED', used_at = ? WHERE id = ? AND status = 'ACTIVE'"
    )
    .bind(nowISO(), row.id)
    .run();

  if (!updateResult.meta.changes || updateResult.meta.changes === 0) {
    // Race condition: 다른 요청이 이미 이 토큰을 사용함.
    // 같은 family에 최근(30초 이내) 발급된 ACTIVE 토큰이 있으면
    // 정상적인 동시 요청으로 판단하고 사용자 정보만 반환한다.
    const recentActive = await db
      .prepare(
        "SELECT id FROM refresh_tokens WHERE family_id = ? AND status = 'ACTIVE' AND created_at > ? LIMIT 1"
      )
      .bind(row.family_id, new Date(Date.now() - RACE_GRACE_MS).toISOString())
      .first<{ id: string }>();

    if (recentActive) {
      // Grace: 새 토큰 발급 없이 사용자 정보만 반환
      const user = await db
        .prepare("SELECT id, chzzk_user_id, nickname FROM users WHERE id = ?")
        .bind(row.user_id)
        .first<{ id: string; chzzk_user_id: string; nickname: string }>();
      if (!user) return null;
      return {
        userId: user.id,
        chzzkUserId: user.chzzk_user_id,
        nickname: user.nickname,
        newRawToken: null,
        newTokenHash: null,
        familyId: row.family_id,
      };
    }

    // 최근 ACTIVE 토큰 없음 → 진짜 토큰 재사용(탈취) → family 폐기
    await revokeRefreshTokenFamily(db, row.family_id);
    return null;
  }

  // 5. 새 토큰 생성, 같은 family_id
  const newRawToken = generateRefreshToken();
  const newTokenHash = await hashToken(newRawToken);
  await createRefreshTokenInDB(db, row.user_id, newTokenHash, row.family_id);

  // 6. user 정보 조회
  const user = await db
    .prepare(
      "SELECT id, chzzk_user_id, nickname FROM users WHERE id = ?"
    )
    .bind(row.user_id)
    .first<{ id: string; chzzk_user_id: string; nickname: string }>();

  if (!user) return null;

  return {
    userId: user.id,
    chzzkUserId: user.chzzk_user_id,
    nickname: user.nickname,
    newRawToken,
    newTokenHash,
    familyId: row.family_id,
  };
}
