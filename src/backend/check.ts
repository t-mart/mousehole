import {
  notifyWebSocketClients,
  notifyWebSocketClientsOfError,
} from "#backend/websocket.ts";
import { getNowZdt } from "#shared/time.ts";

import type {
  BackgroundTask,
  HostInfo,
  MamResponse,
  State,
  UpdateReason,
} from "./types.ts";

import { config } from "./config.ts";
import { getIsOnline } from "./connectivity.ts";
import { NoCookieError } from "./error.ts";
import { getHostInfo } from "./external-api/host-info.ts";
import { updateMamIp } from "./external-api/mam.ts";
import { logger } from "./logger.ts";
import { Mutex } from "./mutex.ts";
import { serializePublicState } from "./serde.ts";
import { stateFile } from "./store.ts";

// This prevents multiple check timers from running during development hot
// module reloading. globalThis persists across re-evaluations; module-scoped
// `generation` does not. Old instances see a mismatch and stop scheduling
// further work. This might be a Bun bug... normal solutions like
// import.meta.hot.dispose() don't seem to work on backend modules.
declare const globalThis: { __updateGeneration?: number };
const generation = (globalThis.__updateGeneration =
  (globalThis.__updateGeneration ?? 0) + 1);

function __is_old_updater_from_hmr_during_development() {
  return globalThis.__updateGeneration !== generation;
}

let currentBackgroundTask: BackgroundTask | undefined;
export const checkMutex = new Mutex();

type CheckOptions = {
  force: boolean;
};

function responseIsStale(response: MamResponse): boolean {
  // Check if the last response is older than the force update interval.
  const performedAt = response.request.at;
  const staleAt = performedAt.add({
    seconds: config.staleResponseSeconds,
  });
  return staleAt.epochNanoseconds <= getNowZdt().epochNanoseconds;
}

export function getUpdateReason(
  state: State | undefined,
  hostInfo: HostInfo,
  force: boolean,
): UpdateReason | undefined {
  if (force) {
    return "force-update";
  }

  const lastMamResponse = state?.lastMam;
  if (!lastMamResponse) {
    return "no-last-response";
  }
  if (lastMamResponse.response.httpStatus !== 200) {
    return "last-response-error";
  }
  if (hostInfo.ip !== lastMamResponse.response.body.ip) {
    return "ip-changed";
  }
  if (hostInfo.asn !== lastMamResponse.response.body.ASN) {
    return "asn-changed";
  }
  if (state.currentCookie !== lastMamResponse.response.cookie) {
    return "cookie-changed";
  }
  if (responseIsStale(lastMamResponse)) {
    return "response-stale";
  }
}

async function performCheck(
  options?: CheckOptions,
): Promise<{ state: State; hostInfo: HostInfo }> {
  const force = options?.force ?? false;

  const state = await stateFile.readIfExists();

  if (!state?.currentCookie) {
    throw new NoCookieError();
  }

  const hostInfo = await getHostInfo();

  const reason = getUpdateReason(state, hostInfo, force);

  if (!reason) {
    logger.info("No update needed, current state is ok");
    const newState: State = {
      currentCookie: state.currentCookie,
      lastMam: state.lastMam,
      lastUpdate: {
        at: getNowZdt(),
        mamUpdated: false,
        mamUpdateReason: undefined,
      },
    };
    return { state: newState, hostInfo };
  }

  logger.info(`Updating MAM because: ${reason}`);

  const mamResponse = await updateMamIp(state.currentCookie);

  const success = mamResponse.response.httpStatus === 200;

  if (success) {
    logger.info("IP address updated with MAM");
  } else {
    logger.error(
      `Failed to update IP address with MAM: ${mamResponse.response.httpStatus} - ${mamResponse.response.body.msg}`,
    );
  }

  if (!mamResponse.response.cookie) {
    logger.warn("No cookie returned in MAM response, using previous value");
  }
  const nextCookieValue = mamResponse.response.cookie ?? state.currentCookie;

  const newState: State = {
    currentCookie: nextCookieValue,
    lastMam: mamResponse,
    lastUpdate: {
      at: getNowZdt(),
      mamUpdated: true,
      mamUpdateReason: reason,
    },
  };
  return { state: newState, hostInfo };
}

async function runCheck(options?: CheckOptions): Promise<State> {
  const release = await checkMutex.acquire();
  let result: { state: State; hostInfo: HostInfo } | undefined;
  try {
    result = await performCheck(options);
    await stateFile.write(result.state);
    return result.state;
  } finally {
    scheduleNext();
    if (result) {
      notifyWebSocketClients({
        host: result.hostInfo,
        nextCheckAt: getNextCheckAt()?.toString(),
        hasAuth: config.auth.type === "configured",
        isOnline: getIsOnline(),
        ...serializePublicState(result.state),
      });
    }
    release();
  }
}

// ── timer ─────────────────────────────────────────────────────────────────────

/**
 * Clear any current timer and schedule the next check
 * `config.checkIntervalSeconds` seconds from now.
 */
function scheduleNext() {
  if (__is_old_updater_from_hmr_during_development()) return;

  if (currentBackgroundTask?.nextCheckTimeoutId) {
    clearTimeout(currentBackgroundTask.nextCheckTimeoutId);
  }

  const timeoutId = setTimeout(() => {
    void runCheck().catch(handleBackgroundCheckError);
  }, config.checkIntervalSeconds * 1000);

  // this won't be exactly right because of the time between last statement
  // (setTimeout) and this line but it will be close enough. this is just
  // for informational/logging purposes anyway.
  const nextCheckAt = getNowZdt().add({
    seconds: config.checkIntervalSeconds,
  });

  currentBackgroundTask = { nextCheckTimeoutId: timeoutId, nextCheckAt };

  logger.info(`Next automatic check scheduled for: ${nextCheckAt.toString()}`);
}

function handleBackgroundCheckError(error: unknown) {
  if (error instanceof NoCookieError) {
    logger.error("No MAM cookie set. Visit the web UI to configure one.");
    return;
  }
  logger.error(error);
  // Background failures never produce a state-update notification, so push the
  // message to any open dashboard explicitly — otherwise the UI silently shows
  // stale data until the next reconnect.
  notifyWebSocketClientsOfError(
    error instanceof Error
      ? error.message
      : "The background check failed unexpectedly.",
  );
}

// ── public API ────────────────────────────────────────────────────────────────

// Called by the HTTP handler. Throws on error — caller returns 500.
export function triggerCheck(options?: CheckOptions): Promise<State> {
  return runCheck(options);
}

// Called once at startup.
export function startBackgroundCheckTask() {
  runCheck().catch(handleBackgroundCheckError);
  logger.info(
    `Background check task started, running on ${config.checkIntervalSeconds} second interval`,
  );
}

// Called on hot reload to cancel the pending timer before the module re-evaluates.
export function stopBackgroundCheckTask() {
  if (currentBackgroundTask?.nextCheckTimeoutId) {
    clearTimeout(currentBackgroundTask.nextCheckTimeoutId);
    currentBackgroundTask = undefined;
  }
}

export function getNextCheckAt() {
  return currentBackgroundTask?.nextCheckAt;
}
