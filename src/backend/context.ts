import type { Config } from "./config.ts";

import { createContactScheduler, type ContactScheduler } from "./contact.ts";
import { createSessionStore, type SessionStore } from "./session.ts";
import { createSseRegistry, type SseRegistry } from "./sse.ts";
import { StateFileStore } from "./store.ts";

/**
 * Everything stateful or configured, built once per process (or per test).
 * Threaded into `createApp` by closure — no module owns mutable state, so two
 * contexts never share sessions, SSE clients, timers, or files.
 */
export type AppContext = {
  config: Config;
  stateFile: StateFileStore;
  sessions: SessionStore;
  sse: SseRegistry;
  contacts: ContactScheduler;
};

export function createAppContext(config: Config): AppContext {
  const stateFile = new StateFileStore(config.stateDirPath);
  const sse = createSseRegistry();
  const sessions = createSessionStore({
    durationSeconds: config.sessionDurationSeconds,
    httpsOnlyCookies: config.httpsOnlyCookies,
    // Closing a deleted session's streams makes the client re-pull GET /state,
    // get a 401, and land on the login screen.
    onSessionDeleted: (sessionId) => sse.closeSessionStreams(sessionId),
  });
  const contacts = createContactScheduler({
    checkIntervalSeconds: config.checkIntervalSeconds,
    userAgent: config.userAgent,
    mamRequestTimeoutSeconds: config.mamRequestTimeoutSeconds,
    stateFile,
    notifyClients: () => sse.notify(),
  });

  return { config, stateFile, sessions, sse, contacts };
}
