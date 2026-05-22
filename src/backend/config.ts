import { existsSync } from "node:fs";
import path from "node:path";

import { version } from "../../package.json";

function environmentOrFallback<T>(
  name: string,
  fallback: T,
  mapFunction?: (s: string) => T,
): T {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }
  if (mapFunction) {
    return mapFunction(value);
  }
  return value as T;
}

// TODO: Remove this migration compatibility code in a future major release, after giving
// users sufficient time to migrate.
const LEGACY_STATE_DIR = "/srv/mousehole";
const NEW_STATE_DIR = "/var/lib/mousehole";

function resolveStateDirectoryPath(): {
  stateDirPath: string;
  stateDirPathDeprecationWarning: string | undefined;
} {
  const environmentValue = process.env.MOUSEHOLE_STATE_DIR_PATH;

  if (environmentValue !== undefined) {
    return { stateDirPath: environmentValue, stateDirPathDeprecationWarning: undefined };
  }

  // No env var set — use filesystem to detect migration state.
  const legacyExists = existsSync(path.join(LEGACY_STATE_DIR, "state.json"));
  const newExists = existsSync(path.join(NEW_STATE_DIR, "state.json"));

  if (legacyExists && !newExists) {
    return {
      stateDirPath: LEGACY_STATE_DIR,
      stateDirPathDeprecationWarning:
        `[DEPRECATION] State found at legacy path ${LEGACY_STATE_DIR}. ` +
        `Migrate to ${NEW_STATE_DIR}. See https://github.com/t-mart/mousehole/issues/51 for migration steps.`,
    };
  }

  return { stateDirPath: NEW_STATE_DIR, stateDirPathDeprecationWarning: undefined };
}

const { stateDirPath, stateDirPathDeprecationWarning } = resolveStateDirectoryPath();
export { stateDirPathDeprecationWarning };

export const config = {
  /**
   * The user agent string to use for HTTP requests.
   *
   * Defaults to "mousehole-by-timtimtim".
   */
  userAgent: environmentOrFallback(
    "MOUSEHOLE_USER_AGENT",
    `mousehole-by-timtimtim/${version}`,
  ),

  /**
   * The directory path where Mousehole stores its state.
   *
   * Defaults to "/var/lib/mousehole", falling back to "/srv/mousehole" if
   * state already exists there and no env var is set (migration compatibility).
   */
  stateDirPath,

  /**
   * The number of seconds between checks of the host's IP. If the IP has
   * changed, a request to MAM will be performed.
   *
   * Defaults to 300 seconds (5 minutes).
   */
  checkIntervalSeconds: environmentOrFallback(
    "MOUSEHOLE_CHECK_INTERVAL_SECONDS",
    // 5 minutes
    60 * 5,
    (value) => Number.parseFloat(value),
  ),

  /**
   * The number of seconds after which to consider a response stale. After this
   * time, on the next check, a request to MAM will be performed even if the
   * host's IP has not changed.
   *
   * Defaults to 86400 seconds (1 day).
   */
  staleResponseSeconds: environmentOrFallback(
    "MOUSEHOLE_STALE_RESPONSE_SECONDS",
    60 * 60 * 24, // 1 day
    (value) => Number.parseFloat(value),
  ),

  /**
   * The port on which the Mousehole server will listen.
   *
   * Defaults to 5010.
   */
  port: environmentOrFallback("MOUSEHOLE_PORT", 5010, (value) =>
    Number.parseInt(value),
  ),
};
