import type { Temporal } from "temporal-polyfill";

import { getNowZdt } from "#shared/time.ts";

import type { MamContact, State } from "./serde.ts";

import { config } from "./config.ts";
import { toJSONResponseArgs } from "./error.ts";
import { getHostInfo } from "./external-api/host-info.ts";
import { updateMamIp } from "./external-api/mam.ts";
import { logger } from "./logger.ts";
import { Mutex } from "./mutex.ts";
import { stateFile } from "./store.ts";

// This prevents multiple contact timers from running during development hot
// module reloading. globalThis persists across re-evaluations; module-scoped
// `generation` does not. Old instances see a mismatch and stop scheduling
// further work. This might be a Bun bug... normal solutions like
// import.meta.hot.dispose() don't seem to work on backend modules.
declare const globalThis: { __contactGeneration?: number };
const generation = (globalThis.__contactGeneration =
  (globalThis.__contactGeneration ?? 0) + 1);

function __is_stale_contact_task_from_hmr_during_development() {
  return globalThis.__contactGeneration !== generation;
}

type BackgroundTask = {
  nextContactTimeoutId: ReturnType<typeof setTimeout>;
  nextContactAt: Temporal.ZonedDateTime;
};

let currentBackgroundTask: BackgroundTask | undefined;
export const contactMutex = new Mutex();

// A contact always reaches out to MAM. With a cookie it performs an IP update via
// dynamicSeedbox (which also reports the host IP); without one it just looks up the
// IP via jsonIp so a not-yet-configured user can still see it. Transport failures
// are recorded as an unreachable contact, not thrown.
async function contactMam(): Promise<State> {
  const prior = await stateFile.readIfExists();
  const cookie = prior?.cookie;
  const at = getNowZdt();

  try {
    if (!cookie) {
      const host = await getHostInfo();
      logger.info("Looked up host IP (no cookie set yet)");
      return {
        lastMamContact: {
          at,
          reached: true,
          ip: host.ip,
          asn: host.asn,
          as: host.as,
        },
      };
    }

    const result = await updateMamIp(cookie);
    if (result.success) {
      logger.info(`MAM update: ${result.msg}`);
    } else {
      logger.error(
        `MAM update not applied (${result.httpStatus}): ${result.msg}`,
      );
    }

    const contact: MamContact = {
      at,
      reached: true,
      ip: result.ip,
      asn: result.asn,
      as: result.as,
      ipUpdate: {
        success: result.success,
        msg: result.msg,
        httpStatus: result.httpStatus,
      },
    };
    return { cookie: result.rotatedCookie ?? cookie, lastMamContact: contact };
  } catch (error) {
    const { type, message } = toJSONResponseArgs(error).body;
    logger.error(`Could not reach MAM: ${message}`);
    return {
      cookie,
      lastMamContact: { at, reached: false, error: { type, message } },
    };
  }
}

// Runs one contact to completion and makes it official: serialized by the mutex,
// persisted, and with the next contact rescheduled. This is the entry point for
// both the startup/interval loop and on-demand HTTP contacts. Throws on an
// unexpected failure (e.g. a failed write) — an HTTP caller turns that into a 500.
export async function commitContactAndReschedule(): Promise<State> {
  const release = await contactMutex.acquire();
  try {
    const state = await contactMam();
    await stateFile.write(state);
    return state;
  } finally {
    scheduleNext();
    release();
  }
}

// ── timer ─────────────────────────────────────────────────────────────────────

/**
 * Clear any current timer and schedule the next contact
 * `config.checkIntervalSeconds` seconds from now.
 */
function scheduleNext() {
  if (__is_stale_contact_task_from_hmr_during_development()) return;

  if (currentBackgroundTask?.nextContactTimeoutId) {
    clearTimeout(currentBackgroundTask.nextContactTimeoutId);
  }

  const timeoutId = setTimeout(() => {
    void commitContactAndReschedule().catch(handleBackgroundContactError);
  }, config.checkIntervalSeconds * 1000);

  // this isn't totally accurate; impossible to get end time of a setTimeout and
  // the event loop doesn't event guarantee timely execution. this is just for
  // informational/logging purposes
  const nextContactAt = getNowZdt().add({
    seconds: config.checkIntervalSeconds,
  });

  currentBackgroundTask = { nextContactTimeoutId: timeoutId, nextContactAt };

  logger.info(
    `Next automatic contact scheduled for: ${nextContactAt.toString()}`,
  );
}

// A contact records transport failures into state rather than throwing, so this
// only fires for unexpected problems (e.g. a corrupt state file or a failed write).
function handleBackgroundContactError(error: unknown) {
  logger.error(error);
}

// ── public API ────────────────────────────────────────────────────────────────

// Called once at startup.
export function startBackgroundContactTask() {
  commitContactAndReschedule().catch(handleBackgroundContactError);
  logger.info(
    `Background contact task started, running on ${config.checkIntervalSeconds} second interval`,
  );
}

// Called on hot reload to cancel the pending timer before the module re-evaluates.
export function stopBackgroundContactTask() {
  if (currentBackgroundTask?.nextContactTimeoutId) {
    clearTimeout(currentBackgroundTask.nextContactTimeoutId);
    currentBackgroundTask = undefined;
  }
}

export function getNextContactAt() {
  return currentBackgroundTask?.nextContactAt;
}
