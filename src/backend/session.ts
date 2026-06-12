import type { Context } from "hono";

import { deleteCookie, setCookie } from "hono/cookie";
import { parse as parseCookieHeader } from "hono/utils/cookie";

export const SESSION_COOKIE_NAME = "mousehole-session";

type SessionEntry = {
  expiry: number;
  expiryTimeoutId: ReturnType<typeof setTimeout>;
};

export type SessionStoreOptions = {
  /** How long a session lives. Also drives the cookie's Max-Age. */
  durationSeconds: number;
  /** Whether to set the "Secure" flag on the session cookie. */
  httpsOnlyCookies: boolean;
  /** Fired after a known session is removed (expiry, logout, or manual). */
  onSessionDeleted?: (sessionId: string) => void;
};

export type SessionStore = ReturnType<typeof createSessionStore>;

/** Browser sessions; one store per app instance (see context.ts). */
export function createSessionStore(options: SessionStoreOptions) {
  const sessions = new Map<string, SessionEntry>();
  const defaultDurationMs = options.durationSeconds * 1000;

  function deleteSession(sessionId: string): void {
    const entry = sessions.get(sessionId);
    sessions.delete(sessionId);
    if (entry) {
      clearTimeout(entry.expiryTimeoutId);
      options.onSessionDeleted?.(sessionId);
    }
  }

  function pruneExpiredSessions(): void {
    const now = Date.now();
    for (const [id, entry] of sessions) {
      if (entry.expiry <= now) deleteSession(id);
    }
  }

  function create(durationMs = defaultDurationMs): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const sessionId = Buffer.from(bytes).toString("base64url");
    const expiryTimeoutId = setTimeout(
      () => deleteSession(sessionId),
      durationMs,
    );
    (expiryTimeoutId as { unref?: () => void }).unref?.();
    sessions.set(sessionId, {
      expiry: Date.now() + durationMs,
      expiryTimeoutId,
    });
    return sessionId;
  }

  function isSessionValid(request: Request): boolean {
    pruneExpiredSessions();
    const sessionId = extractSessionId(request);
    return sessionId !== undefined && sessions.has(sessionId);
  }

  function deleteRequestSession(request: Request): void {
    const sessionId = extractSessionId(request);
    if (sessionId) deleteSession(sessionId);
  }

  function applyCookie(c: Context, sessionId: string): void {
    setCookie(c, SESSION_COOKIE_NAME, sessionId, {
      maxAge: options.durationSeconds,
      httpOnly: true,
      sameSite: "lax",
      secure: options.httpsOnlyCookies,
      path: "/",
    });
  }

  return {
    create,
    isSessionValid,
    deleteSession,
    deleteRequestSession,
    applyCookie,
    clearCookie,
  };
}

// Clearing the cookie needs no per-store state, but lives on the store's API
// next to applyCookie, its counterpart.
function clearCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
}

export function extractSessionId(request: Request): string | undefined {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return undefined;
  return parseCookieHeader(cookieHeader, SESSION_COOKIE_NAME)[
    SESSION_COOKIE_NAME
  ];
}
