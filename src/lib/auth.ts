import { SignJWT, jwtVerify } from "jose";
import { NextRequest } from "next/server";
import type { JwtPayload } from "@/types";

const COOKIE_NAME = "session";
const MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

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
    .setExpirationTime(`${MAX_AGE}s`)
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
  return `${COOKIE_NAME}=${token}; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`;
}

export function deleteSessionCookie(): string {
  const secure = process.env.NODE_ENV !== "development";
  return `${COOKIE_NAME}=; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax; Path=/; Max-Age=0`;
}
