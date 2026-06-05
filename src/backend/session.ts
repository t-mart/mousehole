import { CookieMap, type BunRequest } from "bun";

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
  return new CookieMap(request.headers.get("cookie") ?? "").get(SESSION_COOKIE_NAME) ?? undefined;
}

function sessionCookieOptions() {
  return {
    maxAge: config.sessionDurationSeconds,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.httpsOnlyCookies,
    path: "/",
  };
}

export function applySessionCookie(request: BunRequest, sessionId: string): void {
  request.cookies.set(SESSION_COOKIE_NAME, sessionId, sessionCookieOptions());
}

export function clearSessionCookie(request: BunRequest): void {
  request.cookies.delete(SESSION_COOKIE_NAME, { path: "/" });
}
