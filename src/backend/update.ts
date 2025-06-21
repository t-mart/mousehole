import { notifyWebSocketClients } from "#index.tsx";

import type {
  BackgroundTask,
  MamResponse,
  ManualUpdateReason,
  State,
  UpdateReason,
} from "./types.ts";

import { config } from "./config.ts";
import { NoCookieError } from "./error.ts";
import { getHostIp } from "./external-api/host-ip.ts";
import { updateMamIp } from "./external-api/mam.ts";
import { stateFile } from "./store.ts";
import { getNowZdt } from "./time.ts";

let currentBackgroundTask: BackgroundTask | undefined;

type UpdateOptions = {
  force: boolean;
};

export function getUpdateReason(
  state: State | undefined,
  hostIp: string
): UpdateReason {
  const lastMamResponse = state?.lastMam;

  if (!lastMamResponse) {
    return "no-last-response";
  } else if (lastMamResponse.response.httpStatus !== 200) {
    return "last-response-error";
  } else if (hostIp !== lastMamResponse.response.body.ip) {
    return "ip-changed";
  } else if (responseIsStale(lastMamResponse)) {
    return "response-stale";
  }
}

/**
 * Perform the core IP update logic
 */
async function update(options?: UpdateOptions): Promise<State> {
  const force = options?.force ?? false;

  const state = await stateFile.readIfExists();
  const { ip: hostIp } = await getHostIp();

  if (!state?.currentCookie) {
    throw new NoCookieError();
  }

  const reason: ManualUpdateReason = force
    ? "forced"
    : getUpdateReason(state, hostIp);

  if (!reason) {
    console.log("No update needed, current state is ok");
    const newState: State = {
      currentCookie: state.currentCookie,
      lastMam: state.lastMam,
      lastUpdate: {
        at: getNowZdt(),
        hostIp,
        mamUpdated: false,
        mamUpdateReason: reason,
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
      `Failed to update IP address with MAM: ${mamResponse.response.httpStatus} - ${mamResponse.response.body.msg}`
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
      hostIp,
      mamUpdated: true,
      mamUpdateReason: reason,
    },
  };
  return newState;
}

function responseIsStale(response: MamResponse): boolean {
  // Check if the last response is older than the force update interval.
  const performedAt = response.request.at;
  const staleAt = performedAt.add({
    seconds: config.staleResponseSeconds,
  });
  return staleAt.epochNanoseconds <= getNowZdt().epochNanoseconds;
}

/**
 * Clears any existing scheduled task and sets a new one.
 */
function reschedule() {
  // Cancel the previously scheduled task, if it exists.
  if (currentBackgroundTask?.nextUpdateTimeoutId) {
    clearTimeout(currentBackgroundTask.nextUpdateTimeoutId);
  }

  // Schedule the next run.
  const timeoutId = setTimeout(
    updateAndReschedule,
    config.checkIntervalSeconds * 1000
  );

  // this won't be exactly right because of the time between last statement
  // (setTimeout) and this line but it will be close enough for our purposes.
  const nextUpdateAt = getNowZdt().add({
    seconds: config.checkIntervalSeconds,
  });

  currentBackgroundTask = {
    nextUpdateTimeoutId: timeoutId,
    nextUpdateAt,
  };

  console.log(`Next automatic update scheduled for: ${nextUpdateAt}`);
}

/**
 * Manually update the IP and resets the automatic update schedule.
 * This is the function to call when a user initiates the update.
 * @returns The result of the MAM update.
 */
export async function updateAndReschedule(options?: UpdateOptions) {
  try {
    const newState = await update(options);

    // write, but also return to callers (such as API handlers)
    await stateFile.write(newState);

    // notify websocket clients
    notifyWebSocketClients();

    return newState;
  } finally {
    reschedule();
  }
}

/**
 * Starts the background task scheduler.
 * Call this once when server starts.
 */
export function startBackgroundUpdateTask() {
  console.log("Starting background update task...");
  // We run the update once immediately, then schedule the next one.
  updateAndReschedule();
}

export function getNextUpdateAt() {
  return currentBackgroundTask?.nextUpdateAt;
}
