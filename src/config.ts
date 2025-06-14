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
  userAgent: environmentOrFallback(
    "MOUSEHOLE_USER_AGENT",
    "mousehole-by-timtimtim"
  ),
  stateDirPath: environmentOrFallback("MOUSEHOLE_STATE_DIR_PATH", "/srv/mousehole"),
  updateIntervalMilliseconds: environmentOrFallback(
    "MOUSEHOLE_UPDATE_INTERVAL_MILLISECONDS",
    61 * 60 * 1000,
    (value) => Number.parseInt(value)
  ),
  localTimezone: environmentOrFallback("MOUSEHOLE_TZ", "UTC"),
  port: environmentOrFallback("MOUSEHOLE_PORT", 5010, (value) =>
    Number.parseInt(value)
  ),
};
