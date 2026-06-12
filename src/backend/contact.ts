import type { Temporal } from "temporal-polyfill";

import { getNowZdt } from "#shared/time.ts";

import type { FetchLike } from "./external-api/fetch.ts";
import type { StateFileStore } from "./state/store.ts";

import { toErrorResponseArgs } from "./error.ts";
import { getHostInfo, type HostInfo } from "./external-api/host-info.ts";
import { updateMamIp } from "./external-api/mam.ts";
import { logger } from "./logger.ts";
import { Mutex } from "./mutex.ts";
import { type MamContact, type State } from "./state/serde.ts";

type BackgroundTask = {
  nextContactTimeoutId: ReturnType<typeof setTimeout>;
  nextContactAt: Temporal.ZonedDateTime;
};

export type ContactSchedulerOptions = {
  /** Seconds between automatic contacts with MAM. */
  intervalSeconds: number;
  userAgent: string;
  mamRequestTimeoutSeconds: number;
  stateFile: StateFileStore;
  /** Called after every persisted contact so dashboards re-pull GET /state. */
  notifyClients: () => void;
  /** The fetch used for MAM calls; tests inject a fake (see tests/fake-mam.ts). */
  fetchImpl?: FetchLike;
};

export type ContactScheduler = ReturnType<typeof createContactScheduler>;

// A contact records transport failures into state rather than throwing, so this
// only fires for unexpected problems (e.g. a corrupt state file or a failed write).
function handleBackgroundContactError(error: unknown) {
  logger.error(error);
}

/**
 * Owns the contact loop: talking to MAM, persisting the result, and the
 * interval timer. One scheduler per app instance (see context.ts).
 */
export function createContactScheduler(options: ContactSchedulerOptions) {
  const { stateFile, notifyClients } = options;
  const fetchOptions = {
    userAgent: options.userAgent,
    timeoutSeconds: options.mamRequestTimeoutSeconds,
    fetchImpl: options.fetchImpl,
  };

  let currentBackgroundTask: BackgroundTask | undefined;
  let stopped = false;
  const mutex = new Mutex();

  // A contact always reaches out to MAM. With a cookie it performs an IP update
  // via dynamicSeedbox (which also reports the host IP); without one it just looks
  // up the IP via jsonIp so a not-yet-configured user can still see it. Transport
  // failures are recorded as an unreachable contact, not thrown.
  async function contactMam(prior: State | undefined): Promise<State> {
    const cookie = prior?.cookie;
    const at = getNowZdt();

    try {
      if (!cookie) {
        const host: HostInfo = await getHostInfo(fetchOptions);
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

      const result = await updateMamIp(cookie, fetchOptions);
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
      return {
        cookie: result.rotatedCookie ?? cookie,
        lastMamContact: contact,
      };
    } catch (error) {
      const { type, message } = toErrorResponseArgs(error).body;
      logger.error(`Could not reach MAM: ${message}`);
      return {
        cookie,
        lastMamContact: { at, reached: false, error: { type, message } },
      };
    }
  }

  /**
   * Clear any current timer and schedule the next contact
   * `intervalSeconds` seconds from now. No-op once stopped.
   */
  function scheduleNext() {
    if (currentBackgroundTask?.nextContactTimeoutId) {
      clearTimeout(currentBackgroundTask.nextContactTimeoutId);
    }
    if (stopped) {
      currentBackgroundTask = undefined;
      return;
    }

    const timeoutId = setTimeout(() => {
      void commitContact().catch(handleBackgroundContactError);
    }, options.intervalSeconds * 1000);
    // The listener (server) keeps the process alive; an armed contact timer
    // alone shouldn't (relevant for tests and shutdown).
    (timeoutId as { unref?: () => void }).unref?.();

    // this isn't totally accurate; impossible to get end time of a setTimeout and
    // the event loop doesn't event guarantee timely execution. this is just for
    // informational/logging purposes
    const nextContactAt = getNowZdt().add({
      seconds: options.intervalSeconds,
    });

    currentBackgroundTask = { nextContactTimeoutId: timeoutId, nextContactAt };

    logger.info(
      `Next automatic update scheduled for ${nextContactAt.toString()}`,
    );
  }

  /**
   * Contact MAM, persist the result, and reschedule the next automatic contact.
   * Serialized by a mutex, so the whole read-modify-write is atomic against the
   * background loop or any other requests that use this method.
   *
   * The single entry point for every contact — startup, the interval timer, `POST
   * /updates`, and `PUT /cookie`.
   *
   * @param newCookie - When provided, the cookie is replaced with this value
   *   *before* contacting MAM, inside the same locked section. Omit to contact
   *   with the cookie already on disk (startup, interval, `POST /updates`).
   * @returns the persisted state after the contact. Throws on an unexpected
   *   failure (e.g. a failed write) — an HTTP caller turns that into a 500.
   */
  async function commitContact(newCookie?: string): Promise<State> {
    const release = await mutex.acquire();
    try {
      const diskState = await stateFile.readIfExists();
      const base =
        newCookie === undefined
          ? diskState
          : { ...diskState, cookie: newCookie };
      const state = await contactMam(base);
      await stateFile.write(state);
      notifyClients();
      return state;
    } finally {
      scheduleNext();
      release();
    }
  }

  return {
    commitContact,

    /** Start the background loop: contact immediately, then on the interval. */
    start(): void {
      commitContact().catch(handleBackgroundContactError);
      logger.info(
        `Background update task started, running on ${options.intervalSeconds} second interval`,
      );
    },

    /**
     * Stop the loop: cancel the pending timer, refuse rescheduling, and drain
     * any in-flight contact (the mutex is taken and never released).
     */
    async stop(): Promise<void> {
      stopped = true;
      if (currentBackgroundTask?.nextContactTimeoutId) {
        clearTimeout(currentBackgroundTask.nextContactTimeoutId);
        currentBackgroundTask = undefined;
      }
      await mutex.acquire();
    },

    getNextContactAt(): Temporal.ZonedDateTime | undefined {
      return currentBackgroundTask?.nextContactAt;
    },
  };
}
