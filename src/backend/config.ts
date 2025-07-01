import { version } from "../../package.json";

function environmentOrFallback<T>(
  name: string,
  fallback: T,
  mapFunction?: (s: string) => T
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

export const config = {
  /**
   * The user agent string to use for HTTP requests.
   *
   * Defaults to "mousehole-by-timtimtim".
   */
  userAgent: environmentOrFallback(
    "MOUSEHOLE_USER_AGENT",
    `mousehole-by-timtimtim/${version}`
  ),

  /**
   * The directory path where Mousehole stores its state.
   *
   * Defaults to "/srv/mousehole".
   */
  stateDirPath: environmentOrFallback(
    "MOUSEHOLE_STATE_DIR_PATH",
    "/srv/mousehole"
  ),

  /**
   * The number of seconds between checks of the host's IP. If the IP has
   * changed, a request to MAM will be performed.
   *
   * Defaults to 300 seconds (5 minutes).
   */
  checkIntervalSeconds: environmentOrFallback(
    "MOUSEHOLE_CHECK_INTERVAL_SECONDS",
    5 * 60, // 5 minutes
    (value) => Number.parseFloat(value)
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
    (value) => Number.parseFloat(value)
  ),

  /**
   * The port on which the Mousehole server will listen.
   *
   * Defaults to 5010.
   */
  port: environmentOrFallback("MOUSEHOLE_PORT", 5010, (value) =>
    Number.parseInt(value)
  ),
};