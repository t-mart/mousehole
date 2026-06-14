import type { Config } from "./config.ts";
import type { FetchLike } from "./external-api/fetch.ts";

import { createContactScheduler, type ContactScheduler } from "./contact.ts";
import { createSessionStore, type SessionStore } from "./session.ts";
import { createSseRegistry, type SseRegistry } from "./sse.ts";
import { StateFileStore, type StateStore } from "./state/store.ts";

/**
 * Everything stateful or configured, built once per process (or per test).
 * Threaded into `createApp` by closure — no module owns mutable state, so two
 * contexts never share sessions, SSE clients, timers, or files.
 */
export type AppContext = {
  config: Config;
  stateFile: StateStore;
  sessions: SessionStore;
  sse: SseRegistry;
  contacts: ContactScheduler;
};

/** Test seams that aren't part of `Config`. */
export type AppContextOverrides = {
  /** The fetch used for MAM calls; tests inject the MAM test server's fetch. */
  fetchImpl?: FetchLike;
  /** Where state is persisted; tests inject an in-memory store. */
  stateFile?: StateStore;
};

export function createAppContext(
  config: Config,
  overrides: AppContextOverrides = {},
): AppContext {
  const stateFile =
    overrides.stateFile ?? new StateFileStore(config.stateDirPath);
  const sse = createSseRegistry();
  const sessions = createSessionStore({
    durationSeconds: config.sessionDurationSeconds,
    httpsOnlyCookies: config.httpsOnlyCookies,
    // Closing a deleted session's streams makes the client re-pull GET /state,
    // get a 401, and land on the login screen.
    onSessionDeleted: (sessionId) => sse.closeSessionStreams(sessionId),
  });
  const contacts = createContactScheduler({
    intervalSeconds: config.updateIntervalSeconds,
    mamRequestTimeoutSeconds: config.mamRequestTimeoutSeconds,
    stateFile,
    notifyClients: () => sse.notify(),
    fetchImpl: overrides.fetchImpl,
  });

  return { config, stateFile, sessions, sse, contacts };
}
