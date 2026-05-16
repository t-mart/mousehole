import { notifyWebSocketClients } from "#index.tsx";
import { getNowZdt } from "#shared/time.ts";

import type {
  BackgroundTask,
  HostInfo,
  MamResponse,
  ManualUpdateReason,
  State,
  UpdateReason,
} from "./types.ts";

import { config } from "./config.ts";
import { NoCookieError } from "./error.ts";
import { getHostInfo } from "./external-api/host-info.ts";
import { updateMamIp } from "./external-api/mam.ts";
import { Mutex } from "./mutex.ts";
import { stateFile } from "./store.ts";

// ── internal work ─────────────────────────────────────────────────────────────

let currentBackgroundTask: BackgroundTask | undefined;
export const updateMutex = new Mutex();

type UpdateOptions = {
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
): UpdateReason | undefined {
  const lastMamResponse = state?.lastMam;

  if (!lastMamResponse) {
    return "no-last-response";
  } else if (lastMamResponse.response.httpStatus !== 200) {
    return "last-response-error";
  } else if (hostInfo.ip !== lastMamResponse.response.body.ip) {
    return "ip-changed";
  } else if (hostInfo.asn !== lastMamResponse.response.body.ASN) {
    return "asn-changed";
  } else if (responseIsStale(lastMamResponse)) {
    return "response-stale";
  }
}

async function coreUpdate(options?: UpdateOptions): Promise<State> {
  const force = options?.force ?? false;

  const state = await stateFile.readIfExists();

  if (!state?.currentCookie) {
    throw new NoCookieError();
  }

  const hostInfo = await getHostInfo();

  const reason: ManualUpdateReason | undefined = force
    ? "forced"
    : getUpdateReason(state, hostInfo);

  if (!reason) {
    console.log("No update needed, current state is ok");
    const newState: State = {
      currentCookie: state.currentCookie,
      lastMam: state.lastMam,
      lastUpdate: {
        at: getNowZdt(),
        mamUpdated: false,
        mamUpdateReason: undefined,
      },
    };
    return newState;
  }

  console.log(`Updating MAM because: ${reason}`);

  const mamResponse = await updateMamIp(state.currentCookie);

  const success = mamResponse.response.httpStatus === 200;

  if (success) {
    console.log("IP address updated with MAM");
  } else {
    console.error(
      `Failed to update IP address with MAM: ${mamResponse.response.httpStatus} - ${mamResponse.response.body.msg}`,
    );
  }

  if (!mamResponse.response.cookie) {
    console.warn("No cookie returned in MAM response, using previous value");
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
  return newState;
}

async function runUpdate(options?: UpdateOptions): Promise<State> {
  const release = await updateMutex.acquire();
  try {
    const newState = await coreUpdate(options);
    await stateFile.write(newState);
    notifyWebSocketClients();
    return newState;
  } finally {
    scheduleNext();
    release();
  }
}

// ── timer ─────────────────────────────────────────────────────────────────────

/**
 * Clear any current timer and schedule the next one
 * `config.checkIntervalSeconds` seconds from now.
 */
function scheduleNext() {
  if (currentBackgroundTask?.nextUpdateTimeoutId) {
    clearTimeout(currentBackgroundTask.nextUpdateTimeoutId);
  }

  const timeoutId = setTimeout(
    () => runUpdate().catch(console.error),
    config.checkIntervalSeconds * 1000,
  );

  // this won't be exactly right because of the time between last statement
  // (setTimeout) and this line but it will be close enough. this is just
  // for informational/logging purposes anyway.
  const nextUpdateAt = getNowZdt().add({
    seconds: config.checkIntervalSeconds,
  });

  currentBackgroundTask = { nextUpdateTimeoutId: timeoutId, nextUpdateAt };

  console.log(`Next automatic update scheduled for: ${nextUpdateAt}`);
}

// ── public API ────────────────────────────────────────────────────────────────

// Called by the HTTP handler. Throws on error — caller returns 500.
export function triggerUpdate(options?: UpdateOptions): Promise<State> {
  return runUpdate(options);
}

// Called once at startup.
export function startBackgroundUpdateTask() {
  console.log("Starting background update task...");
  runUpdate().catch(console.error);
}

export function getNextUpdateAt() {
  return currentBackgroundTask?.nextUpdateAt;
}
