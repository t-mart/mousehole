import type { Context } from "hono";

import { deleteCookie, setCookie } from "hono/cookie";
import { parse as parseCookieHeader } from "hono/utils/cookie";

import { config } from "./config";
import { closeSessionStreams } from "./sse";

export const SESSION_COOKIE_NAME = "mousehole-session";

const SESSION_DURATION_MS = config.sessionDurationSeconds * 1000;

type SessionEntry = {
  expiry: number;
  expiryTimeoutId: ReturnType<typeof setTimeout>;
};

const sessions = new Map<string, SessionEntry>();

export function createSession(durationMs = SESSION_DURATION_MS): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const sessionId = Buffer.from(bytes).toString("base64url");
  const expiryTimeoutId = setTimeout(() => deleteSession(sessionId), durationMs);
  (expiryTimeoutId as { unref?: () => void }).unref?.();
  sessions.set(sessionId, {
    expiry: Date.now() + durationMs,
    expiryTimeoutId,
  });
  return sessionId;
}

function pruneExpiredSessions(): void {
  const now = Date.now();
  for (const [id, entry] of sessions) {
    if (entry.expiry <= now) deleteSession(id);
  }
}

export function validateRequestSession(request: Request): boolean {
  pruneExpiredSessions();
  const sessionId = extractSessionId(request);
  return sessionId !== undefined && sessions.has(sessionId);
}

export function deleteSession(sessionId: string): void {
  const entry = sessions.get(sessionId);
  sessions.delete(sessionId);
  if (entry) {
    clearTimeout(entry.expiryTimeoutId);
    // Close this session's SSE streams; the client repulls GET /state, gets 401,
    // and shows the login screen.
    closeSessionStreams(sessionId);
  }
}

export function deleteRequestSession(request: Request): void {
  const sessionId = extractSessionId(request);
  if (sessionId) deleteSession(sessionId);
}

export function extractSessionId(request: Request): string | undefined {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return undefined;
  return parseCookieHeader(cookieHeader, SESSION_COOKIE_NAME)[
    SESSION_COOKIE_NAME
  ];
}

export function applySessionCookie(c: Context, sessionId: string): void {
  setCookie(c, SESSION_COOKIE_NAME, sessionId, {
    maxAge: config.sessionDurationSeconds,
    httpOnly: true,
    sameSite: "lax",
    secure: config.httpsOnlyCookies,
    path: "/",
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
}
